"""Saved question/answer history (A7).

Every query is scoped to the authenticated owner; a foreign or unknown id is
a 404, never a 403, so ids cannot be probed.
"""

import base64
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.dependencies import get_current_user
from app.core.storage import get_storage
from app.db import db
from app.schema.history import HistoryItem, HistoryPage

router = APIRouter(prefix="/history", tags=["History"])

MAX_PAGE_SIZE = 50
DEFAULT_PAGE_SIZE = 20
INVALID_CURSOR = "Invalid pagination cursor."


def encode_cursor(entry) -> str:
    """An opaque page cursor: the sort key of the last item on this page."""
    payload = {"created_at": entry.createdAt.isoformat(), "id": entry.id}
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        payload = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        created_at = datetime.fromisoformat(payload["created_at"])
        entry_id = payload["id"]
        if not isinstance(entry_id, str) or not isinstance(created_at, datetime):
            raise ValueError("malformed cursor")
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_CURSOR) from exc
    return created_at, entry_id


def item_for(entry) -> HistoryItem:
    return HistoryItem(
        id=entry.id,
        question=entry.question,
        answer=entry.answer,
        image_id=entry.imageId,
        image_url=f"/images/{entry.imageId}",
        model_version=entry.modelVersion,
        created_at=entry.createdAt,
    )


async def owned_entry(entry_id: str, owner_id: str):
    record = await db.historyentry.find_unique(where={"id": entry_id})
    if not record or record.ownerId != owner_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="History entry not found."
        )
    return record


@router.get("", response_model=HistoryPage)
async def list_history(
    current_user=Depends(get_current_user),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    cursor: str | None = Query(None),
):
    where: dict = {"ownerId": current_user.id}
    if cursor:
        created_at, entry_id = decode_cursor(cursor)
        # Keyset pagination: strictly after the cursor in (createdAt, id)
        # order, which is the same order the page is sorted by — so inserts
        # and deletes between pages cannot duplicate or skip entries.
        where["OR"] = [
            {"createdAt": {"lt": created_at}},
            {"createdAt": created_at, "id": {"lt": entry_id}},
        ]

    entries = await db.historyentry.find_many(
        where=where,
        order=[{"createdAt": "desc"}, {"id": "desc"}],
        take=limit + 1,
    )
    has_more = len(entries) > limit
    page = entries[:limit]

    return HistoryPage(
        items=[item_for(entry) for entry in page],
        next_cursor=encode_cursor(page[-1]) if has_more else None,
        has_more=has_more,
    )


@router.get("/{entry_id}", response_model=HistoryItem)
async def get_entry(entry_id: str, current_user=Depends(get_current_user)):
    return item_for(await owned_entry(entry_id, current_user.id))


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(entry_id: str, current_user=Depends(get_current_user)):
    entry = await owned_entry(entry_id, current_user.id)
    deleted = await db.historyentry.delete_many(where={"id": entry.id, "ownerId": current_user.id})
    if not deleted:
        return  # a concurrent delete already cleaned up after this entry

    remaining = await db.historyentry.count(where={"imageId": entry.imageId})
    if remaining:
        return

    # The last question about this image is gone, so the photo goes too —
    # bytes first, for the same reason as DELETE /images/{id}.
    image = await db.image.find_unique(where={"id": entry.imageId})
    if image:
        get_storage().delete(image.storageKey)
        await db.image.delete_many(where={"id": image.id, "ownerId": current_user.id})


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_history(current_user=Depends(get_current_user)):
    """Delete everything this user has stored: rows and bytes, bytes first."""
    images = await db.image.find_many(where={"ownerId": current_user.id})
    storage = get_storage()
    for image in images:
        storage.delete(image.storageKey)
    await db.historyentry.delete_many(where={"ownerId": current_user.id})
    await db.image.delete_many(where={"ownerId": current_user.id})
