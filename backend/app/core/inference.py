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
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # PRD: 10 MB upload limit


class DevMockInferenceService:
    """Placeholder mirroring asksight_model's protocol while Track B trains."""

    model_version = "mock-0.0.0"

    def answer(self, image, question: str) -> str:
        return f"[mock answer] {question.strip()}"


@lru_cache(maxsize=1)
def get_inference_service():
    checkpoint_dir = os.getenv(MODEL_CHECKPOINT_ENV)
    if not checkpoint_dir:
        return DevMockInferenceService()

    try:
        # String import so static type checkers do not require the model
        # package (torch) inside the backend venv; fail loudly if used anyway.
        asksight_model = importlib.import_module("asksight_model")
    except ImportError as exc:
        raise RuntimeError(
            f"{MODEL_CHECKPOINT_ENV} is set to '{checkpoint_dir}' but the asksight_model"
            " package is not installed in this venv. Run"
            " `pip install -e ../model` (installs torch) or unset"
            f" {MODEL_CHECKPOINT_ENV} to keep the mock."
        ) from exc

    return asksight_model.LocalInferenceService(checkpoint_dir)
