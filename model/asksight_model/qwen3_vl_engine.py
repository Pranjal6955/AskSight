"""Unified Qwen3-VL assistive engine for low-vision and blind users.

Loads Qwen/Qwen3-VL-4B-Instruct as a single unified Vision-Language Model
with optional 4-bit BitsAndBytes quantization, OpenCV quality gate,
dual-mode assistive routing, and clean TTS-ready output decoding.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import torch
from PIL import Image
from transformers import AutoProcessor, BitsAndBytesConfig, Qwen3VLForConditionalGeneration

from .accessibility import (
    DESCRIBE_MODE_SYSTEM_PROMPT,
    GENERATION_KWARGS,
    QUESTION_MODE_SYSTEM_PROMPT,
    clean_tts_text,
    route_request,
)
from .vision_gate import check_image_quality

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ID = "Qwen/Qwen3-VL-4B-Instruct"
MIN_PIXELS = 256 * 32 * 32
MAX_PIXELS = 1024 * 32 * 32


class Qwen3VLAssistiveModel:
    """Unified Vision-Language Model engine powered by Qwen3-VL-4B-Instruct."""

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        load_in_4bit: bool = True,
        device: str | None = None,
        min_pixels: int = MIN_PIXELS,
        max_pixels: int = MAX_PIXELS,
        model: Qwen3VLForConditionalGeneration | None = None,
        processor: AutoProcessor | None = None,
    ) -> None:
        self.model_id = model_id
        self.model_version = model_id
        self.load_in_4bit = load_in_4bit
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        # A QLoRA checkpoint holds adapters, not full weights. Load the pinned
        # base model first, then attach the adapter saved next to its config.
        checkpoint = Path(model_id)
        adapter_dir = (
            str(checkpoint)
            if checkpoint.is_dir() and (checkpoint / "adapter_config.json").is_file()
            else None
        )
        base_model_id = model_id
        if adapter_dir is not None:
            from peft import PeftConfig

            base_model_id = PeftConfig.from_pretrained(adapter_dir).base_model_name_or_path

        if processor is not None:
            self.processor = processor
        else:
            self.processor = AutoProcessor.from_pretrained(
                adapter_dir or base_model_id,
                min_pixels=min_pixels,
                max_pixels=max_pixels,
            )

        if model is not None:
            self.model = model
        else:
            quantization_config = None
            if self.load_in_4bit and torch.cuda.is_available():
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

            self.model = Qwen3VLForConditionalGeneration.from_pretrained(
                base_model_id,
                **load_kwargs,
            )

            if not torch.cuda.is_available():
                self.model.to(self.device)

        if adapter_dir is not None:
            from peft import PeftModel

            self.model = PeftModel.from_pretrained(self.model, adapter_dir)

        self.model.eval()

    def predict(self, image: Image.Image, question: Optional[str] = None) -> str:
        """Run assistive inference on an input image and optional user question."""
        if not isinstance(image, Image.Image):
            raise ValueError(f"image must be a PIL.Image.Image, got {type(image).__name__}")

        image_rgb = image.convert("RGB")

        # Step 1: Pre-inference quality gate check with OpenCV
        is_valid, quality_error = check_image_quality(image_rgb)
        if not is_valid and quality_error is not None:
            return quality_error

        # Step 2: Dual-mode routing & prompt selection
        mode, system_prompt = route_request(question)

        user_content = []
        user_content.append({"type": "image", "image": image_rgb})

        if mode == "describe":
            user_content.append({"type": "text", "text": "Describe this photo."})
        else:
            user_content.append({"type": "text", "text": question.strip()})

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        # Step 3: Apply native chat template
        inputs = self.processor.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
        )

        device = next(self.model.parameters()).device
        inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}

        input_len = inputs["input_ids"].shape[1]

        # Step 4: Deterministic generation
        with torch.no_grad():
            generated_ids = self.model.generate(
                **inputs,
                **GENERATION_KWARGS,
            )

        new_tokens = generated_ids[:, input_len:]
        output_text = self.processor.decode(
            new_tokens[0],
            skip_special_tokens=True,
            clean_up_tokenization_spaces=True,
        )

        # Step 5: Clean output for TTS
        return clean_tts_text(output_text)

    def answer(self, image: Image.Image, question: Optional[str] = None) -> str:
        """Backward-compatible alias for predict."""
        return self.predict(image=image, question=question)
