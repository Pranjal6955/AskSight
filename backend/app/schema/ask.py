from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core import inference


class AskRequest(BaseModel):
    image_id: str = Field(min_length=1, max_length=100)
    question: str | None = Field(default=None, max_length=inference.MAX_QUESTION_CHARS)

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class AskResponse(BaseModel):
    entry_id: str
    answer: str
    model_version: str
    created_at: datetime
