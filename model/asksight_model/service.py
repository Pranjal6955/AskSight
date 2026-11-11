"""Inference services behind one interface (B5).

Track A codes against `InferenceService`. `MockInferenceService` keeps the full
flow demoable before a trained checkpoint exists; `LocalInferenceService` loads
a checkpoint once at construction and is what production uses after training.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Protocol

from PIL import Image

from .config import ModelConfig
from .pipeline import CONFIG_FILE, AskSightModel, load_projector, resolve_device

# Returned when the model produces no usable output. AskSight must not assert a
# confident answer it does not have (README promise); a calibrated confidence
# score is intentionally NOT invented here (B5/A6).
CLARIFY_ANSWER = "Sorry, I could not find a clear answer. Could you ask again in different words?"

MAX_QUESTION_CHARS = 500


class InferenceService(Protocol):
    model_version: str

    def answer(self, image: Image.Image, question: str) -> str: ...


def validate_inputs(image: Image.Image, question: str) -> Image.Image:
    """Shared input checks; returns the image converted to RGB."""
    if not isinstance(image, Image.Image):
        raise ValueError(f"image must be a PIL.Image.Image, got {type(image).__name__}")
    if not isinstance(question, str) or not question.strip():
        raise ValueError("question must be a non-empty string")
    if len(question) > MAX_QUESTION_CHARS:
        raise ValueError(f"question exceeds {MAX_QUESTION_CHARS} characters")
    try:
        return image.convert("RGB")
    except Exception as exc:  # unreadable/corrupt image data
        raise ValueError(f"could not read image: {exc}") from exc


class MockInferenceService:
    """Deterministic stand-in for development and tests. Not a real model."""

    model_version = "mock-0.0.0"

    def answer(self, image: Image.Image, question: str) -> str:
        validate_inputs(image, question)
        return f"[mock answer] {question.strip()}"


class LocalInferenceService:
    """Loads a trained checkpoint once; answers with the real pipeline."""

    def __init__(self, checkpoint_dir: str | Path, device: str = "auto", dtype: str = "auto"):
        self.checkpoint_dir = Path(checkpoint_dir)
        config_path = self.checkpoint_dir / CONFIG_FILE
        if not config_path.exists():
            raise FileNotFoundError(
                f"no checkpoint config at {config_path}; train one first "
                "(see model/README.md) or use MockInferenceService"
            )
        resolve_device(device)  # fail fast with a clear error
        config = ModelConfig.load(config_path)
        self.model = AskSightModel(config, device=device, dtype=dtype)
        load_projector(self.checkpoint_dir, self.model)
        self.model.eval()
        self._lock = threading.Lock()  # one generation at a time; serve via a pool if needed
        self.model_version = config.version

    def answer(self, image: Image.Image, question: str) -> str:
        prepared = validate_inputs(image, question)
        with self._lock:
            output = self.model.generate(
                [prepared], [question.strip()], max_new_tokens=self.model.config.max_new_tokens
            )[0]
        return output or CLARIFY_ANSWER
