"""Model inference provider for /ask.

Three backends, in precedence order:
  ASKSIGHT_HF_SPACE_URL  -> proxy to the Hugging Face Space (no local torch)
  ASKSIGHT_MODEL_CHECKPOINT -> load asksight_model locally
  neither                -> development mock

torch is only imported for a local checkpoint, so a small API host can serve
the real model through the Space.
"""

import importlib
import io
import json
import os
import re
import sys
from functools import lru_cache
from pathlib import Path

import httpx

MODEL_CHECKPOINT_ENV = "ASKSIGHT_MODEL_CHECKPOINT"
HF_SPACE_URL_ENV = "ASKSIGHT_HF_SPACE_URL"
HF_TOKEN_ENV = "HF_TOKEN"
HF_MODEL_ID_ENV = "ASKSIGHT_MODEL_ID"
DEFAULT_HF_MODEL_ID = "Qwen/Qwen3-VL-4B-Instruct"
HF_TIMEOUT_SECONDS = 80.0
MAX_QUESTION_CHARS = 500

_COMPLETE_EVENT = re.compile(r"(?:^|\n)event: complete\r?\ndata: (.+)")
_ERROR_EVENT = re.compile(r"(?:^|\n)event: error\r?\ndata: (.+)")

# A failed load is remembered too: retrying a multi-GB download on every
# request would block the async server and hide the real error behind a 500.
_load_error: RuntimeError | None = None
_service: object | None = None


class InferenceUnavailable(Exception):
    """The remote model could not answer right now."""


class DevMockInferenceService:
    """Placeholder mirroring asksight_model's protocol while Track B trains."""

    model_version = "mock-0.0.0"
    protocol_version = "1"
    ready = True

    def answer(self, image, question: str | None = None) -> str:
        if question is None or not question.strip():
            return "[mock answer] A clear walkway ahead with an obstacle at 2 o'clock."
        return f"[mock answer] {question.strip()}"

    def stats(self) -> dict:
        return {"model_version": self.model_version, "ready": True}


class HuggingFaceInferenceService:
    """Proxy to a Gradio Space running asksight_model.

    The Space owns the GPU; this class only moves bytes and parses the SSE
    response, so the API host needs no torch install.
    """

    protocol_version = "1"

    def __init__(
        self,
        space_url: str,
        token: str | None = None,
        timeout: float = HF_TIMEOUT_SECONDS,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.space_url = space_url.rstrip("/")
        self.model_version = os.getenv(HF_MODEL_ID_ENV, DEFAULT_HF_MODEL_ID)
        self.ready = True
        self._headers = {"Authorization": f"Bearer {token}"} if token else {}
        self._timeout = timeout
        self._transport = transport
        self._requests = 0
        self._failures = 0

    def stats(self) -> dict:
        return {
            "model_version": self.model_version,
            "ready": self.ready,
            "requests": self._requests,
            "failures": self._failures,
        }

    def answer(self, image, question: str | None = None) -> str:
        self._requests += 1
        try:
            return self._ask(image, (question or "").strip())
        except (InferenceUnavailable, TimeoutError):
            self._failures += 1
            raise

    def _ask(self, image, question: str) -> str:
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="JPEG", quality=90)

        try:
            with httpx.Client(
                timeout=self._timeout,
                headers=self._headers,
                transport=self._transport,
            ) as client:
                upload = client.post(
                    f"{self.space_url}/gradio_api/upload",
                    files={"files": ("image.jpg", buffer.getvalue(), "image/jpeg")},
                )
                upload.raise_for_status()
                paths = upload.json()
                if not isinstance(paths, list) or not paths:
                    raise InferenceUnavailable("The model did not accept the image.")

                call = client.post(
                    f"{self.space_url}/gradio_api/call/v2/answer",
                    json={
                        "image": {
                            "path": paths[0],
                            "meta": {"_type": "gradio.FileData"},
                        },
                        "question": question,
                    },
                )
                call.raise_for_status()
                payload = call.json()
                event_id = payload.get("event_id") if isinstance(payload, dict) else None
                if not event_id:
                    raise InferenceUnavailable("The model did not return a request id.")

                result = client.get(f"{self.space_url}/gradio_api/call/answer/{event_id}")
                result.raise_for_status()
        except httpx.TimeoutException as exc:
            raise TimeoutError("The model took too long to answer.") from exc
        except httpx.HTTPError as exc:
            raise InferenceUnavailable("The model could not be reached.") from exc
        except (ValueError, TypeError) as exc:
            raise InferenceUnavailable("The model returned an unreadable response.") from exc

        return self._read_answer(result.text)

    @staticmethod
    def _read_answer(stream: str) -> str:
        complete = _COMPLETE_EVENT.search(stream)
        if complete is None:
            error = _ERROR_EVENT.search(stream)
            if error is not None:
                raise InferenceUnavailable(error.group(1))
            raise InferenceUnavailable("The model did not finish answering.")
        try:
            outputs = json.loads(complete.group(1))
        except json.JSONDecodeError as exc:
            raise InferenceUnavailable("The model returned an unreadable response.") from exc
        if not isinstance(outputs, list) or not outputs or not isinstance(outputs[0], str):
            raise InferenceUnavailable("The model returned an empty answer.")
        return outputs[0]


@lru_cache(maxsize=1)
def get_inference_service():
    """Return the cached inference service, or raise a cached load error."""
    global _load_error
    if _load_error is not None:
        raise _load_error

    global _service

    hf_space_url = os.getenv(HF_SPACE_URL_ENV)
    if hf_space_url:
        _service = HuggingFaceInferenceService(
            hf_space_url,
            token=os.getenv(HF_TOKEN_ENV) or None,
        )
        return _service

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
