from datetime import datetime

from pydantic import BaseModel


class ImageResponse(BaseModel):
    id: str
    mime_type: str
    size_bytes: int
    width: int
    height: int
    created_at: datetime
