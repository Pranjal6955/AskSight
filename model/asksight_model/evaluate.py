"""Evaluate a trained checkpoint on the held-out split (B6).

Reports the standard VQA accuracy metric (with the official answer
normalization ported from the VQA v2 evaluation code), inference latency, and
writes predictions plus a metrics section into the checkpoint directory.

Usage (from `model/`):
    python -m asksight_model.evaluate --checkpoint checkpoints/v0.1
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import time
from pathlib import Path

from PIL import Image

from .service import LocalInferenceService
from .train import load_jsonl

# Official VQA v2 evaluation normalization (ported from the VQA eval script).
_CONTRACTIONS = {
    "aint": "ain't",
    "arent": "aren't",
    "cant": "can't",
    "couldve": "could've",
    "couldnt": "couldn't",
    "couldn'tve": "couldn't've",
    "couldnt've": "couldn't've",
    "didnt": "didn't",
    "doesnt": "doesn't",
    "dont": "don't",
    "hadnt": "hadn't",
    "hadnt've": "hadn't've",
    "hadn'tve": "hadn't've",
    "hasnt": "hasn't",
    "havent": "haven't",
    "hed": "he'd",
    "hed've": "he'd've",
    "he'dve": "he'd've",
    "hes": "he's",
    "howd": "how'd",
    "howll": "how'll",
    "hows": "how's",
    "Id've": "I'd've",
    "I'dve": "I'd've",
    "Im": "I'm",
    "Ive": "I've",
    "isnt": "isn't",
    "itd": "it'd",
    "itd've": "it'd've",
    "it'dve": "it'd've",
    "itll": "it'll",
    "let's": "let's",
    "maam": "ma'am",
    "mightnt": "mightn't",
    "mightnt've": "mightn't've",
    "mightn'tve": "mightn't've",
    "mightve": "might've",
    "mustnt": "mustn't",
    "mustve": "must've",
    "neednt": "needn't",
    "notve": "not've",
    "oclock": "o'clock",
    "oughtnt": "oughtn't",
    "ow's'at": "'ow's'at",
    "'ows'at": "'ow's'at",
    "'ow'sat": "'ow's'at",
    "shant": "shan't",
    "shed've": "she'd've",
    "she'dve": "she'd've",
    "she's": "she's",
    "shouldve": "should've",
    "shouldnt": "shouldn't",
    "shouldnt've": "shouldn't've",
    "shouldn'tve": "shouldn't've",
    "somebody'd": "somebodyd",
    "somebodyd've": "somebody'd've",
    "somebody'dve": "somebody'd've",
    "somebodyll": "somebody'll",
    "somebodys": "somebody's",
    "someoned": "someone'd",
    "someoned've": "someone'd've",
    "someone'dve": "someone'd've",
    "someonell": "someone'll",
    "someones": "someone's",
    "somethingd": "something'd",
    "somethingd've": "something'd've",
    "something'dve": "something'd've",
    "somethingll": "something'll",
    "thats": "that's",
    "thered": "there'd",
    "thered've": "there'd've",
    "there'dve": "there'd've",
    "therere": "there're",
    "theres": "there's",
    "theyd": "they'd",
    "theyd've": "they'd've",
    "they'dve": "they'd've",
    "theyll": "they'll",
    "theyre": "they're",
    "theyve": "they've",
    "twas": "'twas",
    "wasnt": "wasn't",
    "wed've": "we'd've",
    "we'dve": "we'd've",
    "weve": "we've",
    "werent": "weren't",
    "whatll": "what'll",
    "whatre": "what're",
    "whats": "what's",
    "whatve": "what've",
    "whens": "when's",
    "whered": "where'd",
    "wheres": "where's",
    "whereve": "where've",
    "whod": "who'd",
    "whod've": "who'd've",
    "who'dve": "who'd've",
    "wholl": "who'll",
    "whos": "who's",
    "whove": "who've",
    "whyll": "why'll",
    "whyre": "why're",
    "whys": "why's",
    "wont": "won't",
    "wouldve": "would've",
    "wouldnt": "wouldn't",
    "wouldnt've": "wouldn't've",
    "wouldn'tve": "wouldn't've",
    "yall": "y'all",
    "yall'll": "y'all'll",
    "y'allll": "y'all'll",
    "yall'd've": "y'all'd've",
    "y'alld've": "y'all'd've",
    "y'all'dve": "y'all'd've",
    "youd": "you'd",
    "youd've": "you'd've",
    "you'dve": "you'd've",
    "youll": "you'll",
    "youre": "you're",
    "youve": "you've",
}
_MANUAL_MAP = {
    "none": "0",
    "zero": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
}
_ARTICLES = {"a", "an", "the"}
_PUNCT = [
    ";",
    r"/",
    "[",
    "]",
    '"',
    "{",
    "}",
    "(",
    ")",
    "=",
    "+",
    "\\",
    "_",
    "-",
    ">",
    "<",
    "@",
    "`",
    ",",
    "?",
    "!",
]
_PERIOD_STRIP = re.compile(r"(?!<=\d)(\.)(?!\d)")
_COMMA_STRIP = re.compile(r"(\d)(\,)(\d)")


def _process_punctuation(text: str) -> str:
    out = text
    for punct in _PUNCT:
        if (punct + " " in text or " " + punct in text) or _COMMA_STRIP.search(text):
            out = out.replace(punct, "")
        else:
            out = out.replace(punct, " ")
    return _PERIOD_STRIP.sub("", out, re.UNICODE)


def _process_digit_article(text: str) -> str:
    words = []
    for word in text.lower().split():
        word = _MANUAL_MAP.get(word, word)
        if word not in _ARTICLES:
            words.append(_CONTRACTIONS.get(word, word))
    return " ".join(words)


def normalize_answer(text: str) -> str:
    text = text.replace("\n", " ").replace("\t", " ").strip()
    return _process_digit_article(_process_punctuation(text))


def vqa_accuracy(predictions: list[str], references: list[list[str]]) -> float:
    """Standard VQA accuracy: mean over samples of min(matching / 3, 1)."""
    if not predictions:
        return 0.0
    total = 0.0
    for prediction, answers in zip(predictions, references, strict=True):
        normalized = normalize_answer(prediction)
        matches = sum(1 for answer in answers if normalize_answer(answer) == normalized)
        total += min(matches / 3.0, 1.0)
    return total / len(predictions)


def evaluate(
    checkpoint_dir: Path,
    data_dir: Path,
    split: str = "test",
    limit: int | None = None,
    device: str = "auto",
) -> dict:
    records = load_jsonl(Path(data_dir) / f"{split}.jsonl")
    if limit is not None:
        records = records[:limit]
    if not records:
        raise ValueError(f"no records for split {split!r} in {data_dir}")

    service = LocalInferenceService(checkpoint_dir, device=device)
    predictions, references, latencies = [], [], []
    for record in records:
        image = Image.open(Path(data_dir) / record["image"]).convert("RGB")
        started = time.perf_counter()
        predictions.append(service.answer(image, record["question"]))
        latencies.append(time.perf_counter() - started)
        references.append(record["answers"])
        if len(predictions) % 50 == 0:
            print(f"evaluated {len(predictions)}/{len(records)}")

    latencies_sorted = sorted(latencies)
    result = {
        "split": split,
        "n": len(predictions),
        "vqa_accuracy": round(vqa_accuracy(predictions, references), 4),
        "latency_median_s": round(statistics.median(latencies_sorted), 3),
        "latency_p95_s": round(latencies_sorted[int(0.95 * (len(latencies_sorted) - 1))], 3),
        "device": service.model.device.type,
        "model_version": service.model_version,
    }

    predictions_path = Path(checkpoint_dir) / f"predictions_{split}.jsonl"
    with open(predictions_path, "w") as handle:
        for record, prediction in zip(records, predictions, strict=True):
            handle.write(
                json.dumps(
                    {
                        "question_id": record["question_id"],
                        "question": record["question"],
                        "prediction": prediction,
                        "reference": record["answers"][0],
                    }
                )
                + "\n"
            )

    metrics_path = Path(checkpoint_dir) / "metrics.json"
    metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
    metrics[f"eval_{split}"] = result
    metrics_path.write_text(json.dumps(metrics, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate an AskSight checkpoint")
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, default=Path("data/vqa"))
    parser.add_argument("--split", default="test", choices=["val", "test"])
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--device", default="auto")
    args = parser.parse_args(argv)
    evaluate(args.checkpoint, args.data_dir, args.split, args.limit, args.device)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
