"""AskSight unified Vision-Language Model package powered by Qwen3-VL-4B-Instruct."""

from .accessibility import (
    DESCRIBE_MODE_SYSTEM_PROMPT,
    GENERATION_KWARGS,
    QUESTION_MODE_SYSTEM_PROMPT,
    clean_tts_text,
    route_request,
)
from .qwen3_vl_engine import Qwen3VLAssistiveModel
from .service import (
    CLARIFY_ANSWER,
    PROTOCOL_VERSION,
    InferenceService,
    LocalInferenceService,
    MockInferenceService,
)
from .train_qlora import (
    AssistiveMultimodalDataset,
    build_lora_config,
    setup_model_and_lora,
    train_qlora,
)
from .vision_gate import (
    BLURRY_IMAGE_MESSAGE,
    DARK_IMAGE_MESSAGE,
    check_image_quality,
)

# Canonical model aliases
AskSightModel = Qwen3VLAssistiveModel

__all__ = [
    "AskSightModel",
    "AssistiveMultimodalDataset",
    "BLURRY_IMAGE_MESSAGE",
    "CLARIFY_ANSWER",
    "DARK_IMAGE_MESSAGE",
    "DESCRIBE_MODE_SYSTEM_PROMPT",
    "GENERATION_KWARGS",
    "InferenceService",
    "LocalInferenceService",
    "MockInferenceService",
    "PROTOCOL_VERSION",
    "QUESTION_MODE_SYSTEM_PROMPT",
    "Qwen3VLAssistiveModel",
    "build_lora_config",
    "check_image_quality",
    "clean_tts_text",
    "route_request",
    "setup_model_and_lora",
    "train_qlora",
]
