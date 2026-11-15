"""Degraded-image evaluation (B6).

Answers the question the README raises: for which photos is the model's answer
good enough to trust, and when should the user be told to verify or retake?

Each condition applies one realistic capture fault to the clean test images.
Accuracy is reported per condition and as a drop against `clean`, so the
threshold for "please verify this" is a measured number rather than a guess.

Usage (from `model/`):
    python -m asksight_model.robustness --checkpoint checkpoints/v0.1 --split test
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

from .evaluate import vqa_accuracy
from .service import LocalInferenceService
from .train import load_jsonl

CONDITIONS = ("clean", "blur", "dark", "obstructed", "lowres")


def degrade(image: Image.Image, condition: str) -> Image.Image:
    """Return a copy of `image` with one realistic capture fault applied."""
    if condition == "clean":
        return image.copy()
    if condition == "blur":
        return image.filter(ImageFilter.GaussianBlur(radius=4))
    if condition == "dark":
        return ImageEnhance.Brightness(image).enhance(0.35)
    if condition == "obstructed":
        # A finger over the lens: opaque block over the middle of the frame.
        out = image.copy()
        width, height = out.size
        out.paste((0, 0, 0), (width // 4, height // 4, 3 * width // 4, 3 * height // 4))
        return out
    if condition == "lowres":
        # Phone-camera compression: downsample hard, then restore the size.
        width, height = image.size
        small = image.resize((max(width // 8, 1), max(height // 8, 1)), Image.BILINEAR)
        return small.resize((width, height), Image.BILINEAR)
    raise ValueError(f"unknown condition {condition!r}; expected one of {list(CONDITIONS)}")


def run(
    checkpoint_dir: Path,
    data_dir: Path,
    split: str = "test",
    conditions: tuple[str, ...] = CONDITIONS,
    limit: int | None = None,
    device: str = "auto",
) -> dict:
    records = load_jsonl(Path(data_dir) / f"{split}.jsonl")
    if limit is not None:
        records = records[:limit]
    if not records:
        raise ValueError(f"no records for split {split!r} in {data_dir}")

    service = LocalInferenceService(checkpoint_dir, device=device)
    images = [Image.open(Path(data_dir) / record["image"]).convert("RGB") for record in records]
    references = [record["answers"] for record in records]

    results: dict[str, dict] = {}
    for condition in conditions:
        predictions, latencies = [], []
        for image, record in zip(images, records, strict=True):
            degraded = degrade(image, condition)
            started = time.perf_counter()
            predictions.append(service.answer(degraded, record["question"]))
            latencies.append(time.perf_counter() - started)
        results[condition] = {
            "n": len(predictions),
            "vqa_accuracy": round(vqa_accuracy(predictions, references), 4),
            "latency_median_s": round(statistics.median(sorted(latencies)), 3),
        }
        print(
            f"{condition:>11}: accuracy {results[condition]['vqa_accuracy']:.3f}"
            f" | median {results[condition]['latency_median_s']}s"
        )

    clean_accuracy = results.get("clean", {}).get("vqa_accuracy")
    for result in results.values():
        result["accuracy_drop_vs_clean"] = (
            round(clean_accuracy - result["vqa_accuracy"], 4)
            if clean_accuracy is not None
            else None
        )

    summary = {
        "split": split,
        "n": len(records),
        "model_version": service.model_version,
        "startup_seconds": service.stats()["startup_seconds"],
        "process_rss_mb": service.stats()["process_rss_mb"],
        "conditions": results,
    }
    metrics_path = Path(checkpoint_dir) / "metrics.json"
    metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
    metrics["eval_robustness"] = summary
    metrics_path.write_text(json.dumps(metrics, indent=2) + "\n")
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate an AskSight checkpoint on degraded images"
    )
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, default=Path("data/vqa"))
    parser.add_argument("--split", default="test", choices=["val", "test"])
    parser.add_argument("--conditions", nargs="+", default=list(CONDITIONS))
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--device", default="auto")
    args = parser.parse_args(argv)
    summary = run(
        args.checkpoint,
        args.data_dir,
        args.split,
        tuple(args.conditions),
        args.limit,
        args.device,
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
