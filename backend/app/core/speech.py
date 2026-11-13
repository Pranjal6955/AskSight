"""Sarvam speech providers behind one small interface (contract §5/§6).

The API key stays on the server: without SARVAM_API_KEY the factory returns
None and the routes answer 503 instead of failing obscurely. The httpx
transport is injectable so tests never touch the network.

Verified against docs.sarvam.ai (Nov 2026):
  STT  POST https://api.sarvam.ai/speech-to-text   multipart {file, model}
       -> 200 {transcript, language_code}
  TTS  POST https://api.sarvam.ai/text-to-speech   JSON {text, language_code,
       model, output_audio_codec, speaker?} -> 200 {audios: [base64]}
"""

import base64
import binascii
import os
from functools import lru_cache

import httpx

STT_URL = "https://api.sarvam.ai/speech-to-text"
TTS_URL = "https://api.sarvam.ai/text-to-speech"
REQUEST_TIMEOUT_SECONDS = 30.0
MAX_AUDIO_BYTES = 15 * 1024 * 1024
DEFAULT_STT_MODEL = "saaras:v4"
DEFAULT_TTS_MODEL = "bulbul:v4-flash"


class SpeechTimeout(Exception):
    """The provider did not answer within the timeout."""


class SpeechRateLimited(Exception):
    """The provider refused for quota / rate reasons."""


class SpeechRejected(Exception):
    """The provider rejected the request as invalid (4xx)."""


class SpeechProviderError(Exception):
    """Provider-side failure (5xx, transport error, or malformed reply)."""


def sniff_audio(data: bytes) -> str:
    """Container MIME type from magic bytes, or ValueError if unrecognised.

    The declared Content-Type of an upload is attacker-controlled; only the
    bytes decide what this is.
    """
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "audio/wav"
    if data.startswith(b"fLaC"):
        return "audio/flac"
    if data.startswith(b"OggS"):
        return "audio/ogg"
    if data.startswith(b"ID3") or (len(data) >= 2 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0):
        return "audio/mpeg"
    if data[4:8] == b"ftyp":  # MP4/M4A family
        return "audio/mp4"
    if data.startswith(b"FORM") and data[8:12] == b"AIFF":
        return "audio/aiff"
    if data.startswith(b"#!AMR"):
        return "audio/amr"
    if data[:4] == b"\x1a\x45\xdf\xa3":  # EBML: WebM / Matroska
        return "audio/webm"
    raise ValueError("unrecognised audio container")


class SarvamSpeechService:
    """Talks to the Sarvam REST endpoints; translates failures to typed errors."""

    def __init__(
        self,
        api_key: str,
        stt_model: str = DEFAULT_STT_MODEL,
        tts_model: str = DEFAULT_TTS_MODEL,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.stt_model = stt_model or DEFAULT_STT_MODEL
        self.tts_model = tts_model or DEFAULT_TTS_MODEL
        self._client = httpx.Client(
            transport=transport,
            timeout=REQUEST_TIMEOUT_SECONDS,
            headers={"api-subscription-key": api_key},
        )

    def transcribe(self, audio: bytes, filename: str) -> tuple[str, str | None]:
        """Speech to (transcript, BCP-47 language or None when undetected)."""
        response = self._post(
            STT_URL,
            data={"model": self.stt_model},  # language omitted: auto-detect
            files={"file": (filename, audio)},
        )
        body = self._json(response)
        return str(body.get("transcript") or ""), body.get("language_code")

    def synthesize(self, text: str, language: str, voice: str | None) -> bytes:
        """Text to MP3 bytes (the contract returns audio, never base64 JSON)."""
        payload: dict = {
            "text": text,
            "language_code": language,
            "model": self.tts_model,
            "output_audio_codec": "mp3",
        }
        if voice:
            payload["speaker"] = voice
        body = self._json(self._post(TTS_URL, json=payload))
        audios = body.get("audios") or []
        if not audios:
            raise SpeechProviderError("provider returned no audio")
        try:
            return base64.b64decode(audios[0])
        except (binascii.Error, ValueError) as exc:
            raise SpeechProviderError("provider returned undecodable audio") from exc

    def _post(self, url: str, **kwargs) -> httpx.Response:
        try:
            response = self._client.post(url, **kwargs)
        except httpx.TimeoutException as exc:
            raise SpeechTimeout() from exc
        except httpx.HTTPError as exc:
            raise SpeechProviderError() from exc
        if response.status_code == 429:
            raise SpeechRateLimited()
        if 400 <= response.status_code < 500:
            raise SpeechRejected()
        if response.status_code >= 500:
            raise SpeechProviderError()
        return response

    @staticmethod
    def _json(response: httpx.Response) -> dict:
        try:
            body = response.json()
        except ValueError as exc:
            raise SpeechProviderError("provider returned a non-JSON reply") from exc
        if not isinstance(body, dict):
            raise SpeechProviderError("provider returned an unexpected reply")
        return body


@lru_cache(maxsize=1)
def get_speech_service() -> SarvamSpeechService | None:
    """The configured provider, or None when SARVAM_API_KEY is absent."""
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        return None
    return SarvamSpeechService(
        api_key=api_key,
        stt_model=os.getenv("SARVAM_STT_MODEL") or DEFAULT_STT_MODEL,
        tts_model=os.getenv("SARVAM_TTS_MODEL") or DEFAULT_TTS_MODEL,
    )
