"""LLaVA-style pipeline: frozen CLIP vision encoder + trainable projection
connector + frozen instruction-tuned LM.

Image features are projected into the LM embedding space and spliced between
the prompt prefix and suffix, so the frozen LM never needs new vocabulary
tokens. Only the connector is trained (B2/B4).
"""

from __future__ import annotations

from pathlib import Path

import torch
import torch.nn as nn
from PIL import Image
from safetensors.torch import load_file, save_file
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    CLIPImageProcessor,
    CLIPVisionModel,
)

from .config import ModelConfig

IMAGE_SENTINEL = "<|asksight_image|>"
PROJECTOR_FILE = "projector.safetensors"
CONFIG_FILE = "config.yaml"

_DTYPES = {"float32": torch.float32, "float16": torch.float16, "bfloat16": torch.bfloat16}


def resolve_device(device: str) -> torch.device:
    if device == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    resolved = torch.device(device)
    if resolved.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError(f"device {device!r} requested but CUDA is not available")
    return resolved


def resolve_dtype(dtype: str, device: torch.device) -> torch.dtype:
    if dtype == "auto":
        if device.type == "cuda" and torch.cuda.is_bf16_supported():
            return torch.bfloat16
        return torch.float32
    if dtype not in _DTYPES:
        raise ValueError(f"unknown dtype {dtype!r}; expected auto or one of {sorted(_DTYPES)}")
    return _DTYPES[dtype]


class Connector(nn.Module):
    """Two-layer MLP mapping CLIP features into the LM embedding space."""

    def __init__(self, in_dim: int, hidden_dim: int, out_dim: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, out_dim),
        )

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return self.net(features)


class AskSightModel(nn.Module):
    def __init__(self, config: ModelConfig, device: str = "auto", dtype: str = "auto") -> None:
        super().__init__()
        self.config = config
        self.device = resolve_device(device)
        self.dtype = resolve_dtype(dtype, self.device)

        self.image_processor = CLIPImageProcessor.from_pretrained(
            config.vision_model, revision=config.vision_revision
        )
        self.vision = CLIPVisionModel.from_pretrained(
            config.vision_model, revision=config.vision_revision
        ).to(self.device, self.dtype)
        self.tokenizer = AutoTokenizer.from_pretrained(config.lm_model, revision=config.lm_revision)
        self.lm = AutoModelForCausalLM.from_pretrained(
            config.lm_model, revision=config.lm_revision
        ).to(self.device, self.dtype)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        hidden = self.lm.config.hidden_size
        # Connector stays float32; only its output is cast to the LM dtype, so
        # optimizer state and gradients are not degraded by bf16 training.
        self.connector = Connector(
            self.vision.config.hidden_size, config.connector_hidden or hidden, hidden
        ).to(self.device, torch.float32)

        # Backbones stay frozen for the initial training stage (B2).
        self.vision.requires_grad_(False)
        self.lm.requires_grad_(False)
        self.vision.eval()
        self.lm.eval()

    def trainable_parameters(self):
        return [p for p in self.connector.parameters() if p.requires_grad]

    def enable_gradient_checkpointing(self) -> None:
        self.lm.gradient_checkpointing_enable()
        self.lm.config.use_cache = False

    # -- prompt assembly -------------------------------------------------

    def _chat_texts(self, question: str, answer: str | None) -> tuple[str, str]:
        """Return (ask_text, full_text).

        `ask_text` ends right after the assistant header (generation prompt);
        `full_text` additionally contains the answer. Both share the image
        sentinel at the same position.
        """
        messages = [
            {"role": "system", "content": self.config.system_prompt},
            {"role": "user", "content": f"{IMAGE_SENTINEL}\n{question}"},
        ]
        ask_text = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        if answer is None:
            return ask_text, ask_text
        full_text = self.tokenizer.apply_chat_template(
            [*messages, {"role": "assistant", "content": answer}], tokenize=False
        )
        if not full_text.startswith(ask_text):
            raise ValueError("chat template is not prefix-stable; cannot align answer labels")
        return ask_text, full_text

    def _tokenize(self, text: str) -> tuple[list[int], list[tuple[int, int]]]:
        enc = self.tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)
        return enc["input_ids"], enc["offset_mapping"]

    def _encode_sample(
        self, question: str, answer: str | None
    ) -> tuple[list[int], list[int], list[int] | None]:
        """Tokenize one sample into prefix ids, suffix ids, and suffix labels."""
        ask_text, full_text = self._chat_texts(question, answer)
        prefix_text, ask_suffix = ask_text.split(IMAGE_SENTINEL, 1)
        prefix_ids, _ = self._tokenize(prefix_text)
        if answer is None:
            suffix_ids, _ = self._tokenize(ask_suffix)
            return prefix_ids, suffix_ids, None

        _, full_suffix = full_text.split(IMAGE_SENTINEL, 1)
        suffix_ids, offsets = self._tokenize(full_suffix)
        suffix_abs_start = len(full_text) - len(full_suffix)
        label_start = len(ask_text) - suffix_abs_start
        label_end = len(full_suffix)
        labels = [
            token_id if (end > label_start and start < label_end) else -100
            for token_id, (start, end) in zip(suffix_ids, offsets, strict=True)
        ]
        if all(label == -100 for label in labels):
            raise ValueError("no answer tokens found in suffix; check chat template and tokenizer")
        return prefix_ids, suffix_ids, labels

    # -- batch construction ----------------------------------------------

    def _image_embeds(self, images: list[Image.Image]) -> torch.Tensor:
        pixel_values = self.image_processor(images=images, return_tensors="pt")["pixel_values"]
        pixel_values = pixel_values.to(self.device, self.dtype)
        with torch.no_grad():  # vision tower is frozen
            features = self.vision(pixel_values=pixel_values).last_hidden_state
        projected = self.connector(features.to(self.connector.net[0].weight.dtype))
        return projected.to(self.lm.dtype)

    def prepare_batch(
        self,
        images: list[Image.Image],
        questions: list[str],
        answers: list[str] | None = None,
    ) -> dict[str, torch.Tensor | None]:
        """Build inputs_embeds/attention_mask/labels for a batch (left-padded)."""
        image_embeds = self._image_embeds(images)  # (B, N, D)
        n_image = image_embeds.shape[1]
        embed_text = self.lm.get_input_embeddings()

        samples = [
            self._encode_sample(q, a)
            for q, a in zip(questions, answers or [None] * len(questions), strict=True)
        ]

        lengths = [len(p) + n_image + len(s) for p, s, _ in samples]
        max_len = max(lengths)
        embeds = torch.zeros(
            len(samples), max_len, image_embeds.shape[-1], dtype=self.lm.dtype, device=self.device
        )
        mask = torch.zeros(len(samples), max_len, dtype=torch.long, device=self.device)
        has_labels = answers is not None
        labels = (
            torch.full((len(samples), max_len), -100, dtype=torch.long, device=self.device)
            if has_labels
            else None
        )

        for i, (prefix_ids, suffix_ids, suffix_labels) in enumerate(samples):
            prefix = embed_text(torch.tensor([prefix_ids], device=self.device))
            suffix = embed_text(torch.tensor([suffix_ids], device=self.device))
            row = torch.cat([prefix, image_embeds[i : i + 1], suffix], dim=1)[0]
            start = max_len - row.shape[0]
            embeds[i, start:] = row
            mask[i, start:] = 1
            if has_labels:
                assert suffix_labels is not None
                labels[i, start + len(prefix_ids) + n_image :] = torch.tensor(
                    suffix_labels, device=self.device
                )

        return {
            "inputs_embeds": embeds.to(self.device),
            "attention_mask": mask.to(self.device),
            "labels": labels.to(self.device) if labels is not None else None,
        }

    # -- forward / generate ----------------------------------------------

    def forward(
        self, images: list[Image.Image], questions: list[str], answers: list[str]
    ) -> torch.Tensor:
        batch = self.prepare_batch(images, questions, answers)
        output = self.lm(
            inputs_embeds=batch["inputs_embeds"],
            attention_mask=batch["attention_mask"],
            labels=batch["labels"],
        )
        return output.loss

    @torch.inference_mode()
    def generate(
        self,
        images: list[Image.Image],
        questions: list[str],
        max_new_tokens: int | None = None,
    ) -> list[str]:
        self.vision.eval()
        self.lm.eval()
        batch = self.prepare_batch(images, questions)
        output = self.lm.generate(
            inputs_embeds=batch["inputs_embeds"],
            attention_mask=batch["attention_mask"],
            max_new_tokens=max_new_tokens or self.config.max_new_tokens,
            do_sample=False,  # greedy: deterministic and reproducible
            pad_token_id=self.tokenizer.pad_token_id or self.tokenizer.eos_token_id,
        )
        return [
            text.strip() for text in self.tokenizer.batch_decode(output, skip_special_tokens=True)
        ]


def save_checkpoint(path: Path, model: AskSightModel) -> None:
    """Save connector weights plus config. Frozen backbones are re-fetched by pin."""
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    state = {k: v.contiguous().cpu() for k, v in model.connector.state_dict().items()}
    save_file(state, str(path / PROJECTOR_FILE))
    model.config.save(path / CONFIG_FILE)


def load_projector(path: Path, model: AskSightModel) -> AskSightModel:
    state = load_file(str(Path(path) / PROJECTOR_FILE))
    model.connector.load_state_dict(state)
    model.connector.to(model.device)
    return model
