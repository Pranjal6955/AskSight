"""AskSight LLaVA-style multimodal model package (Track B)."""

from .config import ModelConfig, TrainConfig, load_configs
from .pipeline import AskSightModel, load_projector, save_checkpoint, verify_checkpoint
from .service import (
    AnswerResponse,
    CLARIFY_ANSWER,
    PROTOCOL_VERSION,
    InferenceService,
    LocalInferenceService,
    MockInferenceService,
    Turn,
    UNSURE_ANSWER,
)

__all__ = [
    "AskSightModel",
    "AnswerResponse",
    "CLARIFY_ANSWER",
    "InferenceService",
    "LocalInferenceService",
    "MockInferenceService",
    "ModelConfig",
    "PROTOCOL_VERSION",
    "TrainConfig",
    "Turn",
    "UNSURE_ANSWER",
    "load_configs",
    "load_projector",
    "save_checkpoint",
    "verify_checkpoint",
]
