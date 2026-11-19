"""Degraded-image evaluation tests (B6)."""

import pytest
from PIL import Image

from asksight_model.pipeline import AskSightModel, save_checkpoint
from asksight_model.robustness import CONDITIONS, degrade, run


@pytest.mark.parametrize("condition", CONDITIONS)
def test_degrade_returns_a_distinctly_modified_image(condition):
    # A structured image: blur and low-res leave a flat colour untouched.
    original = Image.new("RGB", (48, 40), (0, 0, 0))
    for x in range(0, 48, 8):
        for y in range(0, 40, 8):
            original.paste((200, 30, 30), (x, y, x + 4, y + 4))

    degraded = degrade(original, condition)
    assert degraded.size == original.size
    if condition == "clean":
        assert degraded.tobytes() == original.tobytes()
    else:
        assert degraded.tobytes() != original.tobytes()


def test_degrade_rejects_unknown_condition(tiny_images):
    with pytest.raises(ValueError, match="unknown condition"):
        degrade(tiny_images[0], "holographic")


def test_run_reports_accuracy_per_condition(tiny_config, tiny_records, tmp_path):
    data_dir, _ = tiny_records
    checkpoint_dir = tmp_path / "ckpt"
    save_checkpoint(checkpoint_dir, AskSightModel(tiny_config, device="cpu", dtype="float32"))

    summary = run(checkpoint_dir, data_dir, split="test", device="cpu")

    assert summary["model_version"] == tiny_config.version
    assert summary["n"] == 2
    for condition in CONDITIONS:
        result = summary["conditions"][condition]
        assert 0.0 <= result["vqa_accuracy"] <= 1.0
        assert result["latency_median_s"] >= 0.0
    assert summary["conditions"]["clean"]["accuracy_drop_vs_clean"] == 0.0
