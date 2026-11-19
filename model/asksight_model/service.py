"""Inference services behind one interface (B5).

Track A codes against `InferenceService`. `MockInferenceService` keeps the full
flow demoable before a trained checkpoint exists; `LocalInferenceService` loads
a checkpoint once at construction and is what production uses after training.

`answer()` retains the original string return type. `answer_with_metadata()`
adds a confidence and abstention result for callers that can use it.
"""

from __future__ import annotations

import resource
import statistics
import sys
import threading
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from PIL import Image

from .config import DEFAULT_SYSTEM_PROMPT, ModelConfig
from .pipeline import (
    CONFIG_FILE,
    AskSightModel,
    load_projector,
    resolve_device,
    verify_checkpoint,
)
from .question_prep import normalize_question

# Returned when generation produces no usable text. Low-confidence generations
# use UNSURE_ANSWER after validation-split calibration.
CLARIFY_ANSWER = "Sorry, I could not find a clear answer. Could you ask again in different words?"
UNSURE_ANSWER = (
    "I'm not sure about this. Could you retake the photo with better lighting "
    "or a plain background?"
)

MAX_QUESTION_CHARS = 500
PROTOCOL_VERSION = "1"

# Percentiles are computed over a bounded recent window, not unbounded history.
STATS_WINDOW = 1024


class InferenceService(Protocol):
    model_version: str
    protocol_version: str

    def answer(
        self, image: Image.Image, question: str, history: list[Turn] | None = None
    ) -> str: ...


@dataclass(frozen=True)
class Turn:
    question: str
    answer: str


@dataclass(frozen=True)
class AnswerResponse:
    answer: str
    confidence: float | None
    abstained: bool
    first_token_probability: float | None = None


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

    def answer(
        self, image: Image.Image, question: str, history: list[Turn] | None = None
    ) -> str:
        validate_inputs(image, question)
        return f"[mock answer] {question.strip()}"

    def answer_with_metadata(
        self, image: Image.Image, question: str, history: list[Turn] | None = None
    ) -> AnswerResponse:
        return AnswerResponse(self.answer(image, question, history), None, False)


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
        # Keep older checkpoints compatible with the current product behavior.
        # The shipped v0.1 checkpoint explicitly requested one-word answers and
        # capped generations at 24 tokens, which made spoken image descriptions
        # unhelpfully terse.
        config.system_prompt = DEFAULT_SYSTEM_PROMPT
        config.max_new_tokens = max(config.max_new_tokens, 80)
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
        self._abstained = 0
        self._confidences: deque[float] = deque(maxlen=STATS_WINDOW)
        self._question_logs: deque[dict[str, str]] = deque(maxlen=STATS_WINDOW)
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
            confidences = list(self._confidences)
            question_logs = list(self._question_logs)
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
            "abstained": self._abstained,
            "answered": requests - failures - self._abstained,
            "abstain_rate": self._abstained / max(requests - failures, 1),
            "confidence_count": len(confidences),
            "confidence_median": statistics.median(confidences) if confidences else None,
            "question_normalizations": question_logs[-20:],
            "queue_time_median_s": queue_median,
            "queue_time_p95_s": queue_p95,
            "generation_time_median_s": generation_median,
            "generation_time_p95_s": generation_p95,
            "latency_median_s": latency_median,
            "latency_p95_s": latency_p95,
        }

    def answer(
        self, image: Image.Image, question: str, history: list[Turn] | None = None
    ) -> str:
        return self.answer_with_metadata(image, question, history).answer

    def answer_with_metadata(
        self, image: Image.Image, question: str, history: list[Turn] | None = None
    ) -> AnswerResponse:
        self._count_request()
        try:
            prepared = validate_inputs(image, question)
            prepared_history = _validate_history(history)
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

        normalized_question = normalize_question(question)
        normalized_history = [
            (normalize_question(turn.question), turn.answer) for turn in prepared_history
        ]
        with self._stats_lock:
            self._question_logs.append(
                {"original": question, "normalized": normalized_question}
            )

        generation_started = time.perf_counter()
        failed = False
        try:
            output, confidence, first_probability = self.model.generate_with_confidence(
                [prepared],
                [normalized_question],
                histories=[normalized_history],
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
        with self._stats_lock:
            self._confidences.append(confidence)
        if not output:
            return AnswerResponse(CLARIFY_ANSWER, confidence, False, first_probability)
        abstained = confidence < self.model.config.confidence_threshold
        if abstained:
            with self._stats_lock:
                self._abstained += 1
        return AnswerResponse(
            UNSURE_ANSWER if abstained else output,
            confidence,
            abstained,
            first_probability,
        )


def _validate_history(history: list[Turn] | None) -> list[Turn]:
    if history is None:
        return []
    if not isinstance(history, list):
        raise ValueError("history must be a list of Turn(question, answer) pairs")
    turns: list[Turn] = []
    for index, turn in enumerate(history):
        if isinstance(turn, dict):
            question, answer = turn.get("question"), turn.get("answer")
        else:
            question, answer = getattr(turn, "question", None), getattr(turn, "answer", None)
        if not isinstance(question, str) or not isinstance(answer, str):
            raise ValueError(f"history turn {index} must contain string question and answer")
        turns.append(Turn(question, answer))
    return turns
