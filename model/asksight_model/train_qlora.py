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
from pathlib import Path
from typing import Any

import torch
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from PIL import Image
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
        image_path = item.get("image_path")
        if isinstance(image_path, str) and Path(image_path).exists():
            image = Image.open(image_path).convert("RGB")
        else:
            image = item.get("image")
            if image is None:
                image = Image.new("RGB", (224, 224), color=(128, 128, 128))

        question = item.get("question", "")
        answer = item.get("answer", "")
        is_unanswerable = item.get("unanswerable", False)
        if is_unanswerable and not answer:
            answer = (
                "The image is unclear or cut off. Please adjust the camera angle and try again."
            )

        is_describe = not question or question.strip().lower() in [
            "describe",
            "describe this photo.",
        ]
        system_prompt = DESCRIBE_MODE_SYSTEM_PROMPT if is_describe else QUESTION_MODE_SYSTEM_PROMPT
        user_query = "Describe this photo." if is_describe else question.strip()

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

        text = self.processor.apply_chat_template(messages, tokenize=False)
        inputs = self.processor(
            text=[text],
            images=[image],
            return_tensors="pt",
            padding=True,
        )

        sample_inputs = {k: v[0] for k, v in inputs.items()}
        labels = sample_inputs["input_ids"].clone()
        sample_inputs["labels"] = labels
        return sample_inputs


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

    quantization_config = None
    if load_in_4bit and torch.cuda.is_available():
        quantization_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
        )

    load_kwargs = {
        "torch_dtype": torch.bfloat16,
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
    model, processor = setup_model_and_lora(model_id=model_id, load_in_4bit=True)
    samples: list[dict] = []

    def _read_data(path_str: str | None, tag: str):
        if not path_str:
            return
        p = Path(path_str)
        if not p.exists():
            return
        if p.suffix == ".jsonl":
            with open(p, encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        item = json.loads(line)
                        item["source"] = tag
                        samples.append(item)
        elif p.suffix == ".json":
            with open(p, encoding="utf-8") as f:
                content = json.load(f)
                if isinstance(content, list):
                    for item in content:
                        item["source"] = tag
                        samples.append(item)

    _read_data(vizwiz_path, "vizwiz")
    _read_data(textvqa_path, "textvqa")
    _read_data(docvqa_path, "docvqa")

    if not samples:
        logger.warning("No dataset samples loaded; provide --vizwiz, --textvqa, or --docvqa paths.")
        return

    train_dataset = AssistiveMultimodalDataset(samples, processor)
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=gradient_accumulation_steps,
        learning_rate=lr,
        bf16=True,
        logging_steps=10,
        save_strategy="epoch",
        dataloader_num_workers=2,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
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
