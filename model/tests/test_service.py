"""Service contract and failure-path tests (B5/B7)."""

from pathlib import Path

import pytest
import torch

from asksight_model.config import ModelConfig
from asksight_model.pipeline import AskSightModel, save_checkpoint
from asksight_model.service import (
    PROTOCOL_VERSION,
    LocalInferenceService,
    MockInferenceService,
    validate_inputs,
)


def _save_checkpoint(path: Path, config: ModelConfig) -> None:
    save_checkpoint(path, AskSightModel(config, device="cpu", dtype="float32"))


def test_mock_service_is_deterministic_and_marks_itself(tiny_images):
    service = MockInferenceService()
    first = service.answer(tiny_images[0], "what color is the cat")
    assert first == service.answer(tiny_images[0], "what color is the cat")
    assert "what color is the cat" in first
    assert service.model_version
    assert service.protocol_version == PROTOCOL_VERSION


def test_validate_inputs_rejects_bad_values(tiny_images):
    with pytest.raises(ValueError):
        validate_inputs(tiny_images[0], "   ")
    with pytest.raises(ValueError):
        validate_inputs(tiny_images[0], "")
    with pytest.raises(ValueError):
        validate_inputs("not an image", "question")
    with pytest.raises(ValueError):
        validate_inputs(tiny_images[0], "x" * 501)


def test_validate_inputs_accepts_multilingual_question(tiny_images):
    assert validate_inputs(tiny_images[0], "¿De qué color es el gato?") is not None


def test_local_service_loads_is_ready_and_reports_stats(tiny_config, tiny_images, tmp_path):
    _save_checkpoint(tmp_path, tiny_config)
    service = LocalInferenceService(tmp_path, device="cpu")

    assert service.model_version == tiny_config.version
    assert service.protocol_version == PROTOCOL_VERSION
    assert service.ready
    assert service.startup_seconds > 0
    answer = service.answer(tiny_images[0], "what color is the cat")
    assert isinstance(answer, str)
    assert answer  # empty generations fall back to the clarification answer

    stats = service.stats()
    assert stats["model_version"] == tiny_config.version
    assert stats["ready"] is True
    assert stats["requests"] == 1
    assert stats["failures"] == 0
    assert stats["timeouts"] == 0
    assert stats["latency_median_s"] >= 0
    assert stats["generation_time_median_s"] >= 0
    assert stats["process_rss_mb"] > 0

    with pytest.raises(ValueError):
        service.answer(tiny_images[0], "")
    stats = service.stats()
    assert stats["requests"] == 2
    assert stats["failures"] == 1


def test_local_service_missing_checkpoint_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        LocalInferenceService(tmp_path / "does-not-exist", device="cpu")


def test_local_service_missing_projector_raises(tiny_config, tmp_path):
    _save_checkpoint(tmp_path, tiny_config)
    (tmp_path / "projector.safetensors").unlink()

    with pytest.raises(FileNotFoundError, match="projector.safetensors"):
        LocalInferenceService(tmp_path, device="cpu")


def test_local_service_corrupt_projector_raises(tiny_config, tmp_path):
    _save_checkpoint(tmp_path, tiny_config)
    (tmp_path / "projector.safetensors").write_bytes(b"not a safetensors file")
    (tmp_path / "manifest.json").unlink()  # exercise the loader, not the hash check

    with pytest.raises(ValueError, match="invalid projector.safetensors"):
        LocalInferenceService(tmp_path, device="cpu")


def test_local_service_rejects_config_projector_mismatch(tiny_config, tmp_path):
    _save_checkpoint(tmp_path, tiny_config)
    config = ModelConfig.load(tmp_path / "config.yaml")
    config.connector_hidden = (config.connector_hidden or 16) + 1
    config.save(tmp_path / "config.yaml")
    (tmp_path / "manifest.json").unlink()

    with pytest.raises(ValueError, match="does not match the checkpoint config"):
        LocalInferenceService(tmp_path, device="cpu")


def test_local_service_detects_tampered_checkpoint(tiny_config, tmp_path):
    _save_checkpoint(tmp_path, tiny_config)
    config = ModelConfig.load(tmp_path / "config.yaml")
    config.version = "tampered"
    config.save(tmp_path / "config.yaml")

    with pytest.raises(ValueError, match="manifest hash"):
        LocalInferenceService(tmp_path, device="cpu")


def test_local_service_queue_timeout(tiny_config, tiny_images, tmp_path):
    _save_checkpoint(tmp_path, tiny_config)
    service = LocalInferenceService(tmp_path, device="cpu", max_concurrency=1, queue_timeout_s=0.01)

    assert service._slots.acquire(blocking=False)
    try:
        with pytest.raises(TimeoutError, match="queue wait"):
            service.answer(tiny_images[0], "what color is the cat")
    finally:
        service._slots.release()

    stats = service.stats()
    assert stats["requests"] == 1
    assert stats["failures"] == 1
    assert stats["timeouts"] == 1


def test_local_service_rejects_invalid_limits(tiny_config, tmp_path):
    _save_checkpoint(tmp_path, tiny_config)
    with pytest.raises(ValueError, match="max_concurrency"):
        LocalInferenceService(tmp_path, device="cpu", max_concurrency=0)
    with pytest.raises(ValueError, match="queue_timeout_s"):
        LocalInferenceService(tmp_path, device="cpu", queue_timeout_s=-1)


@pytest.mark.skipif(torch.cuda.is_available(), reason="requires a machine without CUDA")
def test_local_service_cuda_unavailable_raises(tiny_config, tmp_path):
    tiny_config.save(tmp_path / "config.yaml")
    with pytest.raises(RuntimeError, match="CUDA"):
        LocalInferenceService(tmp_path, device="cuda")
