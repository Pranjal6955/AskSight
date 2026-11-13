"""Image upload, retrieval, and deletion (A2/A3)."""

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status

from app.core import images as image_checks
from app.core.dependencies import get_current_user
from app.core.storage import get_storage
from app.db import db
from app.schema.images import ImageResponse

router = APIRouter(prefix="/images", tags=["Images"])

NOT_FOUND = "Image not found."
GONE = "This image is no longer available. Please upload it again."


async def owned_image(image_id: str, owner_id: str):
    """The caller's image, or 404 — for unknown ids *and* other users' ids,
    so an attacker cannot tell an existing id from a made-up one."""
    record = await db.image.find_unique(where={"id": image_id})
    if not record or record.ownerId != owner_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return record


@router.post("", response_model=ImageResponse, status_code=status.HTTP_201_CREATED)
async def upload_image(
    current_user=Depends(get_current_user),
    file: UploadFile = File(...),
):
    # Read one byte past the limit: the rest of a valid upload is decoded
    # anyway, and an oversized one never enters memory beyond this point.
    data = await file.read(image_checks.MAX_IMAGE_BYTES + 1)
    if len(data) > image_checks.MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The image is too large. Please upload an image of 10 MB or less.",
        )

    try:
        _, mime_type, width, height = image_checks.decode_image(data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    storage = get_storage()
    key = storage.save(data, image_checks.extension_for(mime_type))
    try:
        record = await db.image.create(
            data={
                "ownerId": current_user.id,
                "storageKey": key,
                "mimeType": mime_type,
                "sizeBytes": len(data),
                "width": width,
                "height": height,
            }
        )
    except Exception:
        # Never leave orphaned bytes behind when the row cannot be saved.
        storage.delete(key)
        raise

    return ImageResponse(
        id=record.id,
        mime_type=record.mimeType,
        size_bytes=record.sizeBytes,
        width=record.width,
        height=record.height,
        created_at=record.createdAt,
    )


@router.get("/{image_id}")
async def get_image(image_id: str, current_user=Depends(get_current_user)):
    record = await owned_image(image_id, current_user.id)
    data = get_storage().read(record.storageKey)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=GONE)
    return Response(content=data, media_type=record.mimeType)


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(image_id: str, current_user=Depends(get_current_user)):
    record = await owned_image(image_id, current_user.id)
    # Bytes before rows: a crash mid-delete then leaves history whose image
    # reads 404, never a photo the user deleted still sitting on disk.
    get_storage().delete(record.storageKey)
    # Deleting the image row cascades to the history entries that used it.
    await db.image.delete_many(where={"id": record.id, "ownerId": current_user.id})
