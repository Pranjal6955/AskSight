"""Accessibility system prompts and routing for blind and low-vision users.

Supports dual-mode routing:
- Describe Mode (question is empty/None)
- Question Mode (question is non-empty)
"""

from __future__ import annotations

import re
from typing import Final

# Describe Mode System Prompt (empty/null question)
DESCRIBE_MODE_SYSTEM_PROMPT: Final[str] = (
    "You are a visual assistant for a person with low vision. "
    "Describe this image in 2 to 4 short, clear spoken sentences. "
    "Prioritize in this exact order: (1) Immediate physical hazards or obstacles "
    "in the walking path, "
    "(2) Main objects or people and their positions using clock-face directions "
    "like 'at 2 o'clock', "
    "(3) Important readable signs or labels. "
    "Output plain spoken text only with no bullet points, Markdown formatting, "
    "or filler phrases like 'The image shows'. "
    "Keep your response under 60 words."
)

# Question Mode System Prompt (non-empty question)
QUESTION_MODE_SYSTEM_PROMPT: Final[str] = (
    "You are a visual assistant for a person with low vision. "
    "Answer the user's question directly and concisely based strictly on the image. "
    "Read any requested numbers, dosages, expiry dates, or labels word-for-word. "
    "If the requested text or object is blurry, obscured, or cut off at the edge of the frame, "
    "do not guess—tell the user clearly how to adjust the camera. "
    "Output plain spoken text only and keep your answer under 40 words "
    "unless reading a longer document."
)

# Generation hyperparameters for deterministic, low-hallucination responses
GENERATION_KWARGS: Final[dict] = {
    "temperature": 0.2,
    "top_p": 0.8,
    "max_new_tokens": 160,
}


def clean_tts_text(text: str) -> str:
    """Strip Markdown formatting (*, #, bullet symbols, backticks) for TTS."""
    if not text:
        return ""

    cleaned = text
    cleaned = re.sub(r"#+\s*", "", cleaned)
    cleaned = re.sub(r"[\*_]+", "", cleaned)
    cleaned = re.sub(r"^\s*[-*•]\s*", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"`+", "", cleaned)
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def route_request(question: str | None) -> tuple[str, str]:
    """Determine mode and system prompt."""
    if question is None or not question.strip():
        return "describe", DESCRIBE_MODE_SYSTEM_PROMPT
    return "question", QUESTION_MODE_SYSTEM_PROMPT
