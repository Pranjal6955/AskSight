from pydantic import BaseModel, Field, field_validator

MAX_TTS_CHARS = 2000


class TranscriptResponse(BaseModel):
    transcript: str
    language: str | None = None


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TTS_CHARS)
    language: str | None = None
    voice: str | None = None

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("text must not be blank")
        return stripped
