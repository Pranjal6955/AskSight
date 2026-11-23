"""Read-only usage data for the admin dashboard.

Two ways in, both because the view shows every user's activity:

- An admin account (email listed in `ADMIN_EMAILS`) with a normal bearer token.
- A shared `X-Admin-Token` for scripts and curl.
"""

import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.dependencies import get_user_from_token
from app.db import db
from app.schema.admin import (
    AdminModelUsage,
    AdminOverview,
    AdminQuestion,
    AdminTotals,
    AdminUserUsage,
)

router = APIRouter(prefix="/admin", tags=["Admin"])

ADMIN_TOKEN_ENV = "ADMIN_TOKEN"
ADMIN_EMAILS_ENV = "ADMIN_EMAILS"
ADMIN_DISABLED = (
    "The admin view is disabled. Set ADMIN_EMAILS or ADMIN_TOKEN on the backend."
)
INVALID_ADMIN_CREDENTIALS = "Invalid admin credentials."

MAX_USERS = 100  # shortcut: table shows the newest 100 users, paginate when the base grows

admin_bearer = HTTPBearer(auto_error=False)


def admin_emails() -> set[str]:
    raw = os.getenv(ADMIN_EMAILS_ENV, "")
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


async def require_admin(
    x_admin_token: str = Header(default=""),
    credentials: HTTPAuthorizationCredentials | None = Depends(admin_bearer),
) -> None:
    expected = os.getenv(ADMIN_TOKEN_ENV, "")
    emails = admin_emails()
    if not expected and not emails:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=ADMIN_DISABLED
        )
    if expected and x_admin_token and secrets.compare_digest(x_admin_token, expected):
        return
    if credentials and emails:
        user = await get_user_from_token(credentials.credentials)
        if user.email.strip().lower() in emails:
            return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_ADMIN_CREDENTIALS
    )


def _count(row: dict) -> int:
    return int((row.get("_count") or {}).get("id") or 0)


@router.get(
    "/overview",
    response_model=AdminOverview,
    dependencies=[Depends(require_admin)],
)
async def overview(recent: int = Query(25, ge=1, le=100)):
    image_rows = await db.image.group_by(
        by=["ownerId"], count={"id": True}, sum={"sizeBytes": True}
    )
    history_rows = await db.historyentry.group_by(
        by=["ownerId"], count={"id": True}, max={"createdAt": True}
    )
    model_rows = await db.historyentry.group_by(
        by=["modelVersion"], count={"id": True}
    )
    users = await db.user.find_many(
        take=MAX_USERS,
        order={"createdAt": "desc"},
    )
    recent_entries = await db.historyentry.find_many(
        take=recent,
        order=[{"createdAt": "desc"}, {"id": "desc"}],
        include={"owner": True},
    )

    image_usage = {
        row["ownerId"]: {
            "images": _count(row),
            "storage_bytes": int((row.get("_sum") or {}).get("sizeBytes") or 0),
        }
        for row in image_rows
    }
    history_usage = {
        row["ownerId"]: {
            "questions": _count(row),
            "last_question_at": (row.get("_max") or {}).get("createdAt"),
        }
        for row in history_rows
    }

    usage = []
    for user in users:
        images = image_usage.get(user.id, {})
        questions = history_usage.get(user.id, {})
        usage.append(
            AdminUserUsage(
                id=user.id,
                name=user.name,
                email=user.email,
                joined_at=user.createdAt,
                images=images.get("images", 0),
                storage_bytes=images.get("storage_bytes", 0),
                questions=questions.get("questions", 0),
                last_question_at=questions.get("last_question_at"),
            )
        )
    usage.sort(key=lambda item: (item.questions, item.images), reverse=True)

    models = sorted(
        (
            AdminModelUsage(model_version=row["modelVersion"], questions=_count(row))
            for row in model_rows
        ),
        key=lambda item: item.questions,
        reverse=True,
    )

    return AdminOverview(
        totals=AdminTotals(
            users=await db.user.count(),
            images=await db.image.count(),
            questions=await db.historyentry.count(),
            storage_bytes=sum(
                int((row.get("_sum") or {}).get("sizeBytes") or 0)
                for row in image_rows
            ),
        ),
        users=usage,
        models=models,
        recent_questions=[
            AdminQuestion(
                id=entry.id,
                user_name=entry.owner.name,
                user_email=entry.owner.email,
                question=entry.question,
                answer=entry.answer,
                model_version=entry.modelVersion,
                created_at=entry.createdAt,
            )
            for entry in recent_entries
        ],
    )
