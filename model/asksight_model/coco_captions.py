"""Prepare image-description training rows from COCO Captions (train2014).

Usage from ``model/``::

    python -m asksight_model.coco_captions --data-dir data/vqa \
      --out data/asksight_coco_captions.jsonl --num-images 2000 --seed 0

The script samples whole training images, downloads only those images, and
emits all available human-written captions as ``Describe this photo`` targets.
Caption-train images cannot overlap VQA validation/test images. Caption
validation images are also kept separate from VQA training images.
"""

from __future__ import annotations

import argparse
import json
import random
import shutil
import time
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

COCO_CAPTIONS_URL = "https://images.cocodataset.org/annotations/annotations_trainval2014.zip"
COCO_IMAGE_URL = "https://images.cocodataset.org/train2014/COCO_train2014_{image_id:012d}.jpg"


def _download(url: str, destination: Path) -> None:
    if destination.is_file() and destination.stat().st_size:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=45) as response, temporary.open("wb") as out:
                shutil.copyfileobj(response, out)
            temporary.replace(destination)
            return
        except (OSError, urllib.error.URLError) as exc:
            last_error = exc
            temporary.unlink(missing_ok=True)
            if attempt < 2:
                time.sleep(1 + attempt)
    raise RuntimeError(f"could not download {url}: {last_error}") from last_error


def _load_captions(data_dir: Path, captions_json: Path | None) -> list[dict]:
    if captions_json is not None:
        return json.loads(captions_json.read_text())['annotations']

    archive = data_dir / "_raw" / "coco_captions_trainval2014.zip"
    _download(COCO_CAPTIONS_URL, archive)
    with zipfile.ZipFile(archive) as zf:
        member = "annotations/captions_train2014.json"
        if member not in zf.namelist():
            raise ValueError(f"{archive} does not contain {member}")
        return json.loads(zf.read(member))["annotations"]


def prepare(
    data_dir: Path,
    out_path: Path,
    num_images: int = 2000,
    val_images: int = 200,
    val_out_path: Path | None = None,
    seed: int = 0,
    captions_json: Path | None = None,
    jobs: int = 8,
) -> int:
    data_dir = Path(data_dir)
    out_path = Path(out_path)
    if num_images < 1 or val_images < 1:
        raise ValueError("num_images and val_images must be positive")
    if jobs < 1:
        raise ValueError("jobs must be positive")

    held_out_ids: set[int] = set()
    for split_name in ("val", "test"):
        split_path = data_dir / f"{split_name}.jsonl"
        if not split_path.exists():
            raise FileNotFoundError(f"missing {split_path}; prepare VQA data first")
        for line in split_path.read_text().splitlines():
            if line.strip():
                held_out_ids.add(int(json.loads(line)["image_id"]))
    vqa_train_ids = {
        int(json.loads(line)["image_id"])
        for line in (data_dir / "train.jsonl").read_text().splitlines()
        if line.strip()
    }

    grouped: dict[int, list[dict]] = defaultdict(list)
    for row in _load_captions(data_dir, captions_json):
        grouped[int(row["image_id"])].append(row)
    train_candidates = sorted(set(grouped) - held_out_ids)
    val_candidates = sorted(set(grouped) - held_out_ids - vqa_train_ids)
    if len(train_candidates) < num_images or len(val_candidates) < val_images:
        raise ValueError(
            f"requested {num_images} train and {val_images} validation caption images; "
            f"available: {len(train_candidates)} train, {len(val_candidates)} "
            "validation images after leakage checks"
        )
    rng = random.Random(seed)
    val_ids = sorted(rng.sample(val_candidates, val_images))
    train_pool = sorted(set(train_candidates) - set(val_ids))
    if len(train_pool) < num_images:
        raise ValueError("not enough non-validation images for the requested caption train set")
    train_ids = sorted(rng.sample(train_pool, num_images))
    selected_ids = train_ids + val_ids

    image_dir = data_dir / "images" / "train2014"
    paths = {
        image_id: image_dir / f"COCO_train2014_{image_id:012d}.jpg"
        for image_id in selected_ids
    }

    def fetch(image_id: int) -> tuple[int, bool]:
        try:
            _download(COCO_IMAGE_URL.format(image_id=image_id), paths[image_id])
            return image_id, True
        except (OSError, RuntimeError) as exc:
            print(f"warning: skipping COCO image {image_id}: {exc}")
            return image_id, False

    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(max_workers=jobs) as pool:
        downloaded = {image_id for image_id, ok in pool.map(fetch, selected_ids) if ok}

    train_records = []
    val_records = []
    for image_id in selected_ids:
        if image_id not in downloaded:
            continue
        image_path = f"images/train2014/{paths[image_id].name}"
        target = train_records if image_id in train_ids else val_records
        for caption in grouped[image_id]:
            target.append(
                {
                    "question_id": f"coco-caption-{caption['id']}",
                    "image_id": image_id,
                    "image": image_path,
                    "question": "Describe this photo.",
                    "answer": caption["caption"].strip(),
                    "category": "description",
                    "source": "coco_captions_train2014",
                }
            )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in train_records)
    )
    if val_out_path is not None:
        val_out_path = Path(val_out_path)
        val_out_path.parent.mkdir(parents=True, exist_ok=True)
        val_out_path.write_text(
            "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in val_records)
        )
    print(
        f"wrote {len(train_records)} train captions from "
        f"{len(downloaded.intersection(train_ids))}/{num_images} images to {out_path}; "
        f"wrote {len(val_records)} validation captions from "
        f"{len(downloaded.intersection(val_ids))}/{val_images} images"
        + (f" to {val_out_path}" if val_out_path is not None else "")
    )
    return len(train_records)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Prepare COCO caption training examples")
    parser.add_argument("--data-dir", type=Path, default=Path("data/vqa"))
    parser.add_argument("--out", type=Path, default=Path("data/asksight_coco_captions.jsonl"))
    parser.add_argument("--num-images", type=int, default=2000)
    parser.add_argument("--val-images", type=int, default=200)
    parser.add_argument(
        "--val-out", type=Path, default=Path("data/asksight_coco_captions_val.jsonl")
    )
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--captions-json", type=Path)
    parser.add_argument("--jobs", type=int, default=8)
    args = parser.parse_args(argv)
    prepare(
        args.data_dir,
        args.out,
        args.num_images,
        args.val_images,
        args.val_out,
        args.seed,
        args.captions_json,
        args.jobs,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
