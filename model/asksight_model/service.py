"""Inference services behind one interface (B5).

Track A codes against `InferenceService`. `MockInferenceService` keeps the full
flow demoable before a trained checkpoint exists; `LocalInferenceService` loads
a checkpoint once at construction and is what production uses after training.

Protocol (version `PROTOCOL_VERSION`): `answer()` returns English answer text
and raises `ValueError` for invalid input, `TimeoutError` when the queue wait
exceeds `queue_timeout_s`, and `RuntimeError`/`ValueError` at startup for an
unusable checkpoint. There is deliberately no confidence field.
"""

from __future__ import annotations

import resource
import statistics
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Protocol

from PIL import Image

from .config import ModelConfig
from .pipeline import (
    CONFIG_FILE,
    AskSightModel,
    load_projector,
    resolve_device,
    verify_checkpoint,
)

# Returned when the model produces no usable output. AskSight must not assert a
# confident answer it does not have (README promise); a calibrated confidence
# score is intentionally NOT invented here (B5/A6).
CLARIFY_ANSWER = "Sorry, I could not find a clear answer. Could you ask again in different words?"

MAX_QUESTION_CHARS = 500
PROTOCOL_VERSION = "1"

# Percentiles are computed over a bounded recent window, not unbounded history.
STATS_WINDOW = 1024


class InferenceService(Protocol):
    model_version: str
    protocol_version: str

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
    # shortcut: ru_maxrss is KiB on Linux, bytes on macOS; serving target is Linux.
    return round(rss / (1024 * 1024), 1) if sys.platform == "darwin" else round(rss / 1024, 1)


class MockInferenceService:
    """Deterministic stand-in for development and tests. Not a real model."""

    model_version = "mock-0.0.0"
    protocol_version = PROTOCOL_VERSION

    def answer(self, image: Image.Image, question: str) -> str:
        validate_inputs(image, question)
        return f"[mock answer] {question.strip()}"


class LocalInferenceService:
    """Loads a trained checkpoint once; answers with the real pipeline.

    Requests are serialized by default (`max_concurrency=1`). Raise it only
    after measuring memory and throughput on the target hardware.
    """

    protocol_version = PROTOCOL_VERSION

    def __init__(
        self,
        checkpoint_dir: str | Path,
        device: str = "auto",
        dtype: str = "auto",
        max_concurrency: int = 1,
        queue_timeout_s: float | None = 30.0,
    ):
        started = time.perf_counter()
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be at least 1")
        if queue_timeout_s is not None and queue_timeout_s < 0:
            raise ValueError("queue_timeout_s must be non-negative or None")

        self.checkpoint_dir = Path(checkpoint_dir)
        config_path = self.checkpoint_dir / CONFIG_FILE
        if not config_path.is_file():
            raise FileNotFoundError(
                f"no checkpoint config at {config_path}; train one first "
                "(see model/README.md) or use MockInferenceService"
            )
        resolve_device(device)  # fail fast with a clear error
        verify_checkpoint(self.checkpoint_dir)  # fail before loading any backbones
        config = ModelConfig.load(config_path)
        self.model = AskSightModel(config, device=device, dtype=dtype)
        load_projector(self.checkpoint_dir, self.model)
        self.model.eval()

        self.model_version = config.version
        self._slots = threading.BoundedSemaphore(max_concurrency)
        self._max_concurrency = max_concurrency
        self._queue_timeout_s = queue_timeout_s
        self._stats_lock = threading.Lock()
        self._requests = 0
        self._failures = 0
        self._timeouts = 0
        self._latencies: deque[float] = deque(maxlen=STATS_WINDOW)
        self._queue_times: deque[float] = deque(maxlen=STATS_WINDOW)
        self._generation_times: deque[float] = deque(maxlen=STATS_WINDOW)
        self._ready = False
        self.startup_seconds = 0.0

        self.warmup()  # initialize kernels before the service accepts traffic
        self.startup_seconds = round(time.perf_counter() - started, 3)

    @property
    def ready(self) -> bool:
        return self._ready

    def warmup(self) -> None:
        """Run one minimal generation so the first real request is not the cold path."""
        self.model.generate(
            [Image.new("RGB", (224, 224), (127, 127, 127))],
            ["Describe the image."],
            max_new_tokens=1,
        )
        self._ready = True

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
        """Operational counters and percentiles for readiness and monitoring."""
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

    def answer(self, image: Image.Image, question: str) -> str:
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

        generation_started = time.perf_counter()
        failed = False
        try:
            output = self.model.generate(
                [prepared],
                [question.strip()],
                max_new_tokens=self.model.config.max_new_tokens,
            )[0]
        except Exception:
            failed = True
            raise
        finally:
            # Generation is not interruptible mid-call; the timeout above only
            # bounds queue wait. max_new_tokens bounds the work itself.
            self._slots.release()
            self._record_timing(
                queued,
                time.perf_counter() - generation_started,
                time.perf_counter() - started,
                failed,
            )
        return output or CLARIFY_ANSWER
