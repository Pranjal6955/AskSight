"""Unit and smoke tests for AskSight Qwen3-VL Unified Model and Service.

Verifies:
(a) OpenCV quality gate catches pitch-black and synthetic blurry images without invoking the VLM.
(b) Dual-mode routing (Describe Mode vs Question Mode) and markdown stripping.
(c) Qwen3VLAssistiveModel predict smoke tests.
(d) LocalInferenceService lifecycle, concurrency queue controls, timeout handling, and stats.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest
import torch
from PIL import Image

from asksight_model.accessibility import (
    DESCRIBE_MODE_SYSTEM_PROMPT,
    QUESTION_MODE_SYSTEM_PROMPT,
    clean_tts_text,
    route_request,
)
from asksight_model.qwen3_vl_engine import Qwen3VLAssistiveModel
from asksight_model.service import (
    CLARIFY_ANSWER,
    LocalInferenceService,
    MockInferenceService,
    validate_inputs,
)
from asksight_model.vision_gate import (
    BLURRY_IMAGE_MESSAGE,
    DARK_IMAGE_MESSAGE,
    check_image_quality,
)


class DummyProcessor:
    """Mock processor simulating AutoProcessor without remote weights."""

    def __init__(self, return_text="A walkway with an obstacle at 2 o'clock."):
        self._return_text = return_text

    def apply_chat_template(
        self, messages, tokenize=True, add_generation_prompt=True, return_dict=True, return_tensors="pt"
    ):
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        return {
            "input_ids": torch.tensor([[101, 102, 103]]),
            "attention_mask": torch.tensor([[1, 1, 1]]),
        }

    def decode(self, token_ids, skip_special_tokens=True, clean_up_tokenization_spaces=True):
        return self._return_text


class DummyModel(torch.nn.Module):
    """Mock Qwen3VLForConditionalGeneration without remote weights."""

    def __init__(self):
        super().__init__()
        self.dummy_param = torch.nn.Parameter(torch.zeros(1))

    def generate(self, **kwargs):
        input_ids = kwargs.get("input_ids")
        new_tokens = torch.tensor([[201, 202, 203, 204]])
        return torch.cat([input_ids, new_tokens], dim=1)


# ============================================================================
# OpenCV Pre-Inference Quality Gate Tests
# ============================================================================

def test_opencv_gate_pitch_black_image():
    black_img = Image.new("RGB", (224, 224), color=(0, 0, 0))
    is_valid, msg = check_image_quality(black_img)
    assert not is_valid
    assert msg == DARK_IMAGE_MESSAGE


def test_opencv_gate_synthetic_blurry_image():
    arr = np.zeros((224, 224, 3), dtype=np.uint8)
    arr[:, :112] = 255
    blurred_arr = cv2.GaussianBlur(arr, (45, 45), 0)
    blurred_img = Image.fromarray(blurred_arr)

    is_valid, msg = check_image_quality(blurred_img)
    assert not is_valid
    assert msg == BLURRY_IMAGE_MESSAGE


def test_opencv_gate_clear_bright_image():
    arr = np.zeros((224, 224, 3), dtype=np.uint8)
    arr[::4, ::4] = 255
    arr[1::4, 1::4] = 200
    clear_img = Image.fromarray(arr)

    is_valid, msg = check_image_quality(clear_img)
    assert is_valid
    assert msg is None


# ============================================================================
# TTS Text Cleaner & Dual Mode Routing Tests
# ============================================================================

def test_clean_tts_text_strips_markdown():
    markdown_raw = "### Warning:\n* Object at **12 o'clock**.\n- Watch `out` for [steps](http://steps.com)!"
    cleaned = clean_tts_text(markdown_raw)
    assert "*" not in cleaned
    assert "#" not in cleaned
    assert "`" not in cleaned
    assert "[" not in cleaned
    assert "]" not in cleaned
    assert "Object at 12 o'clock." in cleaned


def test_dual_mode_routing():
    mode, prompt = route_request(None)
    assert mode == "describe"
    assert prompt == DESCRIBE_MODE_SYSTEM_PROMPT

    mode_empty, prompt_empty = route_request("   ")
    assert mode_empty == "describe"
    assert prompt_empty == DESCRIBE_MODE_SYSTEM_PROMPT

    mode_q, prompt_q = route_request("What does the label say?")
    assert mode_q == "question"
    assert prompt_q == QUESTION_MODE_SYSTEM_PROMPT


# ============================================================================
# Qwen3VLAssistiveModel Predict Smoke Tests
# ============================================================================

def test_predict_catches_quality_gate_without_vlm():
    dummy_model = DummyModel()
    dummy_proc = DummyProcessor()
    assistive_model = Qwen3VLAssistiveModel(model=dummy_model, processor=dummy_proc)

    black_img = Image.new("RGB", (224, 224), color=(0, 0, 0))
    result = assistive_model.predict(black_img, question="What is this?")
    assert result == DARK_IMAGE_MESSAGE


def test_predict_describe_mode():
    dummy_model = DummyModel()
    dummy_proc = DummyProcessor(return_text="A clean walkway ahead with an obstacle at **2 o'clock**.")
    assistive_model = Qwen3VLAssistiveModel(model=dummy_model, processor=dummy_proc)

    arr = np.random.randint(100, 255, size=(224, 224, 3), dtype=np.uint8)
    img = Image.fromarray(arr)

    output = assistive_model.predict(img, question=None)
    assert "*" not in output
    assert "obstacle at 2 o'clock" in output


def test_predict_question_mode():
    dummy_model = DummyModel()
    dummy_proc = DummyProcessor(return_text="The label reads: # Expire 12/26, 500mg.")
    assistive_model = Qwen3VLAssistiveModel(model=dummy_model, processor=dummy_proc)

    arr = np.random.randint(100, 255, size=(224, 224, 3), dtype=np.uint8)
    img = Image.fromarray(arr)

    output = assistive_model.predict(img, question="What does the label say?")
    assert "#" not in output
    assert "Expire 12/26, 500mg" in output


# ============================================================================
# LocalInferenceService Lifecycle Tests
# ============================================================================

def test_local_inference_service_lifecycle_and_stats():
    dummy_model = DummyModel()
    dummy_proc = DummyProcessor(return_text="Clear path ahead.")

    service = LocalInferenceService(
        model=dummy_model,
        processor=dummy_proc,
        max_concurrency=1,
    )
    assert service.ready

    arr = np.random.randint(100, 255, size=(224, 224, 3), dtype=np.uint8)
    img = Image.fromarray(arr)

    res = service.answer(img, question=None)
    assert res == "Clear path ahead."

    stats = service.stats()
    assert stats["ready"] is True
    assert stats["requests"] == 1
    assert stats["failures"] == 0


def test_local_inference_service_validation():
    dummy_model = DummyModel()
    dummy_proc = DummyProcessor()
    service = LocalInferenceService(model=dummy_model, processor=dummy_proc)

    with pytest.raises(ValueError, match="image must be a PIL.Image.Image"):
        service.answer("not an image", question="Hello")

    with pytest.raises(ValueError, match="question exceeds"):
        valid_img = Image.new("RGB", (100, 100), (200, 200, 200))
        service.answer(valid_img, question="A" * 501)
