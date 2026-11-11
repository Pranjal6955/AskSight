"""Service contract and failure-path tests (B5/B7)."""

import pytest
import torch

from asksight_model.pipeline import AskSightModel, save_checkpoint
from asksight_model.service import (
    LocalInferenceService,
    MockInferenceService,
    validate_inputs,
)


def test_mock_service_is_deterministic_and_marks_itself(tiny_images):
    service = MockInferenceService()
    first = service.answer(tiny_images[0], "what color is the cat")
    assert first == service.answer(tiny_images[0], "what color is the cat")
    assert "what color is the cat" in first
    assert service.model_version


def test_validate_inputs_rejects_bad_values(tiny_images):
    with pytest.raises(ValueError):
        validate_inputs(tiny_images[0], "   ")
    with pytest.raises(ValueError):
        validate_inputs(tiny_images[0], "")
    with pytest.raises(ValueError):
        validate_inputs("not an image", "question")
    with pytest.raises(ValueError):
        validate_inputs(tiny_images[0], "x" * 501)


def test_local_service_loads_and_answers(tiny_config, tiny_images, tmp_path):
    save_checkpoint(tmp_path, AskSightModel(tiny_config, device="cpu", dtype="float32"))
    service = LocalInferenceService(tmp_path, device="cpu")
    assert service.model_version == tiny_config.version
    answer = service.answer(tiny_images[0], "what color is the cat")
    assert isinstance(answer, str)
    assert answer  # empty generations fall back to the clarification answer


def test_local_service_missing_checkpoint_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        LocalInferenceService(tmp_path / "does-not-exist", device="cpu")


@pytest.mark.skipif(torch.cuda.is_available(), reason="requires a machine without CUDA")
def test_local_service_cuda_unavailable_raises(tiny_config, tmp_path):
    tiny_config.save(tmp_path / "config.yaml")
    with pytest.raises(RuntimeError, match="CUDA"):
        LocalInferenceService(tmp_path, device="cuda")
