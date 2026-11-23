"""Read-only admin/MLOps response models."""

from datetime import datetime

from pydantic import BaseModel


class AdminTotals(BaseModel):
    users: int
    images: int
    questions: int
    storage_bytes: int


class AdminUserUsage(BaseModel):
    id: str
    name: str
    email: str
    joined_at: datetime
    images: int
    questions: int
    storage_bytes: int
    last_question_at: datetime | None = None


class AdminModelUsage(BaseModel):
    model_version: str
    questions: int


class AdminQuestion(BaseModel):
    id: str
    user_name: str
    user_email: str
    question: str
    answer: str
    model_version: str
    created_at: datetime


class AdminOverview(BaseModel):
    totals: AdminTotals
    users: list[AdminUserUsage]
    models: list[AdminModelUsage]
    recent_questions: list[AdminQuestion]
