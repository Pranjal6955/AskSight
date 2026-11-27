"""Single-stage assistive QLoRA fine-tuning for Qwen3-VL-4B-Instruct.

Freezes the vision encoder (model.visual) and trains PEFT LoRA adapters
(r=16, lora_alpha=32, lora_dropout=0.05) in bfloat16 on the language decoder.

Blends VizWiz-VQA (preserving unanswerable/blurry refusal examples for safe abstention)
with TextVQA / DocVQA (for small-print OCR accuracy on labels/receipts).
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import Counter
from pathlib import Path
from typing import Any

import torch
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from PIL import Image, ImageOps
from torch.utils.data import Dataset
from transformers import (
    AutoProcessor,
    BitsAndBytesConfig,
    Qwen3VLForConditionalGeneration,
    Trainer,
    TrainingArguments,
)

from .accessibility import (
    DESCRIBE_MODE_SYSTEM_PROMPT,
    QUESTION_MODE_SYSTEM_PROMPT,
    clean_tts_text,
)

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ID = "Qwen/Qwen3-VL-4B-Instruct"
LORA_TARGET_MODULES = [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
]


class AssistiveMultimodalDataset(Dataset):
    """Blended dataset of VizWiz-VQA, TextVQA, and DocVQA formatted for assistive use."""

    def __init__(
        self,
        samples: list[dict[str, Any]],
        processor: AutoProcessor,
    ) -> None:
        self.samples = samples
        self.processor = processor

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict[str, Any]:
        item = self.samples[idx]
        image_value = item.get("image_path") or item.get("image")
        if isinstance(image_value, dict):
            image_value = image_value.get("path") or image_value.get("image_path")
        if isinstance(image_value, Image.Image):
            image = ImageOps.exif_transpose(image_value).convert("RGB")
        elif isinstance(image_value, str) and image_value.strip():
            image_path = Path(image_value).expanduser()
            if not image_path.is_file():
                raise ValueError(f"sample {idx}: image file does not exist: {image_path}")
            try:
                with Image.open(image_path) as opened:
                    image = ImageOps.exif_transpose(opened).convert("RGB")
            except OSError as exc:
                raise ValueError(f"sample {idx}: could not read image: {image_path}") from exc
        else:
            raise ValueError(
                f"sample {idx}: expected an existing image_path or image file path; "
                "refusing to train on a placeholder image"
            )

        question_value = item.get("question", "")
        if question_value is None:
            question_value = ""
        if not isinstance(question_value, str):
            raise ValueError(f"sample {idx}: question must be a string")
        question = question_value.strip()

        answer_value = item.get("answer")
        if answer_value is None:
            answer_value = item.get("answers")
        if isinstance(answer_value, list):
            answer_candidates = [
                value.get("answer") if isinstance(value, dict) else value
                for value in answer_value
            ]
            answer_candidates = [
                value.strip()
                for value in answer_candidates
                if isinstance(value, str) and value.strip()
            ]
            answer = Counter(answer_candidates).most_common(1)[0][0] if answer_candidates else ""
        elif isinstance(answer_value, str):
            answer = answer_value.strip()
        else:
            answer = ""

        answer_type = str(item.get("answer_type", "")).strip().lower()
        answerable_value = item.get("answerable")
        is_unanswerable = (
            item.get("unanswerable") is True
            or answerable_value is False
            or answerable_value == 0
            or answer_type in {"unanswerable", "unanswerable answer"}
            or answer.strip().lower() == "unanswerable"
        )
        if is_unanswerable:
            answer = (
                "The image is unclear or cut off. Please adjust the camera angle and try again."
            )
        if not answer:
            raise ValueError(
                f"sample {idx}: no non-empty answer or unanswerable marker was provided"
            )

        is_describe = not question or question.lower() in [
            "describe",
            "describe this photo.",
        ]
        system_prompt = DESCRIBE_MODE_SYSTEM_PROMPT if is_describe else QUESTION_MODE_SYSTEM_PROMPT
        user_query = "Describe this photo." if is_describe else question

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": user_query},
                ],
            },
            {
                "role": "assistant",
                "content": [{"type": "text", "text": clean_tts_text(answer)}],
            },
        ]

        text = self.processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=False
        )
        inputs = self.processor(
            text=[text],
            images=[image],
            return_tensors="pt",
            padding=True,
        )

        prompt_text = self.processor.apply_chat_template(
            messages[:-1], tokenize=False, add_generation_prompt=True
        )
        prompt_inputs = self.processor(
            text=[prompt_text],
            images=[image],
            return_tensors="pt",
        )

        # Qwen3-VL flattens an image's patches into pixel_values. Only the
        # token tensors have a leading batch dimension of one; indexing every
        # tensor at [0] would silently discard all but the first image patch.
        sample_inputs: dict[str, torch.Tensor] = {}
        for key, value in inputs.items():
            if key in {"input_ids", "attention_mask", "token_type_ids"}:
                sample_inputs[key] = value[0]
            else:
                sample_inputs[key] = value

        labels = sample_inputs["input_ids"].clone()
        prompt_length = prompt_inputs["input_ids"].shape[1]
        if prompt_length > labels.shape[0]:
            raise ValueError(f"sample {idx}: prompt tokens exceed full conversation tokens")
        labels[:prompt_length] = -100
        sample_inputs["labels"] = labels
        return sample_inputs


class Qwen3VLCollator:
    """Pad text targets and concatenate Qwen3-VL's flattened image patches."""

    def __init__(self, processor: AutoProcessor) -> None:
        self.pad_token_id = processor.tokenizer.pad_token_id
        if self.pad_token_id is None:
            self.pad_token_id = processor.tokenizer.eos_token_id
        if self.pad_token_id is None:
            raise ValueError("the tokenizer must define a pad_token_id or eos_token_id")

    def __call__(self, features: list[dict[str, torch.Tensor]]) -> dict[str, torch.Tensor]:
        max_length = max(feature["input_ids"].shape[0] for feature in features)
        batch_size = len(features)
        input_ids = torch.full(
            (batch_size, max_length), self.pad_token_id, dtype=features[0]["input_ids"].dtype
        )
        attention_mask = torch.zeros((batch_size, max_length), dtype=torch.long)
        labels = torch.full((batch_size, max_length), -100, dtype=features[0]["labels"].dtype)

        for row, feature in enumerate(features):
            length = feature["input_ids"].shape[0]
            input_ids[row, :length] = feature["input_ids"]
            attention_mask[row, :length] = feature.get(
                "attention_mask", torch.ones(length, dtype=torch.long)
            )
            labels[row, :length] = feature["labels"]

        batch: dict[str, torch.Tensor] = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "labels": labels,
        }
        for key in ("pixel_values", "image_grid_thw"):
            values = [feature[key] for feature in features if key in feature]
            if len(values) != batch_size:
                raise ValueError(f"every multimodal sample must include {key}")
            batch[key] = torch.cat(values, dim=0)
        return batch


def build_lora_config(
    r: int = 16,
    lora_alpha: int = 32,
    lora_dropout: float = 0.05,
    target_modules: list[str] | None = None,
) -> LoraConfig:
    """Create PEFT LoRA configuration targeting the language decoder."""
    return LoraConfig(
        r=r,
        lora_alpha=lora_alpha,
        lora_dropout=lora_dropout,
        target_modules=target_modules or LORA_TARGET_MODULES,
        bias="none",
        task_type="CAUSAL_LM",
    )


def setup_model_and_lora(
    model_id: str = DEFAULT_MODEL_ID,
    load_in_4bit: bool = True,
    lora_config: LoraConfig | None = None,
) -> tuple[Any, AutoProcessor]:
    """Load model with 4-bit quantization, freeze visual encoder, and attach LoRA."""
    processor = AutoProcessor.from_pretrained(
        model_id,
        min_pixels=256 * 32 * 32,
        max_pixels=1024 * 32 * 32,
    )

    use_bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
    compute_dtype = torch.bfloat16 if use_bf16 else torch.float16
    quantization_config = None
    if load_in_4bit and torch.cuda.is_available():
        quantization_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=compute_dtype,
        )

    load_kwargs = {
        "torch_dtype": compute_dtype if torch.cuda.is_available() else torch.float32,
        "device_map": "auto" if torch.cuda.is_available() else None,
    }
    if quantization_config is not None:
        load_kwargs["quantization_config"] = quantization_config

    model = Qwen3VLForConditionalGeneration.from_pretrained(
        model_id,
        **load_kwargs,
    )

    if load_in_4bit and torch.cuda.is_available():
        model = prepare_model_for_kbit_training(model)

    if hasattr(model, "visual") and model.visual is not None:
        for param in model.visual.parameters():
            param.requires_grad = False
        logger.info("Froze vision encoder (model.visual).")

    if lora_config is None:
        lora_config = build_lora_config()

    peft_model = get_peft_model(model, lora_config)
    peft_model.print_trainable_parameters()

    return peft_model, processor


def train_qlora(
    output_dir: str = "./checkpoints/qwen3_vl_qlora",
    model_id: str = DEFAULT_MODEL_ID,
    vizwiz_path: str | None = None,
    textvqa_path: str | None = None,
    docvqa_path: str | None = None,
    epochs: int = 3,
    batch_size: int = 2,
    gradient_accumulation_steps: int = 8,
    lr: float = 2e-4,
) -> None:
    """Run QLoRA training loop."""
    if epochs < 1 or batch_size < 1 or gradient_accumulation_steps < 1:
        raise ValueError("epochs, batch_size, and gradient_accumulation_steps must be positive")

    samples: list[dict] = []

    def _read_data(path_str: str | None, tag: str):
        if not path_str:
            return
        p = Path(path_str)
        if not p.is_file():
            raise FileNotFoundError(f"{tag} dataset file does not exist: {p}")
        if p.suffix == ".jsonl":
            with open(p, encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        item = json.loads(line)
                        if not isinstance(item, dict):
                            raise ValueError(f"{p}: each JSONL row must be an object")
                        item["source"] = tag
                        samples.append(item)
        elif p.suffix == ".json":
            with open(p, encoding="utf-8") as f:
                content = json.load(f)
                if isinstance(content, list):
                    for item in content:
                        if not isinstance(item, dict):
                            raise ValueError(f"{p}: each dataset row must be an object")
                        item["source"] = tag
                        samples.append(item)
                else:
                    raise ValueError(f"{p}: expected a JSON array or JSONL file")
        else:
            raise ValueError(f"{p}: dataset must use .json or .jsonl")

    _read_data(vizwiz_path, "vizwiz")
    _read_data(textvqa_path, "textvqa")
    _read_data(docvqa_path, "docvqa")

    if not samples:
        logger.warning("No dataset samples loaded; provide --vizwiz, --textvqa, or --docvqa paths.")
        return

    if not torch.cuda.is_available():
        raise RuntimeError("QLoRA training requires a CUDA GPU; CPU training cannot fit this model")

    model, processor = setup_model_and_lora(model_id=model_id, load_in_4bit=True)
    train_dataset = AssistiveMultimodalDataset(samples, processor)
    use_bf16 = torch.cuda.is_bf16_supported()
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=gradient_accumulation_steps,
        learning_rate=lr,
        bf16=use_bf16,
        fp16=not use_bf16,
        logging_steps=10,
        save_strategy="epoch",
        dataloader_num_workers=2,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        data_collator=Qwen3VLCollator(processor),
    )
    trainer.train()
    model.save_pretrained(output_dir)
    processor.save_pretrained(output_dir)
    logger.info(f"Saved QLoRA adapters and processor to {output_dir}")


def main():
    parser = argparse.ArgumentParser(description="Single-Stage Assistive QLoRA Training")
    parser.add_argument("--output_dir", default="./checkpoints/qwen3_vl_qlora")
    parser.add_argument("--model_id", default=DEFAULT_MODEL_ID)
    parser.add_argument("--vizwiz_path", default=None)
    parser.add_argument("--textvqa_path", default=None)
    parser.add_argument("--docvqa_path", default=None)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--lr", type=float, default=2e-4)
    args = parser.parse_args()

    train_qlora(
        output_dir=args.output_dir,
        model_id=args.model_id,
        vizwiz_path=args.vizwiz_path,
        textvqa_path=args.textvqa_path,
        docvqa_path=args.docvqa_path,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
    )


if __name__ == "__main__":
    main()
