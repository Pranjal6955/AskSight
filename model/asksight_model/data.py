"""VQA v2 data pipeline (B3).

Downloads the official VQA v2 question/annotation zips plus only the needed
COCO images, and writes disjoint `train.jsonl` / `val.jsonl` / `test.jsonl`
subsets. Splits are assigned by image, so no image or (image, question) pair
can leak across splits by construction.

Usage (from `model/`):
    python -m asksight_model.data --out data/vqa --train 2000 --val 250 --test 250
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

VQA_URLS = {
    "train": {
        "questions": "https://s3.amazonaws.com/cvmlp/vqa/mscoco/vqa/v2_Questions_Train_mscoco.zip",
        "annotations": "https://s3.amazonaws.com/cvmlp/vqa/mscoco/vqa/v2_Annotations_Train_mscoco.zip",
    },
    "val": {
        "questions": "https://s3.amazonaws.com/cvmlp/vqa/mscoco/vqa/v2_Questions_Val_mscoco.zip",
        "annotations": "https://s3.amazonaws.com/cvmlp/vqa/mscoco/vqa/v2_Annotations_Val_mscoco.zip",
    },
}


def _download(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url) as response, open(tmp, "wb") as out:
        shutil.copyfileobj(response, out)
    tmp.rename(dest)
    return dest


def download_annotations(cache_dir: Path) -> dict[str, Path]:
    """Fetch + extract the official VQA v2 questions/annotations zips once."""
    paths: dict[str, Path] = {}
    for pool, spec in VQA_URLS.items():
        for kind in ("questions", "annotations"):
            zip_path = _download(spec[kind], cache_dir / f"{pool}_{kind}.zip")
            extract_dir = cache_dir / f"{pool}_{kind}"
            if not extract_dir.exists():
                extract_dir.mkdir(parents=True)
                with zipfile.ZipFile(zip_path) as zf:
                    zf.extractall(extract_dir)
            json_file = next(extract_dir.glob("*.json"))
            paths[f"{pool}_{kind}"] = json_file
    return paths


def load_records(questions_path: Path, annotations_path: Path) -> list[dict]:
    """Join questions with answers into flat records."""
    questions = json.loads(questions_path.read_text())["questions"]
    annotations = {
        ann["question_id"]: ann for ann in json.loads(annotations_path.read_text())["annotations"]
    }
    records = []
    for question in questions:
        annotation = annotations.get(question["question_id"])
        if annotation is None:
            continue
        records.append(
            {
                "question_id": question["question_id"],
                "image_id": question["image_id"],
                "question": question["question"],
                "answers": [a["answer"] for a in annotation["answers"]],
            }
        )
    return records


def group_by_image(records: list[dict]) -> dict[int, list[dict]]:
    groups: dict[int, list[dict]] = {}
    for record in records:
        groups.setdefault(record["image_id"], []).append(record)
    return groups


def select_by_image(
    records: list[dict], target: int, rng: random.Random, image_ids: list[int] | None = None
) -> list[dict]:
    """Take whole per-image groups (shuffled deterministically) until `target` questions."""
    groups = group_by_image(records)
    if image_ids is not None:
        groups = {image_id: groups[image_id] for image_id in image_ids if image_id in groups}
    ordered = sorted(groups)
    rng.shuffle(ordered)
    selected: list[dict] = []
    for image_id in ordered:
        selected.extend(groups[image_id])
        if len(selected) >= target:
            break
    return selected


def split_by_image(records: list[dict], ratio: float, rng: random.Random) -> tuple[list, list]:
    """Split records into two disjoint-by-image halves."""
    image_ids = sorted(group_by_image(records))
    rng.shuffle(image_ids)
    cut = int(len(image_ids) * ratio)
    first_ids, second_ids = set(image_ids[:cut]), set(image_ids[cut:])
    first = [r for r in records if r["image_id"] in first_ids]
    second = [r for r in records if r["image_id"] in second_ids]
    return first, second


def image_filename(coco_split: str, image_id: int) -> str:
    return f"COCO_{coco_split}_{image_id:012d}.jpg"


def image_url(coco_split: str, image_id: int) -> str:
    return f"http://images.cocodataset.org/{coco_split}/{image_filename(coco_split, image_id)}"


def download_images(
    records: list[dict], coco_split: str, images_dir: Path, jobs: int = 8
) -> list[dict]:
    """Download images for the selected records; drop records whose image fails."""
    target_dir = images_dir / coco_split
    target_dir.mkdir(parents=True, exist_ok=True)
    kept: list[dict] = []

    def fetch(record: dict) -> bool:
        dest = target_dir / image_filename(coco_split, record["image_id"])
        try:
            _download(image_url(coco_split, record["image_id"]), dest)
            return True
        except Exception as exc:  # noqa: BLE001 - network failures are expected per-image
            print(f"warning: skipping image {record['image_id']}: {exc}")
            return False

    with ThreadPoolExecutor(max_workers=jobs) as pool:
        unique: dict[int, dict] = {r["image_id"]: r for r in records}
        results = list(pool.map(fetch, unique.values()))
    ok_ids = {image_id for image_id, ok in zip(unique, results, strict=True) if ok}
    kept = [r for r in records if r["image_id"] in ok_ids]
    return kept


def _write_split(path: Path, records: list[dict], images_subdir: str) -> None:
    with open(path, "w") as handle:
        for record in records:
            image = image_filename(images_subdir, record["image_id"])
            handle.write(
                json.dumps(
                    {
                        "image": f"images/{images_subdir}/{image}",
                        "question": record["question"],
                        # training target: majority vote over the 10 annotations
                        "answer": sorted(
                            record["answers"],
                            key=lambda a: (-record["answers"].count(a), a),
                        )[0],
                        "answers": record["answers"],
                        "image_id": record["image_id"],
                        "question_id": record["question_id"],
                    }
                )
                + "\n"
            )


def _assert_disjoint(splits: dict[str, list[dict]]) -> None:
    seen_images: dict[str, set] = {}
    for name, records in splits.items():
        seen_images[name] = {r["image_id"] for r in records}
        pairs = [(r["image_id"], r["question_id"]) for r in records]
        if len(pairs) != len(set(pairs)):
            raise ValueError(f"duplicate (image, question) pairs inside split {name!r}")
    names = sorted(splits)
    for i, a in enumerate(names):
        for b in names[i + 1 :]:
            overlap = seen_images[a] & seen_images[b]
            if overlap:
                raise ValueError(f"image leakage between {a!r} and {b!r}: {sorted(overlap)[:5]}")


def prepare(
    data_dir: Path,
    n_train: int = 2000,
    n_val: int = 250,
    n_test: int = 250,
    seed: int = 0,
    jobs: int = 8,
) -> dict:
    data_dir = Path(data_dir)
    cache_dir = data_dir / "_raw"
    paths = download_annotations(cache_dir)

    train_pool = load_records(paths["train_questions"], paths["train_annotations"])
    val_pool = load_records(paths["val_questions"], paths["val_annotations"])

    rng = random.Random(seed)
    train_records = select_by_image(train_pool, n_train, rng)
    val_half, test_half = split_by_image(val_pool, 0.5, rng)
    val_ids = sorted(group_by_image(val_half))
    test_ids = sorted(group_by_image(test_half))
    val_records = select_by_image(val_half, n_val, rng, image_ids=val_ids)
    test_records = select_by_image(test_half, n_test, rng, image_ids=test_ids)

    splits = {"train": train_records, "val": val_records, "test": test_records}
    _assert_disjoint(splits)

    images_dir = data_dir / "images"
    coco_split = {"train": "train2014", "val": "val2014", "test": "val2014"}
    for name, records in splits.items():
        kept = download_images(records, coco_split[name], images_dir, jobs)
        splits[name] = kept
        _write_split(data_dir / f"{name}.jsonl", kept, coco_split[name])
        print(f"{name}: {len(kept)} questions, {len({r['image_id'] for r in kept})} images")

    meta = {
        "seed": seed,
        "requested": {"train": n_train, "val": n_val, "test": n_test},
        "actual": {name: len(records) for name, records in splits.items()},
        "sources": VQA_URLS,
        "split_fingerprints": {
            name: hashlib.sha256(
                ",".join(
                    str(r["question_id"]) for r in sorted(records, key=lambda r: r["question_id"])
                ).encode()
            ).hexdigest()
            for name, records in splits.items()
        },
    }
    (data_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return meta


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Materialize a VQA v2 subset with disjoint splits")
    parser.add_argument("--out", type=Path, default=Path("data/vqa"), help="output directory")
    parser.add_argument("--train", type=int, default=2000, help="number of training questions")
    parser.add_argument("--val", type=int, default=250, help="number of validation questions")
    parser.add_argument("--test", type=int, default=250, help="number of held-out test questions")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--jobs", type=int, default=8, help="parallel image downloads")
    args = parser.parse_args(argv)
    prepare(args.out, args.train, args.val, args.test, args.seed, args.jobs)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
