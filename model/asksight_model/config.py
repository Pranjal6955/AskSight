"""Configuration for the AskSight model package.

Backbone checkpoints are pinned by revision hash so training runs and
checkpoints are reproducible. The defaults are documented in `model/README.md`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, fields
from pathlib import Path

import yaml

VISION_MODEL = "openai/clip-vit-base-patch32"
VISION_REVISION = "3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268"
LM_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
LM_REVISION = "989aa7980e4cf806f80c7fef2b1adb7bc71aa306"

DEFAULT_SYSTEM_PROMPT = (
    "You are AskSight, an assistant that answers questions about images for "
    "blind and low-vision users. Answer in one short, factual sentence."
)


@dataclass
class ModelConfig:
    """Backbone, prompt, and generation settings. Saved into every checkpoint."""

    version: str = "untrained"
    vision_model: str = VISION_MODEL
    vision_revision: str | None = VISION_REVISION
    lm_model: str = LM_MODEL
    lm_revision: str | None = LM_REVISION
    connector_hidden: int | None = None  # default: LM hidden size
    system_prompt: str = DEFAULT_SYSTEM_PROMPT
    max_new_tokens: int = 24

    @classmethod
    def from_dict(cls, data: dict) -> ModelConfig:
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in known})

    def to_dict(self) -> dict:
        return asdict(self)

    def save(self, path: Path) -> None:
        Path(path).write_text(yaml.safe_dump(self.to_dict(), sort_keys=False))

    @classmethod
    def load(cls, path: Path) -> ModelConfig:
        return cls.from_dict(yaml.safe_load(Path(path).read_text()) or {})


@dataclass
class TrainConfig:
    """Projection-connector training settings (B4)."""

    data_dir: str = "data/vqa"
    out_dir: str = "checkpoints"
    version: str = "v0.1"
    epochs: int = 2
    batch_size: int = 4
    lr: float = 5e-4
    weight_decay: float = 0.0
    seed: int = 0
    device: str = "auto"
    dtype: str = "auto"
    gradient_checkpointing: bool = True
    limit: int | None = None  # cap training records for smoke runs

    @classmethod
    def from_dict(cls, data: dict) -> TrainConfig:
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in known})


def load_configs(path: Path) -> tuple[ModelConfig, TrainConfig]:
    """Load one YAML file with optional `model:` and `train:` sections."""
    data = yaml.safe_load(Path(path).read_text()) or {}
    return (
        ModelConfig.from_dict(data.get("model") or {}),
        TrainConfig.from_dict(data.get("train") or {}),
    )
