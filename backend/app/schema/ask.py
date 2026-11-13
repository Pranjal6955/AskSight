from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core import inference


class AskRequest(BaseModel):
    image_id: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=1, max_length=inference.MAX_QUESTION_CHARS)

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("question must not be blank")
        return stripped


class AskResponse(BaseModel):
    entry_id: str
    answer: str
    model_version: str
    created_at: datetime
