"""Compare a pretrained image-text model on the fixed AskSight question set.

Example from ``model/`` (GPU strongly recommended)::

    python -m asksight_model.evaluate_vlm \
      --questions-file evaluations/asksight_v1.jsonl \
      --output evaluations/runs/qwen3-vl-2b-asksight-v1.jsonl

This is an evaluation-only baseline. It does not replace the AskSight serving
provider or change backend behavior.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import statistics
import time
from pathlib import Path

from PIL import Image

from .config import DEFAULT_SYSTEM_PROMPT
from .evaluate import vqa_accuracy
from .train import load_jsonl

DEFAULT_MODEL = "Qwen/Qwen3-VL-2B-Instruct"


def evaluate_vlm(
    questions_file: Path,
    output_path: Path,
    model_id: str = DEFAULT_MODEL,
    revision: str | None = None,
    max_new_tokens: int = 128,
    limit: int | None = None,
) -> dict:
    """Run one image-text model over the fixed set and save predictions + metadata."""
    import torch
    import transformers
    from transformers import AutoProcessor, Qwen3VLForConditionalGeneration

    questions_file = Path(questions_file)
    output_path = Path(output_path)
    rows = load_jsonl(questions_file)
    if limit is not None:
        rows = rows[:limit]
    if not rows:
        raise ValueError(f"no questions in {questions_file}")
    if max_new_tokens < 1:
        raise ValueError("max_new_tokens must be positive")
    for index, row in enumerate(rows):
        for field in ("id", "image", "question"):
            if not isinstance(row.get(field), str) or not row[field].strip():
                raise ValueError(f"record {index} must have a non-empty {field!r}")

    load_started = time.perf_counter()
    processor = AutoProcessor.from_pretrained(model_id, revision=revision)
    model = Qwen3VLForConditionalGeneration.from_pretrained(
        model_id,
        revision=revision,
        dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        device_map="auto",
    )
    model.eval()
    startup_seconds = round(time.perf_counter() - load_started, 2)
    resolved_revision = getattr(model.config, "_commit_hash", None) or revision

    predictions: list[str] = []
    latencies: list[float] = []
    for row in rows:
        image_path = (questions_file.parent / row["image"]).resolve()
        if not image_path.is_file():
            raise FileNotFoundError(f"image not found for {row['id']}: {image_path}")
        with Image.open(image_path) as opened:
            image = opened.convert("RGB")
        messages = [
            {"role": "system", "content": DEFAULT_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": row["question"]},
                ],
            },
        ]
        inputs = processor.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
        ).to(model.device)
        started = time.perf_counter()
        with torch.inference_mode():
            generated = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        latencies.append(time.perf_counter() - started)
        new_tokens = generated[0][inputs["input_ids"].shape[-1] :]
        predictions.append(
            processor.decode(new_tokens, skip_special_tokens=True).strip()
        )

    direct = [
        (row, prediction)
        for row, prediction in zip(rows, predictions, strict=True)
        if isinstance(row.get("references"), list) and row["references"]
    ]
    result = {
        "evaluation": "asksight_questions",
        "question_set": questions_file.name,
        "question_set_sha256": hashlib.sha256(questions_file.read_bytes()).hexdigest(),
        "model_id": model_id,
        "model_revision": resolved_revision,
        "transformers_version": transformers.__version__,
        "python_version": platform.python_version(),
        "system_prompt": DEFAULT_SYSTEM_PROMPT,
        "max_new_tokens": max_new_tokens,
        "n": len(rows),
        "startup_seconds": startup_seconds,
        "latency_median_s": round(statistics.median(latencies), 3),
        "latency_p95_s": round(sorted(latencies)[int(0.95 * (len(latencies) - 1))], 3),
    }
    if direct:
        result["direct_vqa_n"] = len(direct)
        result["direct_vqa_accuracy"] = round(
            vqa_accuracy(
                [prediction for _, prediction in direct],
                [row["references"] for row, _ in direct],
            ),
            4,
        )
    if torch.cuda.is_available():
        result["peak_cuda_memory_mb"] = round(torch.cuda.max_memory_allocated() / 1024**2, 1)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w") as handle:
        for row, prediction in zip(rows, predictions, strict=True):
            handle.write(
                json.dumps(
                    {
                        "id": row["id"],
                        "image": row["image"],
                        "question": row["question"],
                        "category": row.get("category"),
                        "references": row.get("references"),
                        "expected_facts": row.get("expected_facts"),
                        "prediction": prediction,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    result["predictions_file"] = str(output_path)
    output_path.with_suffix(".metrics.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate a pretrained VLM on AskSight cases")
    parser.add_argument("--questions-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--revision")
    parser.add_argument("--max-new-tokens", type=int, default=128)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args(argv)
    evaluate_vlm(
        args.questions_file,
        args.output,
        args.model,
        args.revision,
        args.max_new_tokens,
        args.limit,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
