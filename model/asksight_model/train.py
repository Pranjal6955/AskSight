"""Train the projection connector with the frozen backbones (B4).

Only the connector receives gradients, so checkpoints are a few MB and stay
reproducible from the pinned backbone revisions + seed.

Usage (from `model/`):
    python -m asksight_model.train --config configs/default.yaml
"""

from __future__ import annotations

import argparse
import json
import random
import time
from dataclasses import asdict
from pathlib import Path

import torch
from PIL import Image

from .config import ModelConfig, TrainConfig, load_configs
from .pipeline import AskSightModel, save_checkpoint


def load_jsonl(path: Path) -> list[dict]:
    with open(path) as handle:
        return [json.loads(line) for line in handle if line.strip()]


def _load_batch(records: list[dict], data_dir: Path) -> tuple[list, list[str], list[str]] | None:
    images, questions, answers = [], [], []
    for record in records:
        try:
            images.append(Image.open(data_dir / record["image"]).convert("RGB"))
        except Exception as exc:  # noqa: BLE001 - a single bad image must not kill a run
            print(f"warning: skipping unreadable image for question {record['question_id']}: {exc}")
            return None
        questions.append(record["question"])
        answers.append(record["answer"])
    return images, questions, answers


def _batches(records: list[dict], batch_size: int, rng: random.Random):
    order = list(range(len(records)))
    rng.shuffle(order)
    for start in range(0, len(order), batch_size):
        yield [records[i] for i in order[start : start + batch_size]]


def _val_loss(model: AskSightModel, records: list[dict], data_dir: Path, batch_size: int) -> float:
    total, count = 0.0, 0
    with torch.no_grad():
        for batch in _batches(records, batch_size, random.Random(0)):  # fixed order: comparable
            loaded = _load_batch(batch, data_dir)
            if loaded is None:
                continue
            images, questions, answers = loaded
            total += model(images, questions, answers).item() * len(images)
            count += len(images)
    return total / max(count, 1)


def train(model_config: ModelConfig, train_config: TrainConfig) -> dict:
    data_dir = Path(train_config.data_dir)
    records = load_jsonl(data_dir / "train.jsonl")
    val_records = load_jsonl(data_dir / "val.jsonl")
    if train_config.limit is not None:
        records = records[: train_config.limit]
        val_records = val_records[: max(train_config.limit // 8, 1)]
    if not records:
        raise ValueError(f"no training records in {data_dir / 'train.jsonl'}")

    random.seed(train_config.seed)
    torch.manual_seed(train_config.seed)

    model = AskSightModel(model_config, device=train_config.device, dtype=train_config.dtype)
    if train_config.gradient_checkpointing:
        model.enable_gradient_checkpointing()
    model.connector.train()  # backbones stay in eval mode

    optimizer = torch.optim.AdamW(
        model.trainable_parameters(), lr=train_config.lr, weight_decay=train_config.weight_decay
    )
    rng = random.Random(train_config.seed)
    history = []
    for epoch in range(train_config.epochs):
        started = time.perf_counter()
        losses = []
        for step, batch in enumerate(_batches(records, train_config.batch_size, rng)):
            loaded = _load_batch(batch, data_dir)
            if loaded is None:
                continue
            images, questions, answers = loaded
            loss = model(images, questions, answers)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.trainable_parameters(), 1.0)
            optimizer.step()
            optimizer.zero_grad(set_to_none=True)
            losses.append(loss.item())
            if step % 10 == 0:
                print(f"epoch {epoch} step {step}: loss {loss.item():.4f}")
        epoch_metrics = {
            "epoch": epoch,
            "train_loss": sum(losses) / max(len(losses), 1),
            "val_loss": _val_loss(model, val_records, data_dir, train_config.batch_size),
            "seconds": round(time.perf_counter() - started, 1),
        }
        history.append(epoch_metrics)
        print(json.dumps(epoch_metrics))

    model_config.version = train_config.version
    checkpoint_dir = Path(train_config.out_dir) / train_config.version
    save_checkpoint(checkpoint_dir, model)
    data_meta = data_dir / "meta.json"
    if data_meta.exists():
        (checkpoint_dir / "data_meta.json").write_text(data_meta.read_text())

    metrics = {
        "version": train_config.version,
        "seed": train_config.seed,
        "device": str(model.device),
        "dtype": str(model.dtype),
        "gpu": torch.cuda.get_device_name(0) if model.device.type == "cuda" else None,
        "epochs": history,
        "model_config": model_config.to_dict(),
        "train_config": asdict(train_config),
    }
    (checkpoint_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    print(f"checkpoint saved to {checkpoint_dir}")
    return metrics


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train the AskSight projection connector")
    parser.add_argument("--config", type=Path, default=Path("configs/default.yaml"))
    parser.add_argument("--limit", type=int, default=None, help="cap training records (smoke runs)")
    parser.add_argument("--device", default=None, help="override config device (auto/cpu/cuda)")
    parser.add_argument(
        "--dtype", default=None, help="override config dtype (auto/float32/bfloat16)"
    )
    parser.add_argument("--version", default=None, help="override checkpoint version name")
    args = parser.parse_args(argv)

    model_config, train_config = load_configs(args.config)
    if args.limit is not None:
        train_config.limit = args.limit
    if args.device:
        train_config.device = args.device
    if args.dtype:
        train_config.dtype = args.dtype
    if args.version:
        train_config.version = args.version
    train(model_config, train_config)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
