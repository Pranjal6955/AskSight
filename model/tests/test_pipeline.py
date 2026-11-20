"""Pipeline tests: frozen backbones, prompt assembly, generation, checkpoints (B2/B7)."""

import json

import pytest
import torch

from asksight_model.pipeline import (
    AskSightModel,
    load_projector,
    save_checkpoint,
    verify_checkpoint,
)


def test_backbones_frozen_connector_trainable(tiny_model):
    assert all(not p.requires_grad for p in tiny_model.vision.parameters())
    assert all(not p.requires_grad for p in tiny_model.lm.parameters())
    assert tiny_model.trainable_parameters()
    assert all(p.requires_grad for p in tiny_model.trainable_parameters())


def test_image_token_count_matches_patch_grid(tiny_model, tiny_images):
    embeds = tiny_model._image_embeds(tiny_images)
    # 32x32 image, 16x16 patches -> 2x2 patches + 1 CLS token
    assert embeds.shape == (2, 5, 64)


def test_prepare_batch_left_pads_and_masks_prompt(tiny_model, tiny_images, tiny_questions):
    batch = tiny_model.prepare_batch(tiny_images, tiny_questions, ["brown", "two"])
    embeds, mask, labels = batch["inputs_embeds"], batch["attention_mask"], batch["labels"]
    assert embeds.shape[0] == 2 == mask.shape[0] == labels.shape[0]
    assert (mask.sum(dim=1) > 5).all()  # prefix + image + suffix present
    labeled = (labels != -100).sum(dim=1)
    assert (labeled >= 1).all()
    assert labeled.max() <= 4  # only answer tokens (+EOS) are supervised


def test_forward_backpropagates_only_into_connector(tiny_config, tiny_images, tiny_questions):
    model = AskSightModel(tiny_config, device="cpu", dtype="float32")
    loss = model(tiny_images, tiny_questions, ["brown", "two"])
    assert torch.isfinite(loss)
    loss.backward()
    for parameter in model.connector.parameters():
        assert parameter.grad is not None and torch.isfinite(parameter.grad).all()
    assert all(p.grad is None for p in model.lm.parameters())
    assert all(p.grad is None for p in model.vision.parameters())


def test_gradient_checkpointing_forward_backward(tiny_config, tiny_images, tiny_questions):
    model = AskSightModel(tiny_config, device="cpu", dtype="float32")
    model.enable_gradient_checkpointing()
    loss = model(tiny_images, tiny_questions, ["brown", "two"])
    loss.backward()
    assert any(p.grad is not None for p in model.connector.parameters())


def test_generate_deterministic_strings(tiny_model, tiny_images, tiny_questions):
    first = tiny_model.generate(tiny_images, tiny_questions)
    second = tiny_model.generate(tiny_images, tiny_questions)
    assert first == second
    assert len(first) == 2
    assert all(isinstance(text, str) for text in first)


def test_generate_respects_max_new_tokens(tiny_model, tiny_images, tiny_questions):
    outputs = tiny_model.generate(tiny_images, tiny_questions, max_new_tokens=1)
    assert all(len(output.split()) <= 1 for output in outputs)


def test_checkpoint_roundtrip(tiny_config, tiny_images, tiny_questions, tmp_path):
    model = AskSightModel(tiny_config, device="cpu", dtype="float32")
    with torch.no_grad():
        for parameter in model.connector.parameters():
            parameter.add_(0.05)
    expected = model.generate(tiny_images, tiny_questions)

    save_checkpoint(tmp_path, model)
    restored = AskSightModel(tiny_config, device="cpu", dtype="float32")
    load_projector(tmp_path, restored)

    assert restored.generate(tiny_images, tiny_questions) == expected
    for (name, p1), (_, p2) in zip(
        model.connector.named_parameters(), restored.connector.named_parameters(), strict=True
    ):
        assert torch.allclose(p1, p2), name


def test_manifest_verifies_and_detects_tampering(tiny_config, tmp_path):
    save_checkpoint(tmp_path, AskSightModel(tiny_config, device="cpu", dtype="float32"))

    manifest = verify_checkpoint(tmp_path)
    assert set(manifest["files"]) >= {"projector.safetensors", "config.yaml"}

    (tmp_path / "config.yaml").write_text((tmp_path / "config.yaml").read_text() + "\n")
    with pytest.raises(ValueError, match="manifest hash"):
        verify_checkpoint(tmp_path)


def test_strict_verification_requires_manifest(tiny_config, tmp_path):
    save_checkpoint(tmp_path, AskSightModel(tiny_config, device="cpu", dtype="float32"))
    (tmp_path / "manifest.json").unlink()

    assert verify_checkpoint(tmp_path)["files"] == {}
    with pytest.raises(FileNotFoundError, match="manifest"):
        verify_checkpoint(tmp_path, require_manifest=True)


def test_manifest_rejects_paths_outside_checkpoint(tiny_config, tmp_path):
    save_checkpoint(tmp_path, AskSightModel(tiny_config, device="cpu", dtype="float32"))
    manifest_path = tmp_path / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["files"]["../outside.safetensors"] = {"sha256": "0"}
    manifest_path.write_text(json.dumps(manifest))

    with pytest.raises(ValueError, match="unsafe file name"):
        verify_checkpoint(tmp_path)


def test_verify_cli_migrates_an_old_checkpoint(tiny_config, tmp_path):
    from asksight_model.verify import main

    save_checkpoint(tmp_path, AskSightModel(tiny_config, device="cpu", dtype="float32"))
    (tmp_path / "manifest.json").unlink()

    assert main(["--checkpoint", str(tmp_path), "--write"]) == 0
    assert main(["--checkpoint", str(tmp_path), "--strict"]) == 0
