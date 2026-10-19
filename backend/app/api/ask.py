from io import BytesIO

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from PIL import Image as PILImage

from app.core import inference
from app.core.dependencies import get_current_user
from app.schema.ask import AskResponse

router = APIRouter(prefix="/ask", tags=["Visual Q&A"])


@router.post("", response_model=AskResponse)
async def ask(
    current_user=Depends(get_current_user),
    image: UploadFile = File(...),
    question: str = Form(..., min_length=1, max_length=inference.MAX_QUESTION_CHARS),
):
    image_bytes = await image.read()
    if len(image_bytes) > inference.MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image is too large. Please upload an image of 10 MB or less.",
        )

    try:
        pil_image = PILImage.open(BytesIO(image_bytes))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not read the image. Please retake the photo and try again.",
        ) from exc

    service = inference.get_inference_service()
    try:
        answer = service.answer(pil_image, question)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    return AskResponse(answer=answer, model_version=service.model_version)
