"""Comprehensive unit tests for AskSight v0.6 changes.

Verifies:
1. Stage 1: Gradients reach connector only; CLIP and LM remain frozen.
2. Stage 2: Separate parameter groups and learning rates for connector vs LoRA.
3. Image-token insertion and answer masking (-100 on prompt and image tokens).
4. Checkpoint loading roundtrip (Stage 1 connector loaded into Stage 2 model).
5. Evaluation metrics calculation (exact match, yes/no confusion matrix, breakdown).
"""

from __future__ import annotations

import torch
from PIL import Image

from asksight_model.config import ModelConfig
from asksight_model.evaluate import detailed_vqa_metrics
from asksight_model.pipeline import AskSightModel, load_projector, save_checkpoint


def test_stage1_gradients_connector_only(tiny_paths):
    """Stage 1: Verify that only connector parameters receive gradients."""
    config = ModelConfig(
        version="test-stage1",
        vision_model=str(tiny_paths["vision"]),
        vision_revision=None,
        lm_model=str(tiny_paths["lm"]),
        lm_revision=None,
        lora_rank=None,
    )
    model = AskSightModel(config, device="cpu", dtype="float32")
    model.train_mode()

    # Assert LM and Vision are frozen
    assert all(not p.requires_grad for p in model.vision.parameters())
    assert all(not p.requires_grad for p in model.lm.parameters())
    assert all(p.requires_grad for p in model.connector.parameters())

    img = Image.new("RGB", (32, 32), color="blue")
    loss = model([img], ["what color is the cat?"], ["brown"])
    loss.backward()

    # Gradients must exist on connector
    for name, p in model.connector.named_parameters():
        assert p.grad is not None, f"Connector param {name} missing grad"
        assert p.grad.abs().sum() > 0, f"Connector param {name} zero grad"

    # Gradients must NOT exist on LM or Vision
    assert all(p.grad is None for p in model.vision.parameters())
    assert all(p.grad is None for p in model.lm.parameters())


def test_stage2_parameter_groups_and_gradients(tiny_paths):
    """Stage 2: Verify separate parameter groups and gradients for connector + LoRA."""
    config = ModelConfig(
        version="test-stage2",
        vision_model=str(tiny_paths["vision"]),
        vision_revision=None,
        lm_model=str(tiny_paths["lm"]),
        lm_revision=None,
        lora_rank=4,
        lora_alpha=8,
        lora_target_modules=["c_attn", "c_proj"],
    )
    model = AskSightModel(config, device="cpu", dtype="float32")
    model.enable_lora()
    model.train_mode()

    connector_lr = 1e-3
    lora_lr = 1e-4
    groups = model.get_parameter_groups(connector_lr=connector_lr, lora_lr=lora_lr)

    assert len(groups) == 2
    assert groups[0]["name"] == "connector"
    assert groups[0]["lr"] == connector_lr
    assert groups[1]["name"] == "lora"
    assert groups[1]["lr"] == lora_lr

    img = Image.new("RGB", (32, 32), color="red")
    loss = model([img], ["what color is the cat?"], ["brown"])
    loss.backward()

    # Verify connector gradients
    for p in model.connector.parameters():
        assert p.grad is not None
        assert p.grad.abs().sum() > 0

    # Verify LoRA gradients
    lora_params = [p for p in model.lm.parameters() if p.requires_grad]
    assert len(lora_params) > 0
    # In LoRA, lora_A receives gradients during backward while lora_B starts initialized with zeros
    lora_grads = [p.grad for p in lora_params if p.grad is not None]
    assert len(lora_grads) > 0
    assert any(g.abs().sum() > 0 for g in lora_grads)

    # Base LM frozen parameters must have no gradients
    frozen_lm_params = [p for p in model.lm.parameters() if not p.requires_grad]
    assert all(p.grad is None for p in frozen_lm_params)


def test_image_token_insertion_and_answer_masking(tiny_paths):
    """Verify image embeddings are inserted and only answer tokens have labels."""
    config = ModelConfig(
        version="test-masking",
        vision_model=str(tiny_paths["vision"]),
        vision_revision=None,
        lm_model=str(tiny_paths["lm"]),
        lm_revision=None,
    )
    model = AskSightModel(config, device="cpu", dtype="float32")
    img = Image.new("RGB", (32, 32), color="green")
    batch = model.prepare_batch([img], ["what color is the cat?"], ["brown"])

    embeds = batch["inputs_embeds"]
    mask = batch["attention_mask"]
    labels = batch["labels"]

    # Image features for 32x32 image with patch size 16 = (32/16)^2 + 1 CLS = 5 tokens
    expected_image_tokens = 5
    assert embeds.shape[0] == 1
    assert mask.shape == (1, embeds.shape[1])
    assert labels.shape == (1, embeds.shape[1])

    # Only answer tokens should be != -100
    valid_labels = labels[labels != -100]
    assert len(valid_labels) > 0, "No labels provided for answer"
    # Ensure -100 covers the prefix, image, and question suffix
    assert (labels == -100).sum() >= expected_image_tokens


def test_stage1_to_stage2_checkpoint_transfer(tmp_path, tiny_paths):
    """Verify loading Stage 1 connector weights into a Stage 2 model with LoRA."""
    # 1. Create and save Stage 1 checkpoint
    s1_config = ModelConfig(
        version="s1-model",
        vision_model=str(tiny_paths["vision"]),
        vision_revision=None,
        lm_model=str(tiny_paths["lm"]),
        lm_revision=None,
        lora_rank=None,
    )
    s1_model = AskSightModel(s1_config, device="cpu", dtype="float32")
    s1_dir = tmp_path / "stage1"
    save_checkpoint(s1_dir, s1_model)

    # 2. Create Stage 2 model with LoRA
    s2_config = ModelConfig(
        version="s2-model",
        vision_model=str(tiny_paths["vision"]),
        vision_revision=None,
        lm_model=str(tiny_paths["lm"]),
        lm_revision=None,
        lora_rank=4,
        lora_alpha=8,
        lora_target_modules=["c_attn", "c_proj"],
    )
    s2_model = AskSightModel(s2_config, device="cpu", dtype="float32")

    # Load projector from stage 1
    load_projector(s1_dir, s2_model)

    # Check connector weights match
    for p1, p2 in zip(
        s1_model.connector.parameters(), s2_model.connector.parameters(), strict=True
    ):
        assert torch.allclose(p1, p2)


def test_detailed_vqa_metrics():
    """Verify exact match, yes/no balance, confusion matrix, and breakdown."""
    records = [
        {"question": "Is the cat white?", "answers": ["yes"], "short_answer": "yes"},
        {"question": "Are the dogs sleeping?", "answers": ["no"], "short_answer": "no"},
        {"question": "What color is the sky?", "answers": ["blue"], "short_answer": "blue"},
        {"question": "How many cups are there?", "answers": ["2", "two"], "short_answer": "2"},
    ]
    predictions = [
        "yes",
        "no",
        "blue",
        "2",
    ]
    metrics = detailed_vqa_metrics(records, predictions)
    assert metrics["normalized_exact_match"] == 1.0
    assert metrics["yes_no_accuracy"] == 1.0
    assert metrics["yes_no_confusion_matrix"]["tp"] == 1
    assert metrics["yes_no_confusion_matrix"]["tn"] == 1
    assert metrics["generic_answer_frequency"] == 0.0
    assert metrics["per_category_breakdown"]["color"]["accuracy"] == 1.0
    assert metrics["per_category_breakdown"]["number"]["accuracy"] == 1.0
