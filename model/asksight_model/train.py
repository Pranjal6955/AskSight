"""Train the projection connector with the frozen backbones (B4).

Only the connector receives gradients, so checkpoints are a few MB and stay
reproducible from the pinned backbone revisions + seed.

Usage (from `model/`):
    python -m asksight_model.train --config configs/default.yaml
"""

from __future__ import annotations

import argparse
import json
import math
import platform
import random
import subprocess
import time
from dataclasses import asdict
from datetime import UTC, datetime
from importlib import metadata
from pathlib import Path

import torch
from PIL import Image

from .config import ModelConfig, TrainConfig, load_configs
from .pipeline import AskSightModel, load_projector, save_checkpoint, write_manifest


def load_jsonl(path: Path) -> list[dict]:
    with open(path) as handle:
        return [json.loads(line) for line in handle if line.strip()]


def _code_revision() -> dict:
    """Best-effort git revision plus dirty flag; not fatal outside a source checkout."""
    repo = Path(__file__).resolve().parents[2]
    try:
        revision = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=repo, text=True, stderr=subprocess.DEVNULL
        ).strip()
        dirty = bool(
            subprocess.check_output(
                ["git", "status", "--porcelain"], cwd=repo, text=True, stderr=subprocess.DEVNULL
            ).strip()
        )
        return {"revision": revision or None, "dirty": dirty}
    except (OSError, subprocess.CalledProcessError):
        return {"revision": None, "dirty": None}


def _dependency_versions() -> dict[str, str | None]:
    versions: dict[str, str | None] = {"python": platform.python_version()}
    for package in ("torch", "transformers", "pillow", "safetensors", "pyyaml"):
        try:
            versions[package] = metadata.version(package)
        except metadata.PackageNotFoundError:
            versions[package] = None
    return versions


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


def _cosine_with_warmup_factor(current_step: int, warmup_steps: int, total_steps: int) -> float:
    if current_step < warmup_steps:
        return float(current_step) / float(max(1, warmup_steps))
    progress = float(current_step - warmup_steps) / float(max(1, total_steps - warmup_steps))
    return max(0.0, 0.5 * (1.0 + math.cos(math.pi * progress)))


def train(model_config: ModelConfig, train_config: TrainConfig) -> dict:
    started_at = datetime.now(UTC).isoformat()
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

    # Optional: load pretrained connector from Stage 1 before attaching LoRA or starting Stage 2
    if train_config.init_projector_from:
        stage1_path = Path(train_config.init_projector_from)
        print(f"initializing connector weights from {stage1_path}")
        load_projector(stage1_path, model)

    if model_config.lora_rank is not None:
        model.enable_lora()
    if train_config.gradient_checkpointing:
        model.enable_gradient_checkpointing()
    model.train_mode()  # vision stays in eval mode; connector/LoRA train

    param_groups = model.get_parameter_groups(
        connector_lr=train_config.lr,
        lora_lr=train_config.lora_lr,
        weight_decay=train_config.weight_decay,
    )
    optimizer = torch.optim.AdamW(param_groups)

    accum_steps = max(1, train_config.gradient_accumulation_steps)
    total_batches = math.ceil(len(records) / train_config.batch_size)
    total_optimizer_steps = math.ceil(total_batches / accum_steps) * train_config.epochs
    warmup_steps = int(total_optimizer_steps * train_config.warmup_ratio)

    scheduler = torch.optim.lr_scheduler.LambdaLR(
        optimizer,
        lr_lambda=lambda step: _cosine_with_warmup_factor(
            step, warmup_steps, total_optimizer_steps
        ),
    )

    rng = random.Random(train_config.seed)
    history = []
    best_val_loss = float("inf")
    checkpoint_dir = Path(train_config.out_dir) / train_config.version
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    optimizer_step_count = 0
    for epoch in range(train_config.epochs):
        started = time.perf_counter()
        losses = []
        optimizer.zero_grad(set_to_none=True)

        for step, batch in enumerate(_batches(records, train_config.batch_size, rng)):
            loaded = _load_batch(batch, data_dir)
            if loaded is None:
                continue
            images, questions, answers = loaded
            loss = model(images, questions, answers)
            scaled_loss = loss / accum_steps
            scaled_loss.backward()
            losses.append(loss.item())

            if (step + 1) % accum_steps == 0 or (step + 1) == total_batches:
                torch.nn.utils.clip_grad_norm_(model.trainable_parameters(), 1.0)
                optimizer.step()
                scheduler.step()
                optimizer.zero_grad(set_to_none=True)
                optimizer_step_count += 1

            if step % (10 * accum_steps) == 0:
                lrs = [
                    f"{g.get('name', i)}:{g['lr']:.2e}"
                    for i, g in enumerate(optimizer.param_groups)
                ]
                print(f"epoch {epoch} step {step}: loss {loss.item():.4f} (lrs: {', '.join(lrs)})")

        model.eval()  # disable LoRA dropout for validation
        val_loss = _val_loss(model, val_records, data_dir, train_config.batch_size)
        model.train_mode()

        epoch_metrics = {
            "epoch": epoch,
            "train_loss": sum(losses) / max(len(losses), 1),
            "val_loss": val_loss,
            "seconds": round(time.perf_counter() - started, 1),
        }
        history.append(epoch_metrics)
        print(json.dumps(epoch_metrics))

        # Validation-based checkpoint saving
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            model_config.version = train_config.version
            save_checkpoint(checkpoint_dir, model)
            print(f"epoch {epoch}: new best val_loss {val_loss:.4f} saved to {checkpoint_dir}")

    # Ensure at least one checkpoint is saved
    if not (checkpoint_dir / "projector.safetensors").exists():
        model_config.version = train_config.version
        save_checkpoint(checkpoint_dir, model)

    data_meta_path = data_dir / "meta.json"
    data_meta = None
    if data_meta_path.exists():
        data_meta = json.loads(data_meta_path.read_text())
        (checkpoint_dir / "data_meta.json").write_text(data_meta_path.read_text())
    else:  # do not leave a previous run's provenance in an overwritten checkpoint
        (checkpoint_dir / "data_meta.json").unlink(missing_ok=True)
    write_manifest(checkpoint_dir)  # include the copied split provenance

    metrics = {
        "version": train_config.version,
        "seed": train_config.seed,
        "started_at": started_at,
        "finished_at": datetime.now(UTC).isoformat(),
        "device": str(model.device),
        "dtype": str(model.dtype),
        "gpu": torch.cuda.get_device_name(0) if model.device.type == "cuda" else None,
        "python": platform.python_version(),
        "code": _code_revision(),
        "dependencies": _dependency_versions(),
        "data_meta": data_meta,
        "epochs": history,
        "best_val_loss": best_val_loss,
        "trainable_parameters": sum(p.numel() for p in model.trainable_parameters()),
        "lora_enabled": model.lora_enabled,
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
    parser.add_argument(
        "--lora-rank",
        type=int,
        default=None,
        help="enable LoRA on the LM with this rank (overrides config)",
    )
    parser.add_argument(
        "--lora-lr",
        type=float,
        default=None,
        help="learning rate for LoRA parameters (defaults to lr / 10)",
    )
    parser.add_argument(
        "--init-projector-from",
        type=Path,
        default=None,
        help="path to Stage 1 checkpoint directory to initialize connector weights",
    )
    parser.add_argument(
        "--grad-accum",
        type=int,
        default=None,
        help="gradient accumulation steps",
    )
    parser.add_argument(
        "--stage",
        type=int,
        default=None,
        choices=[1, 2],
        help="training stage: 1 (connector-only alignment) or 2 (visual instruction tuning)",
    )
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
    if args.lora_rank is not None:
        model_config.lora_rank = args.lora_rank
    if args.lora_lr is not None:
        train_config.lora_lr = args.lora_lr
    if args.init_projector_from is not None:
        train_config.init_projector_from = str(args.init_projector_from)
    if args.grad_accum is not None:
        train_config.gradient_accumulation_steps = args.grad_accum
    if args.stage is not None:
        train_config.stage = args.stage
        if args.stage == 1:
            model_config.lora_rank = None
    train(model_config, train_config)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
