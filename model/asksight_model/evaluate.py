"""Evaluate a trained checkpoint on the held-out split (B6).

Reports the standard VQA accuracy metric (with the official answer
normalization ported from the VQA v2 evaluation code), inference latency, and
writes predictions plus a metrics section into the checkpoint directory.

Usage (from `model/`):
    python -m asksight_model.evaluate --checkpoint checkpoints/v0.1
"""

from __future__ import annotations

import argparse
import hashlib
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
_WORD_RE = re.compile(r"[A-Za-z0-9']+")


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


def answer_contains(prediction: str, reference: str) -> bool:
    """Whether the normalized reference is a token subsequence of the prediction."""
    predicted = normalize_answer(prediction).split()
    expected = normalize_answer(reference).split()
    if not predicted or not expected:
        return False
    size = len(expected)
    return any(predicted[i : i + size] == expected for i in range(len(predicted) - size + 1))


def vqa_accuracy_contains(predictions: list[str], references: list[list[str]]) -> float:
    """VQA accuracy for sentence answers that contain the short reference.

    The standard metric requires an exact answer match, so a correct sentence
    scores zero against one-word references. This variant keeps the same
    min(matches/3, 1) scoring but checks containment; for short predictions it
    matches the standard metric.
    """
    if not predictions:
        return 0.0
    total = 0.0
    for prediction, answers in zip(predictions, references, strict=True):
        matches = sum(1 for answer in answers if answer_contains(prediction, answer))
        total += min(matches / 3.0, 1.0)
    return total / len(predictions)


def is_complete_sentence(text: str) -> bool:
    words = _WORD_RE.findall(text.strip())
    return len(words) >= 2 and text.strip().endswith((".", "!", "?"))


def sentence_rate(predictions: list[str]) -> float:
    if not predictions:
        return 0.0
    return sum(is_complete_sentence(prediction) for prediction in predictions) / len(predictions)


def mean_words(predictions: list[str]) -> float:
    if not predictions:
        return 0.0
    return sum(len(_WORD_RE.findall(prediction)) for prediction in predictions) / len(predictions)


_FACT_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "of",
        "in",
        "on",
        "at",
        "to",
        "for",
        "with",
        "and",
        "or",
        "but",
        "it",
        "this",
        "that",
        "these",
        "those",
        "there",
        "here",
        "as",
        "by",
        "from",
        "into",
        "over",
        "under",
        "near",
        "next",
        "visible",
        "image",
        "photo",
        "picture",
        "main",
        "subject",
    }
)


def _content_terms(text: str) -> set[str]:
    terms = set()
    for word in re.findall(r"[a-z0-9]+", text.lower()):
        if len(word) < 2 or word in _FACT_STOPWORDS:
            continue
        if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
            word = word[:-1]
        terms.add(word)
    return terms


def fact_coverage(prediction: str, facts: list[str], threshold: float = 0.5) -> float | None:
    """Heuristic share of expected facts whose content terms appear in the answer.

    Facts are prose rubrics, so this is a review aid, not a correctness judge;
    it reports how much of each fact's vocabulary is present.
    """
    if not facts:
        return None
    predicted = _content_terms(prediction)
    hits = 0
    for fact in facts:
        terms = _content_terms(fact)
        if terms and len(terms & predicted) / len(terms) >= threshold:
            hits += 1
    return hits / len(facts)


def fact_metrics(rows: list[tuple[str, list[str] | None]]) -> dict:
    scores = [
        score
        for prediction, facts in rows
        if (score := fact_coverage(prediction, facts or [])) is not None
    ]
    if not scores:
        return {}
    return {
        "fact_recall": round(sum(scores) / len(scores), 4),
        "all_facts_rate": round(sum(score == 1.0 for score in scores) / len(scores), 4),
    }


def evaluate(
    checkpoint_dir: Path,
    data_dir: Path,
    split: str = "test",
    limit: int | None = None,
    device: str = "auto",
    dtype: str = "auto",
) -> dict:
    records = load_jsonl(Path(data_dir) / f"{split}.jsonl")
    # Caption validation rows added to val.jsonl have no VQA references.
    records = [record for record in records if "answers" in record]
    if limit is not None:
        records = records[:limit]
    if not records:
        raise ValueError(f"no records for split {split!r} in {data_dir}")

    service = LocalInferenceService(checkpoint_dir, device=device, dtype=dtype)
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
    stats = service.stats()
    prompt = service.model.config.system_prompt
    result = {
        "split": split,
        "n": len(predictions),
        "vqa_accuracy": round(vqa_accuracy(predictions, references), 4),
        "vqa_accuracy_contains": round(vqa_accuracy_contains(predictions, references), 4),
        "sentence_rate": round(sentence_rate(predictions), 4),
        "mean_words": round(mean_words(predictions), 1),
        "latency_median_s": round(statistics.median(latencies_sorted), 3),
        "latency_p95_s": round(latencies_sorted[int(0.95 * (len(latencies_sorted) - 1))], 3),
        "device": service.model.device.type,
        "model_version": service.model_version,
        "system_prompt": prompt,
        "system_prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
        "max_new_tokens": service.model.config.max_new_tokens,
        "startup_seconds": stats["startup_seconds"],
        "process_rss_mb": stats["process_rss_mb"],
    }
    direct_rows = [
        (record, prediction)
        for record, prediction in zip(records, predictions, strict=True)
        if isinstance(record.get("references"), list) and record["references"]
    ]
    if direct_rows:
        result["direct_vqa_n"] = len(direct_rows)
        result["direct_vqa_accuracy"] = round(
            vqa_accuracy(
                [prediction for _, prediction in direct_rows],
                [record["references"] for record, _ in direct_rows],
            ),
            4,
        )

    predictions_path = Path(checkpoint_dir) / f"predictions_{split}.jsonl"
    with open(predictions_path, "w") as handle:
        for record, prediction in zip(records, predictions, strict=True):
            handle.write(
                json.dumps(
                    {
                        "question_id": record["question_id"],
                        "image_id": record["image_id"],
                        "question": record["question"],
                        "prediction": prediction,
                        "short_answer": record.get("short_answer"),
                        "answer_style": record.get("answer_style"),
                        "references": record["answers"],
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


def evaluate_questions(
    checkpoint_dir: Path,
    questions_file: Path,
    limit: int | None = None,
    device: str = "auto",
    dtype: str = "auto",
) -> dict:
    """Generate predictions for a fixed, hand-curated AskSight question set.

    Each JSONL row has `id`, `image`, `question`, and optional `category`.
    Images are resolved relative to the JSONL file. This path intentionally
    produces reviewable predictions without claiming an automatic quality score.
    """
    questions_file = Path(questions_file)
    records = load_jsonl(questions_file)
    if limit is not None:
        records = records[:limit]
    if not records:
        raise ValueError(f"no questions in {questions_file}")
    for index, record in enumerate(records):
        if not isinstance(record.get("id"), str) or not record["id"].strip():
            raise ValueError(f"record {index} must have a non-empty 'id'")
        for field in ("image", "question"):
            if not isinstance(record.get(field), str) or not record[field].strip():
                raise ValueError(f"record {index} must have a non-empty {field!r}")

    service = LocalInferenceService(checkpoint_dir, device=device, dtype=dtype)
    predictions, latencies = [], []
    for record in records:
        image = Image.open(questions_file.parent / record["image"]).convert("RGB")
        started = time.perf_counter()
        predictions.append(service.answer(image, record["question"]))
        latencies.append(time.perf_counter() - started)

    latencies_sorted = sorted(latencies)
    stats = service.stats()
    prompt = service.model.config.system_prompt
    result = {
        "evaluation": "asksight_questions",
        "question_set": questions_file.name,
        "question_set_sha256": hashlib.sha256(questions_file.read_bytes()).hexdigest(),
        "n": len(records),
        "model_version": service.model_version,
        "system_prompt": prompt,
        "system_prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
        "max_new_tokens": service.model.config.max_new_tokens,
        "device": service.model.device.type,
        "sentence_rate": round(sentence_rate(predictions), 4),
        "mean_words": round(mean_words(predictions), 1),
        "latency_median_s": round(statistics.median(latencies_sorted), 3),
        "latency_p95_s": round(latencies_sorted[int(0.95 * (len(latencies_sorted) - 1))], 3),
        "startup_seconds": stats["startup_seconds"],
        "process_rss_mb": stats["process_rss_mb"],
    }
    direct = [
        (record, prediction)
        for record, prediction in zip(records, predictions, strict=True)
        if isinstance(record.get("references"), list) and record["references"]
    ]
    if direct:
        result["direct_vqa_n"] = len(direct)
        result["direct_vqa_accuracy"] = round(
            vqa_accuracy(
                [prediction for _, prediction in direct],
                [record["references"] for record, _ in direct],
            ),
            4,
        )
        result["direct_vqa_accuracy_contains"] = round(
            vqa_accuracy_contains(
                [prediction for _, prediction in direct],
                [record["references"] for record, _ in direct],
            ),
            4,
        )
        result["direct_sentence_rate"] = round(
            sentence_rate([prediction for _, prediction in direct]), 4
        )
    result.update(
        fact_metrics(
            [
                (prediction, record.get("expected_facts"))
                for record, prediction in zip(records, predictions, strict=True)
            ]
        )
    )
    predictions_path = Path(checkpoint_dir) / f"predictions_asksight_{questions_file.stem}.jsonl"
    with predictions_path.open("w") as handle:
        for record, prediction in zip(records, predictions, strict=True):
            handle.write(
                json.dumps(
                    {
                        "id": record["id"],
                        "image": record["image"],
                        "question": record["question"],
                        "category": record.get("category"),
                        "references": record.get("references"),
                        "expected_facts": record.get("expected_facts"),
                        "prediction": prediction,
                    }
                )
                + "\n"
            )
    result["predictions_file"] = predictions_path.name
    metrics_path = Path(checkpoint_dir) / "metrics.json"
    metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
    metrics[f"eval_asksight_{questions_file.stem}"] = result
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
    parser.add_argument("--dtype", default="auto")
    parser.add_argument(
        "--questions-file",
        type=Path,
        help="run a fixed AskSight JSONL question set instead of VQA v2",
    )
    args = parser.parse_args(argv)
    if args.questions_file:
        evaluate_questions(
            args.checkpoint, args.questions_file, args.limit, args.device, args.dtype
        )
    else:
        evaluate(args.checkpoint, args.data_dir, args.split, args.limit, args.device, args.dtype)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
