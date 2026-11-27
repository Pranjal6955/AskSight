"""The /ask proxy to the Hugging Face Space, without touching the network."""

import json
import os
import unittest
from unittest.mock import patch

import httpx
from PIL import Image as PILImage

from app.core import inference


def sample_image():
    return PILImage.new("RGB", (8, 8), color="red")


def sse_complete(answer: str) -> str:
    return f"event: complete\ndata: {json.dumps([answer])}\n\n"


def space_handler(answer="A red square.", token_seen=None, error_event=None, status=200):
    def handler(request):
        if token_seen is not None:
            token_seen.append(request.headers.get("authorization"))
        if request.url.path == "/gradio_api/upload":
            if status != 200:
                return httpx.Response(status, text="boom", request=request)
            return httpx.Response(200, json=["/tmp/space/image.jpg"], request=request)
        if request.url.path == "/gradio_api/call/v2/answer":
            if status != 200:
                return httpx.Response(status, text="boom", request=request)
            body = json.loads(request.content)
            assert body["question"] == "What is this?"
            assert body["image"]["path"] == "/tmp/space/image.jpg"
            return httpx.Response(200, json={"event_id": "evt-1"}, request=request)
        if request.url.path == "/gradio_api/call/answer/evt-1":
            if error_event is not None:
                return httpx.Response(200, text=error_event, request=request)
            return httpx.Response(200, text=sse_complete(answer), request=request)
        return httpx.Response(404, request=request)

    return handler


def service(handler, **kwargs):
    return inference.HuggingFaceInferenceService(
        "https://space.test",
        transport=httpx.MockTransport(handler),
        **kwargs,
    )


class TestHuggingFaceInferenceService(unittest.TestCase):
    def test_uploads_asks_and_reads_the_sse_answer(self):
        answer = service(space_handler()).answer(sample_image(), "What is this?")
        self.assertEqual(answer, "A red square.")

    def test_sends_the_hf_token_when_configured(self):
        seen = []
        service(space_handler(token_seen=seen), token="hf_test").answer(
            sample_image(), "What is this?"
        )
        self.assertTrue(seen)
        self.assertTrue(all(value == "Bearer hf_test" for value in seen))

    def test_error_event_is_reported_as_unavailable(self):
        handler = space_handler(error_event='event: error\ndata: "The model is busy."\n\n')
        with self.assertRaises(inference.InferenceUnavailable) as caught:
            service(handler).answer(sample_image(), "What is this?")
        self.assertIn("busy", str(caught.exception))

    def test_http_failure_is_reported_as_unavailable(self):
        with self.assertRaises(inference.InferenceUnavailable):
            service(space_handler(status=500)).answer(sample_image(), "What is this?")

    def test_timeout_is_reported_as_a_timeout(self):
        def handler(request):
            raise httpx.ReadTimeout("slow", request=request)

        with self.assertRaises(TimeoutError):
            service(handler).answer(sample_image(), "What is this?")

    def test_stats_count_requests(self):
        stats = service(space_handler()).stats()
        self.assertEqual(stats["requests"], 0)
        self.assertEqual(stats["failures"], 0)
        self.assertEqual(stats["model_version"], "Qwen/Qwen3-VL-4B-Instruct")


class TestServiceSelection(unittest.TestCase):
    def tearDown(self):
        inference.clear_cache()

    def test_the_space_url_wins_over_a_local_checkpoint(self):
        with patch.dict(
            os.environ,
            {
                "ASKSIGHT_HF_SPACE_URL": "https://space.test",
                "ASKSIGHT_MODEL_CHECKPOINT": "/does/not/exist",
            },
        ):
            inference.clear_cache()
            selected = inference.get_inference_service()

        self.assertIsInstance(selected, inference.HuggingFaceInferenceService)
        self.assertEqual(selected.space_url, "https://space.test")


if __name__ == "__main__":
    unittest.main()
