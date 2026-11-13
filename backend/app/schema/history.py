from datetime import datetime

from pydantic import BaseModel


class HistoryItem(BaseModel):
    id: str
    question: str
    answer: str
    image_id: str
    image_url: str
    model_version: str
    created_at: datetime


class HistoryPage(BaseModel):
    items: list[HistoryItem]
    # Opaque cursor for the next page; null on the last page.
    next_cursor: str | None
    has_more: bool
