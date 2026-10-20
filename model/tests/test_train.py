"""End-to-end smoke test of the train -> evaluate path on tiny fixtures (B4/B6/B7)."""

import json

import yaml

from asksight_model import evaluate as evaluate_module
from asksight_model import train as train_module


def _write_config(path, tiny_paths, data_dir, out_dir) -> None:
    path.write_text(
        yaml.safe_dump(
            {
                "model": {
                    "version": "smoke",
                    "vision_model": str(tiny_paths["vision"]),
                    "vision_revision": None,
                    "lm_model": str(tiny_paths["lm"]),
                    "lm_revision": None,
                    "connector_hidden": 16,
                    "system_prompt": "You are a test.",
                    "max_new_tokens": 4,
                },
                "train": {
                    "data_dir": str(data_dir),
                    "out_dir": str(out_dir),
                    "version": "smoke-v1",
                    "epochs": 1,
                    "batch_size": 2,
                    "lr": 0.001,
                    "seed": 0,
                    "device": "cpu",
                    "dtype": "float32",
                    "gradient_checkpointing": False,
                    "limit": 2,
                },
            }
        )
    )


def test_train_then_evaluate_smoke(tiny_paths, tiny_records, tmp_path):
    data_dir, _ = tiny_records
    out_dir = tmp_path / "checkpoints"
    config_path = tmp_path / "config.yaml"
    _write_config(config_path, tiny_paths, data_dir, out_dir)

    assert train_module.main(["--config", str(config_path)]) == 0

    checkpoint = out_dir / "smoke-v1"
    assert (checkpoint / "projector.safetensors").exists()
    assert (checkpoint / "config.yaml").exists()
    metrics = json.loads((checkpoint / "metrics.json").read_text())
    assert metrics["epochs"][0]["val_loss"] > 0
    assert metrics["version"] == "smoke-v1"

    assert (
        evaluate_module.main(
            [
                "--checkpoint",
                str(checkpoint),
                "--data-dir",
                str(data_dir),
                "--split",
                "test",
                "--limit",
                "2",
                "--device",
                "cpu",
            ]
        )
        == 0
    )

    evaluated = json.loads((checkpoint / "metrics.json").read_text())["eval_test"]
    assert evaluated["n"] == 2
    assert 0.0 <= evaluated["vqa_accuracy"] <= 1.0
    assert evaluated["model_version"] == "smoke-v1"
    assert evaluated["latency_median_s"] > 0
    assert (checkpoint / "predictions_test.jsonl").exists()
