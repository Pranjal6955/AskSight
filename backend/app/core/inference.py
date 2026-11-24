"""Model inference provider for /ask.

Serves a lightweight dev mock until a trained checkpoint exists; set
ASKSIGHT_MODEL_CHECKPOINT to a checkpoint directory to load the real model.
torch is only imported in that case, so the auth dev environment stays light.
"""

import importlib
import os
from functools import lru_cache

MODEL_CHECKPOINT_ENV = "ASKSIGHT_MODEL_CHECKPOINT"
MAX_QUESTION_CHARS = 500


class DevMockInferenceService:
    """Placeholder mirroring asksight_model's protocol while Track B trains."""

    model_version = "mock-0.0.0"
    protocol_version = "1"
    ready = True

    def answer(self, image, question: str) -> str:
        return f"[mock answer] {question.strip()}"

    def stats(self) -> dict:
        return {"model_version": self.model_version, "ready": True}


@lru_cache(maxsize=1)
def get_inference_service():
    checkpoint_dir = os.getenv(MODEL_CHECKPOINT_ENV)
    if not checkpoint_dir:
        return DevMockInferenceService()

    try:
        import sys
        from pathlib import Path
        model_dir = str(Path(__file__).resolve().parents[3] / "model")
        if model_dir not in sys.path:
            sys.path.insert(0, model_dir)

        import asksight_model
        return asksight_model.LocalInferenceService()
    except ImportError as exc:
        raise RuntimeError(
            f"{MODEL_CHECKPOINT_ENV} is set to '{checkpoint_dir}' but asksight_model"
            " could not be loaded. Run `pip install -e ../model` or unset"
            f" {MODEL_CHECKPOINT_ENV} to keep the mock."
        ) from exc
