"""Model inference provider for /ask.

Serves a lightweight dev mock until a trained checkpoint exists; set
ASKSIGHT_MODEL_CHECKPOINT to a checkpoint directory to load the real model.
torch is only imported in that case, so the auth dev environment stays light.
"""

import importlib
import os
import sys
from functools import lru_cache
from pathlib import Path

MODEL_CHECKPOINT_ENV = "ASKSIGHT_MODEL_CHECKPOINT"
MAX_QUESTION_CHARS = 500

# A failed load is remembered too: retrying a multi-GB download on every
# request would block the async server and hide the real error behind a 500.
_load_error: RuntimeError | None = None
_service: object | None = None


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
    """Return the cached inference service, or raise a cached load error."""
    global _load_error
    if _load_error is not None:
        raise _load_error

    global _service

    checkpoint_dir = os.getenv(MODEL_CHECKPOINT_ENV)
    if not checkpoint_dir:
        _service = DevMockInferenceService()
        return _service

    try:
        model_dir = str(Path(__file__).resolve().parents[2] / "model")
        if model_dir not in sys.path:
            sys.path.insert(0, model_dir)
        model_package = importlib.import_module("asksight_model")
        _service = model_package.LocalInferenceService(checkpoint_dir=checkpoint_dir)
        return _service
    except Exception as exc:
        if isinstance(exc, ImportError):
            message = (
                f"{MODEL_CHECKPOINT_ENV} is set to '{checkpoint_dir}' but asksight_model"
                " could not be loaded. Run `pip install -e model` or unset"
                f" {MODEL_CHECKPOINT_ENV} to keep the mock."
            )
        else:
            message = f"{MODEL_CHECKPOINT_ENV}='{checkpoint_dir}' could not be loaded: {exc}"
        _load_error = RuntimeError(message)
        raise _load_error from exc


def clear_cache() -> None:
    """Forget the cached service and any cached load error."""
    global _load_error, _service
    _load_error = None
    _service = None
    get_inference_service.cache_clear()


def cached_service() -> object | None:
    """The already-created service, or None. Never starts a load."""
    return _service


def inference_status() -> tuple[object | None, RuntimeError | None]:
    """Cached service and error, without starting a new load."""
    try:
        return get_inference_service(), None
    except RuntimeError as err:
        return None, err
