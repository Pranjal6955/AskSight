"""POST /stt and POST /tts — authenticated proxies to Sarvam (contract §5/§6)."""

import asyncio
import os

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status

from app.core.rate_limit import RATE_LIMITED, per_user
from app.core.speech import (
    MAX_AUDIO_BYTES,
    SpeechProviderError,
    SpeechRateLimited,
    SpeechRejected,
    SpeechTimeout,
    get_speech_service,
    sniff_audio,
)
from app.schema.speech import TranscriptResponse, TTSRequest

router = APIRouter(tags=["Speech"])

TOO_LARGE = "The audio is too large. Please upload a clip of 15 MB or less."
EMPTY_AUDIO = "The audio file is empty. Please try again."
UNSUPPORTED_AUDIO = "This audio format is not supported."
NOT_CONFIGURED = "Speech is not available right now. Please try again later."
PROVIDER_REJECTED = "The speech service could not process this request."
PROVIDER_FAILED = "The speech service failed right now. Please try again later."
PROVIDER_SLOW = "The speech service took too long. Please try again."


def _translate(exc: Exception) -> HTTPException:
    """Typed provider failure to an API error per the contract."""
    if isinstance(exc, SpeechTimeout):
        return HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=PROVIDER_SLOW)
    if isinstance(exc, SpeechRateLimited):
        return HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=RATE_LIMITED)
    if isinstance(exc, SpeechRejected):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=PROVIDER_REJECTED
        )
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=PROVIDER_FAILED)


def _service_or_503():
    service = get_speech_service()
    if service is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=NOT_CONFIGURED)
    return service


@router.post(
    "/stt",
    response_model=TranscriptResponse,
    dependencies=[Depends(per_user)],
)
async def speech_to_text(file: UploadFile = File(...)):
    data = await file.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=TOO_LARGE)
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=EMPTY_AUDIO)
    try:
        sniff_audio(data)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=UNSUPPORTED_AUDIO
        ) from None

    service = _service_or_503()
    filename = file.filename or "audio"
    try:
        # Provider calls block on the network; keep the event loop free.
        transcript, language = await asyncio.to_thread(service.transcribe, data, filename)
    except (SpeechTimeout, SpeechRateLimited, SpeechRejected, SpeechProviderError) as exc:
        raise _translate(exc) from exc
    return TranscriptResponse(transcript=transcript, language=language)


@router.post("/tts", dependencies=[Depends(per_user)])
async def text_to_speech(payload: TTSRequest):
    service = _service_or_503()
    language = payload.language or os.getenv("DEFAULT_LANGUAGE") or "en-IN"
    try:
        audio = await asyncio.to_thread(service.synthesize, payload.text, language, payload.voice)
    except (SpeechTimeout, SpeechRateLimited, SpeechRejected, SpeechProviderError) as exc:
        raise _translate(exc) from exc
    # Raw bytes, never base64-in-JSON; not stored, discarded after the response.
    return Response(content=audio, media_type="audio/mpeg")
