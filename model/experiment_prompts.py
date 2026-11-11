"""Compare system-prompt variants on the held-out split (experiment, not shipped).

Answers two questions before the GPU run:
  1. Does the model answer in English, or in Qwen2.5's native Chinese?
  2. Do short answers beat one-sentence answers on VQA accuracy?
"""

import json
import statistics
import sys
import time
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from asksight_model.config import ModelConfig  # noqa: E402
from asksight_model.evaluate import vqa_accuracy  # noqa: E402
from asksight_model.pipeline import AskSightModel, load_projector  # noqa: E402
from asksight_model.train import load_jsonl  # noqa: E402

PROMPTS = {
    "current": (
        "You are AskSight, an assistant that answers questions about images for "
        "blind and low-vision users. Answer in one short, factual sentence."
    ),
    "short_english": (
        "You are AskSight, an assistant that answers questions about images for "
        "blind and low-vision users. Answer in English with a single word or "
        "short phrase. Do not write a sentence."
    ),
    "english_sentence": (
        "You are AskSight, an assistant that answers questions about images for "
        "blind and low-vision users. Answer in English, in one short, factual "
        "sentence."
    ),
}

LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 30

checkpoint = Path("checkpoints/v0.1-smoke")
records = load_jsonl(Path("data/vqa/test.jsonl"))[:LIMIT]
images = [Image.open(Path("data/vqa") / r["image"]).convert("RGB") for r in records]
references = [r["answers"] for r in records]

results = {}
for name, prompt in PROMPTS.items():
    config = ModelConfig.load(checkpoint / "config.yaml")
    config.system_prompt = prompt
    model = AskSightModel(config, device="cpu", dtype="float32")
    load_projector(checkpoint, model)
    model.eval()

    predictions, latencies = [], []
    for image, record in zip(images, records, strict=True):
        started = time.perf_counter()
        predictions.append(model.generate([image], [record["question"]])[0])
        latencies.append(time.perf_counter() - started)

    non_ascii = sum(1 for p in predictions if any(ord(c) > 127 for c in p))
    avg_words = statistics.mean(len(p.split()) for p in predictions)
    results[name] = {
        "vqa_accuracy": round(vqa_accuracy(predictions, references), 4),
        "non_ascii_predictions": non_ascii,
        "avg_words": round(avg_words, 1),
        "median_latency_s": round(statistics.median(latencies), 2),
        "samples": predictions[:4],
    }
    print(
        f"{name:>16}: acc {results[name]['vqa_accuracy']:.3f} | "
        f"non-ascii {non_ascii}/{len(predictions)} | avg words {avg_words:.1f}"
    )

Path("/tmp/opencode/prompt_experiment.json").write_text(json.dumps(results, indent=2))
print("\nsaved /tmp/opencode/prompt_experiment.json")
