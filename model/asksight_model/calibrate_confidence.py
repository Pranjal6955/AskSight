"""Plot validation accuracy against answer coverage for abstention thresholds.

Run on the validation split only; choose and save a threshold after reviewing
the resulting trade-off. This script does not modify the checkpoint config.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

from .evaluate import vqa_accuracy
from .service import LocalInferenceService
from .train import load_jsonl


def accuracy_coverage_curve(
    confidences: list[float], predictions: list[str], references: list[list[str]]
) -> list[dict[str, float | int]]:
    """Return accuracy on answered records and coverage for each observed cutoff."""
    if not (len(confidences) == len(predictions) == len(references)):
        raise ValueError("confidences, predictions, and references must have equal lengths")
    curve = []
    for threshold in sorted({0.0, *confidences}):
        indices = [i for i, confidence in enumerate(confidences) if confidence >= threshold]
        curve.append(
            {
                "threshold": threshold,
                "coverage": len(indices) / len(confidences) if confidences else 0.0,
                "accuracy": vqa_accuracy(
                    [predictions[i] for i in indices], [references[i] for i in indices]
                ),
                "answered": len(indices),
            }
        )
    return curve


def calibrate(
    checkpoint_dir: Path,
    data_dir: Path,
    output_dir: Path,
    limit: int | None = None,
    device: str = "auto",
) -> dict:
    records = load_jsonl(Path(data_dir) / "val.jsonl")
    if limit is not None:
        records = records[:limit]
    if not records:
        raise ValueError(f"no validation records in {data_dir}")
    service = LocalInferenceService(checkpoint_dir, device=device)
    # Measure raw generations so this analysis remains valid even if the
    # checkpoint already contains a provisional threshold.
    service.model.config.confidence_threshold = 0.0
    predictions, confidences, references = [], [], []
    for row in records:
        with Image.open(Path(data_dir) / row["image"]) as opened:
            result = service.answer_with_metadata(opened.convert("RGB"), row["question"])
        predictions.append(result.answer)
        confidences.append(result.confidence or 0.0)
        references.append(row["answers"])

    curve = accuracy_coverage_curve(confidences, predictions, references)
    result = {
        "split": "val",
        "n": len(records),
        "model_version": service.model_version,
        "confidence_definition": "geometric mean of greedy generated-token probabilities",
        "curve": curve,
    }
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "confidence_calibration.json").write_text(json.dumps(result, indent=2) + "\n")
    try:
        import matplotlib.pyplot as plt
    except ImportError as exc:
        message = "install asksight-model[confidence_eval] to write the calibration plot"
        raise RuntimeError(message) from exc
    plt.figure(figsize=(7, 5))
    plt.plot(
        [point["coverage"] for point in curve],
        [point["accuracy"] for point in curve],
        marker="o",
    )
    plt.xlabel("Coverage (fraction answered)")
    plt.ylabel("VQA accuracy on answered examples")
    plt.title("Validation accuracy vs coverage")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_dir / "accuracy_vs_coverage.png", dpi=150)
    plt.close()
    print(json.dumps(result, indent=2))
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Calibrate AskSight abstention on validation data")
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, default=Path("data/vqa"))
    parser.add_argument("--out", type=Path, default=Path("evaluations/confidence-calibration"))
    parser.add_argument("--limit", type=int)
    parser.add_argument("--device", default="auto")
    args = parser.parse_args(argv)
    calibrate(args.checkpoint, args.data_dir, args.out, args.limit, args.device)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
