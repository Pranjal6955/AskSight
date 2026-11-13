"""Speech endpoints and the Sarvam service behind them (contract §5/§6).

Nothing here touches the network: endpoints run against a fake service, the
service runs against an httpx.MockTransport, and the real-provider smoke test
is opt-in behind SARVAM_API_KEY.
"""

import base64
import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.api import speech as speech_module
from app.core.rate_limit import RATE_LIMITED
from app.core.speech import (
    MAX_AUDIO_BYTES,
    SarvamSpeechService,
    SpeechProviderError,
    SpeechRateLimited,
    SpeechRejected,
    SpeechTimeout,
    get_speech_service,
    sniff_audio,
)
from app.main import app
from tests.fakes import patch_db

SIGNUP = {"name": "Ada Lovelace", "email": "Ada@Example.com", "password": "password123"}

# Smallest byte strings each sniffer accepts.
WAV = b"RIFF\x24\x00\x00\x00WAVEfmt "
MP3 = b"ID3\x04\x00\x00\x00\x00\x00\x00"
FLAC = b"fLaC\x00\x00\x00\x22"
OGG = b"OggS\x00\x02" + b"\x00" * 8
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 8
AIFF = b"FORM\x00\x00\x00\x1aAIFF"
AMR = b"#!AMR\n"
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 8
NOT_AUDIO = b"<html>gotcha</html>"


class FakeSpeechService:
    def __init__(self):
        self.error = None
        self.transcript = "नमस्ते, आप कैसे हैं?"
        self.language = "hi-IN"
        self.audio = b"\xff\xfb\x90\x00fake-mp3-bytes"
        self.calls = []

    def transcribe(self, data, filename):
        self.calls.append(("stt", len(data), filename))
        if self.error:
            raise self.error
        return self.transcript, self.language

    def synthesize(self, text, language, voice):
        self.calls.append(("tts", text, language, voice))
        if self.error:
            raise self.error
        return self.audio


class SpeechApiTestCase(unittest.TestCase):
    def setUp(self):
        patch_db(self)
        self.service = FakeSpeechService()
        patcher = patch.object(speech_module, "get_speech_service", return_value=self.service)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.headers = self.auth_header()

    def auth_header(self):
        self.client.post("/auth/signup", json=SIGNUP)
        token = self.client.post(
            "/auth/login",
            json={"email": SIGNUP["email"], "password": SIGNUP["password"]},
        ).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def stt(self, data=WAV, filename="clip.wav", headers=None):
        return self.client.post(
            "/stt",
            files={"file": (filename, data, "audio/wav")},
            headers=self.headers if headers is None else headers,
        )

    def tts(self, body=None, headers=None):
        return self.client.post(
            "/tts",
            json=body if body is not None else {"text": "The sign says no parking."},
            headers=self.headers if headers is None else headers,
        )

    def as_no_key(self):
        return patch.object(speech_module, "get_speech_service", return_value=None)


class TestStt(SpeechApiTestCase):
    def test_requires_authentication(self):
        res = self.stt(headers={})
        self.assertEqual(res.status_code, 401)

    def test_returns_transcript_and_language(self):
        res = self.stt()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res.json(),
            {"transcript": "नमस्ते, आप कैसे हैं?", "language": "hi-IN"},
        )
        self.assertEqual(self.service.calls[0][0], "stt")

    def test_no_api_key_is_503(self):
        with self.as_no_key():
            res = self.stt()
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()["detail"], speech_module.NOT_CONFIGURED)

    def test_oversized_audio_is_413(self):
        res = self.stt(data=b"a" * (MAX_AUDIO_BYTES + 1))
        self.assertEqual(res.status_code, 413)
        self.assertEqual(res.json()["detail"], speech_module.TOO_LARGE)
        self.assertEqual(self.service.calls, [])  # never forwarded

    def test_empty_audio_is_422(self):
        res = self.stt(data=b"")
        self.assertEqual(res.status_code, 422)
        self.assertEqual(self.service.calls, [])

    def test_unknown_container_is_415(self):
        res = self.stt(data=NOT_AUDIO, filename="clip.wav")
        self.assertEqual(res.status_code, 415)
        self.assertEqual(res.json()["detail"], speech_module.UNSUPPORTED_AUDIO)
        self.assertEqual(self.service.calls, [])


class TestTts(SpeechApiTestCase):
    def test_requires_authentication(self):
        self.assertEqual(self.tts(headers={}).status_code, 401)

    def test_returns_audio_bytes_with_mpeg_type(self):
        res = self.tts()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers["content-type"], "audio/mpeg")
        self.assertEqual(res.content, self.service.audio)

    def test_forwards_language_and_voice(self):
        res = self.tts({"text": "नमस्ते", "language": "hi-IN", "voice": "ritu"})
        self.assertEqual(res.status_code, 200)
        kind, text, language, voice = self.service.calls[-1]
        self.assertEqual((kind, text, language, voice), ("tts", "नमस्ते", "hi-IN", "ritu"))

    def test_default_language_comes_from_the_environment(self):
        self.tts({"text": "hello"})
        expected = os.getenv("DEFAULT_LANGUAGE") or "en-IN"
        self.assertEqual(self.service.calls[-1][2], expected)

    def test_no_api_key_is_503(self):
        with self.as_no_key():
            res = self.tts()
        self.assertEqual(res.status_code, 503)

    def test_blank_text_is_422(self):
        res = self.tts({"text": "   "})
        self.assertEqual(res.status_code, 422)

    def test_oversized_text_is_422(self):
        res = self.tts({"text": "x" * 2001})
        self.assertEqual(res.status_code, 422)
        self.assertEqual(self.service.calls, [])


class TestProviderErrorMapping(SpeechApiTestCase):
    CASES = [
        (SpeechTimeout(), 504, speech_module.PROVIDER_SLOW),
        (SpeechRateLimited(), 429, None),  # None = the shared 429 sentence
        (SpeechRejected(), 422, speech_module.PROVIDER_REJECTED),
        (SpeechProviderError(), 502, speech_module.PROVIDER_FAILED),
    ]

    def test_provider_failures_map_to_contract_statuses_on_both_routes(self):
        for error, expected, detail in self.CASES:
            with self.subTest(error=type(error).__name__):
                self.service.error = error
                stt = self.stt()
                self.assertEqual(stt.status_code, expected)
                tts = self.tts()
                self.assertEqual(tts.status_code, expected)
                if detail is not None:
                    self.assertEqual(stt.json()["detail"], detail)
                    self.assertEqual(tts.json()["detail"], detail)
                else:
                    self.assertEqual(stt.json()["detail"], RATE_LIMITED)


class TestSniffAudio(unittest.TestCase):
    def test_accepts_every_supported_container(self):
        for sample in (WAV, MP3, FLAC, OGG, MP4, AIFF, AMR, WEBM):
            with self.subTest(sample=sample[:8]):
                self.assertTrue(sniff_audio(sample).startswith("audio/"))

    def test_rejects_anything_else(self):
        with self.assertRaises(ValueError):
            sniff_audio(NOT_AUDIO)

    def test_mp3_frame_sync_without_id3_header(self):
        self.assertEqual(sniff_audio(b"\xff\xfb\x90\x00rest"), "audio/mpeg")


class TestSarvamService(unittest.TestCase):
    def make(self, handler):
        return SarvamSpeechService(api_key="test-key", transport=httpx.MockTransport(handler))

    def test_transcribe_sends_key_and_parses_response(self):
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = request.url
            seen["key"] = request.headers.get("api-subscription-key")
            seen["model"] = request.headers.get("Content-Type", "").startswith("multipart")
            return httpx.Response(
                200, json={"request_id": "r1", "transcript": "hello", "language_code": "en-IN"}
            )

        transcript, language = self.make(handler).transcribe(WAV, "clip.wav")
        self.assertEqual((transcript, language), ("hello", "en-IN"))
        self.assertEqual(str(seen["url"]), "https://api.sarvam.ai/speech-to-text")
        self.assertEqual(seen["key"], "test-key")
        self.assertTrue(seen["model"])

    def test_synthesize_decodes_base64_audio(self):
        payload = base64.b64encode(b"mp3-bytes").decode()

        def handler(request: httpx.Request) -> httpx.Response:
            body = request.read()
            self.assertIn(b'"output_audio_codec":"mp3"', body)
            self.assertIn(b'"language_code":"hi-IN"', body)
            return httpx.Response(200, json={"request_id": "r2", "audios": [payload]})

        audio = self.make(handler).synthesize("नमस्ते", "hi-IN", None)
        self.assertEqual(audio, b"mp3-bytes")

    def test_error_statuses_become_typed_failures(self):
        cases = [
            (429, SpeechRateLimited),
            (400, SpeechRejected),
            (422, SpeechRejected),
            (500, SpeechProviderError),
            (503, SpeechProviderError),
        ]
        for status, expected in cases:
            with self.subTest(status=status):
                service = self.make(lambda request, s=status: httpx.Response(s, json={}))
                with self.assertRaises(expected):
                    service.transcribe(WAV, "clip.wav")

    def test_timeout_becomes_speech_timeout(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("provider too slow")

        with self.assertRaises(SpeechTimeout):
            self.make(handler).transcribe(WAV, "clip.wav")

    def test_empty_audio_list_is_a_provider_error(self):
        service = self.make(lambda request: httpx.Response(200, json={"audios": []}))
        with self.assertRaises(SpeechProviderError):
            service.synthesize("hi", "en-IN", None)

    def test_non_json_reply_is_a_provider_error(self):
        service = self.make(lambda request: httpx.Response(200, text="<html>maintenance"))
        with self.assertRaises(SpeechProviderError):
            service.transcribe(WAV, "clip.wav")


class TestSpeechFactory(unittest.TestCase):
    def setUp(self):
        get_speech_service.cache_clear()
        self.addCleanup(get_speech_service.cache_clear)

    def test_no_key_means_no_service(self):
        with patch.dict(os.environ, {"SARVAM_API_KEY": ""}):
            self.assertIsNone(get_speech_service())

    def test_key_builds_the_provider_with_configured_models(self):
        env = {
            "SARVAM_API_KEY": "k",
            "SARVAM_STT_MODEL": "saaras:v3",
            "SARVAM_TTS_MODEL": "bulbul:v3",
        }
        with patch.dict(os.environ, env):
            service = get_speech_service()
        self.assertIsInstance(service, SarvamSpeechService)
        self.assertEqual(service.stt_model, "saaras:v3")
        self.assertEqual(service.tts_model, "bulbul:v3")


@unittest.skipUnless(os.getenv("SARVAM_API_KEY"), "SARVAM_API_KEY not set (opt-in)")
class TestRealProviderSmoke(unittest.TestCase):
    """Spends real credits — only runs where a key is configured."""

    def setUp(self):
        get_speech_service.cache_clear()
        self.addCleanup(get_speech_service.cache_clear)

    def test_synthesize_returns_audio(self):
        audio = get_speech_service().synthesize("Namaste, AskSight.", "hi-IN", None)
        # WAV, MP3-with-ID3, or raw MP3 frame sync — whatever the codec picked.
        self.assertTrue(
            audio.startswith((b"RIFF", b"ID3")) or audio[:1] == b"\xff",
            f"unexpected audio header: {audio[:4]!r}",
        )


if __name__ == "__main__":
    unittest.main()
