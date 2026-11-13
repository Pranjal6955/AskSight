"""POST /ask — answer a natural-language question about an owned image."""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.images import GONE, owned_image
from app.core import images as image_checks
from app.core.dependencies import get_current_user
from app.core.inference import get_inference_service
from app.core.middleware import get_request_id
from app.core.storage import get_storage
from app.db import db
from app.schema.ask import AskRequest, AskResponse

logger = logging.getLogger("asksight.api")

router = APIRouter(prefix="/ask", tags=["Ask"])

# Ask holds the whole request slot — covers model load plus inference.
ASK_TIMEOUT_SECONDS = 30.0
MODEL_UNAVAILABLE = "The model is unavailable right now. Please try again later."
ASK_TOO_SLOW = "The model took too long to answer. Please try again."
NOT_SAVED = "The answer could not be saved to history."


@router.post("", response_model=AskResponse, status_code=status.HTTP_200_OK)
async def ask(payload: AskRequest, current_user=Depends(get_current_user)):
    """Answer a question about an image and append the exchange to history."""
    record = await owned_image(payload.image_id, current_user.id)

    data = get_storage().read(record.storageKey)
    if data is None:
        # The row outlived its bytes; say so and let the user re-upload.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=GONE)
    try:
        image, _, _, _ = image_checks.decode_image(data)
    except ValueError:
        # Stored bytes that no longer decode are just as gone as missing ones.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=GONE) from None

    try:
        service = get_inference_service()
    except RuntimeError as exc:
        # Model backend misconfigured or unloadable — infrastructure, not input.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    try:
        # shortcut: cancelling only stops *waiting*; a native call stuck inside
        # the worker thread still runs to completion before 504 is sent.
        answer = await asyncio.wait_for(
            asyncio.to_thread(service.answer, image, payload.question),
            timeout=ASK_TIMEOUT_SECONDS,
        )
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=ASK_TOO_SLOW
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    model_version = service.model_version
    try:
        entry = await db.historyentry.create(
            data={
                "ownerId": current_user.id,
                "imageId": record.id,
                "question": payload.question,
                "answer": answer,
                "modelVersion": model_version,
            }
        )
    except Exception:
        # The answer was produced; losing only the history row is logged, and
        # the caller is told plainly instead of getting an empty page later.
        logger.error(
            "history_persist_failed request_id=%s image_id=%s",
            get_request_id(),
            record.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=NOT_SAVED
        ) from None

    return AskResponse(
        entry_id=entry.id,
        answer=answer,
        model_version=model_version,
        created_at=entry.createdAt,
    )
