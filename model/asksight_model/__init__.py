"""AskSight LLaVA-style multimodal model package (Track B)."""

from .config import ModelConfig, TrainConfig, load_configs
from .pipeline import AskSightModel, load_projector, save_checkpoint
from .service import (
    CLARIFY_ANSWER,
    InferenceService,
    LocalInferenceService,
    MockInferenceService,
)

__all__ = [
    "AskSightModel",
    "CLARIFY_ANSWER",
    "InferenceService",
    "LocalInferenceService",
    "MockInferenceService",
    "ModelConfig",
    "TrainConfig",
    "load_configs",
    "load_projector",
    "save_checkpoint",
]
