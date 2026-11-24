"""Inference services for AskSight powered by Qwen3-VL-4B-Instruct.

Supports MockInferenceService (dev/tests) and LocalInferenceService (Qwen3VLAssistiveModel).
Includes pre-inference OpenCV quality gating, dual-mode assistive routing, and TTS sanitization.
"""

from __future__ import annotations

import logging
import resource
import statistics
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Optional, Protocol

from PIL import Image

from .accessibility import clean_tts_text
from .qwen3_vl_engine import Qwen3VLAssistiveModel
from .vision_gate import check_image_quality

logger = logging.getLogger(__name__)

CLARIFY_ANSWER = "Sorry, I could not find a clear answer. Could you ask again in different words?"
MAX_QUESTION_CHARS = 500
PROTOCOL_VERSION = "2"
STATS_WINDOW = 1024


class InferenceService(Protocol):
    model_version: str
    protocol_version: str

    def answer(self, image: Image.Image, question: Optional[str] = None) -> str: ...


def validate_inputs(image: Image.Image, question: Optional[str] = None) -> Image.Image:
    """Shared input checks; returns image converted to RGB."""
    if not isinstance(image, Image.Image):
        raise ValueError(f"image must be a PIL.Image.Image, got {type(image).__name__}")
    if question is not None:
        if not isinstance(question, str):
            raise ValueError(f"question must be a string or None, got {type(question).__name__}")
        if len(question) > MAX_QUESTION_CHARS:
            raise ValueError(f"question exceeds {MAX_QUESTION_CHARS} characters")
    try:
        return image.convert("RGB")
    except Exception as exc:
        raise ValueError(f"could not read image: {exc}") from exc


def _percentiles(values: list[float]) -> tuple[float | None, float | None]:
    if not values:
        return None, None
    ordered = sorted(values)
    return (
        round(statistics.median(ordered), 3),
        round(ordered[int(0.95 * (len(ordered) - 1))], 3),
    )


def _process_rss_mb() -> float | None:
    try:
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    except (AttributeError, OSError):
        return None
    return round(rss / (1024 * 1024), 1) if sys.platform == "darwin" else round(rss / 1024, 1)


class MockInferenceService:
    """Deterministic stand-in for development and testing without loading GPU weights."""

    model_version = "mock-qwen3-vl-4b"
    protocol_version = PROTOCOL_VERSION

    def answer(self, image: Image.Image, question: Optional[str] = None) -> str:
        validate_inputs(image, question)
        is_valid, quality_error = check_image_quality(image)
        if not is_valid and quality_error is not None:
            return quality_error
        if question is None or not question.strip():
            return "A clear walkway ahead with an obstacle at 2 o'clock."
        return f"[mock answer] {question.strip()}"

    def predict(self, image: Image.Image, question: Optional[str] = None) -> str:
        return self.answer(image, question)


class LocalInferenceService:
    """Unified Qwen3-VL-4B-Instruct Local Inference Service.

    Thread-safe concurrency control, operational metrics, and OpenCV gate.
    """

    protocol_version = PROTOCOL_VERSION

    def __init__(
        self,
        checkpoint_dir: str | Path | None = None,
        model_id: str = "Qwen/Qwen3-VL-4B-Instruct",
        load_in_4bit: bool = True,
        device: str | None = None,
        max_concurrency: int = 1,
        queue_timeout_s: float | None = 30.0,
        model: Any = None,
        processor: Any = None,
    ):
        started = time.perf_counter()
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be at least 1")
        if queue_timeout_s is not None and queue_timeout_s < 0:
            raise ValueError("queue_timeout_s must be non-negative or None")

        self.model_version = model_id
        self._max_concurrency = max_concurrency
        self._queue_timeout_s = queue_timeout_s
        self._slots = threading.BoundedSemaphore(max_concurrency)

        self._stats_lock = threading.Lock()
        self._requests = 0
        self._failures = 0
        self._timeouts = 0
        self._latencies: deque[float] = deque(maxlen=STATS_WINDOW)
        self._queue_times: deque[float] = deque(maxlen=STATS_WINDOW)
        self._generation_times: deque[float] = deque(maxlen=STATS_WINDOW)
        self._ready = False
        self.startup_seconds = 0.0

        # Instantiate unified Qwen3-VL model
        self.model = Qwen3VLAssistiveModel(
            model_id=model_id,
            load_in_4bit=load_in_4bit,
            device=device,
            model=model,
            processor=processor,
        )
        self._ready = True
        self.startup_seconds = round(time.perf_counter() - started, 3)

    @property
    def ready(self) -> bool:
        return self._ready

    def _count_request(self) -> None:
        with self._stats_lock:
            self._requests += 1

    def _count_failure(self, timeout: bool = False) -> None:
        with self._stats_lock:
            self._failures += 1
            if timeout:
                self._timeouts += 1

    def _record_timing(
        self, queue_s: float, generation_s: float, total_s: float, failed: bool
    ) -> None:
        with self._stats_lock:
            if failed:
                self._failures += 1
            self._queue_times.append(queue_s)
            self._generation_times.append(generation_s)
            self._latencies.append(total_s)

    def stats(self) -> dict:
        with self._stats_lock:
            requests = self._requests
            failures = self._failures
            timeouts = self._timeouts
            queue_times = list(self._queue_times)
            generation_times = list(self._generation_times)
            latencies = list(self._latencies)
        queue_median, queue_p95 = _percentiles(queue_times)
        generation_median, generation_p95 = _percentiles(generation_times)
        latency_median, latency_p95 = _percentiles(latencies)
        return {
            "protocol_version": self.protocol_version,
            "model_version": self.model_version,
            "ready": self.ready,
            "startup_seconds": self.startup_seconds,
            "process_rss_mb": _process_rss_mb(),
            "max_concurrency": self._max_concurrency,
            "queue_timeout_s": self._queue_timeout_s,
            "requests": requests,
            "failures": failures,
            "timeouts": timeouts,
            "queue_time_median_s": queue_median,
            "queue_time_p95_s": queue_p95,
            "generation_time_median_s": generation_median,
            "generation_time_p95_s": generation_p95,
            "latency_median_s": latency_median,
            "latency_p95_s": latency_p95,
        }

    def answer(self, image: Image.Image, question: Optional[str] = None) -> str:
        self._count_request()
        try:
            prepared = validate_inputs(image, question)
        except Exception:
            self._count_failure()
            raise

        started = time.perf_counter()
        if self._queue_timeout_s is None:
            self._slots.acquire()
            acquired = True
        else:
            acquired = self._slots.acquire(timeout=self._queue_timeout_s)

        if not acquired:
            self._count_failure(timeout=True)
            raise TimeoutError(
                f"inference queue wait exceeded {self._queue_timeout_s}s"
                f" (max_concurrency={self._max_concurrency})"
            )
        queued = time.perf_counter() - started

        gen_start = time.perf_counter()
        failed = False
        try:
            output = self.model.predict(image=prepared, question=question)
        except Exception:
            failed = True
            raise
        finally:
            self._slots.release()
            self._record_timing(
                queued,
                time.perf_counter() - gen_start,
                time.perf_counter() - started,
                failed,
            )
        return output or CLARIFY_ANSWER

    def predict(self, image: Image.Image, question: Optional[str] = None) -> str:
        return self.answer(image, question)
