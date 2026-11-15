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
    "blind and low-vision users. Answer in English with a single word or "
    "short phrase. Do not write a sentence."
)

# Hard cap for generated tokens so a malformed config cannot make one request
# run unbounded (the service exposes no per-request token override).
MAX_NEW_TOKENS_LIMIT = 128


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


def validate_model_config(config: ModelConfig) -> None:
    """Reject settings that would make a checkpoint unservable or unreproducible.

    Remote backbones must be pinned by revision. Local paths are allowed
    unpinned because they are fixtures or already-fetched snapshots.
    """
    if not config.version.strip():
        raise ValueError("model config must set a non-empty version")
    if not config.system_prompt.strip():
        raise ValueError("model config must set a non-empty system_prompt")
    if not 1 <= config.max_new_tokens <= MAX_NEW_TOKENS_LIMIT:
        raise ValueError(
            f"max_new_tokens must be between 1 and {MAX_NEW_TOKENS_LIMIT},"
            f" got {config.max_new_tokens}"
        )
    if config.connector_hidden is not None and config.connector_hidden <= 0:
        raise ValueError("connector_hidden must be positive when set")
    for label, name, revision in (
        ("vision", config.vision_model, config.vision_revision),
        ("lm", config.lm_model, config.lm_revision),
    ):
        if revision is None and not Path(name).exists():
            raise ValueError(
                f"{label} model {name!r} has no pinned revision; set"
                f" {label}_revision so the checkpoint stays reproducible"
            )
