import io
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image as PILImage

from app.api import auth as auth_module
from app.core import dependencies, inference
from app.main import app
from tests.fakes import FakeDB

SIGNUP = {"name": "Ada Lovelace", "email": "Ada@Example.com", "password": "password123"}


class FakeService:
    model_version = "fake-1.0"

    def __init__(self):
        self.calls = []

    def answer(self, image, question):
        self.calls.append((image, question))
        return "A red car."


def png_bytes():
    buffer = io.BytesIO()
    PILImage.new("RGB", (4, 4), color="red").save(buffer, format="PNG")
    return buffer.getvalue()


class AskApiTestCase(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        self.service = FakeService()
        for patcher in (
            patch.object(auth_module, "db", self.db),
            patch.object(dependencies, "db", self.db),
            patch.object(inference, "get_inference_service", return_value=self.service),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def auth_header(self):
        self.client.post("/auth/signup", json=SIGNUP)
        token = self.client.post(
            "/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"]}
        ).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def ask(self, *, question="What is in the photo?", files=None, headers=None, data=None):
        return self.client.post(
            "/ask",
            files=files or {"image": ("photo.png", png_bytes(), "image/png")},
            data={"question": question, **(data or {})},
            headers=headers if headers is not None else self.auth_header(),
        )


class TestAsk(AskApiTestCase):
    def test_returns_answer_and_model_version(self):
        res = self.ask()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"answer": "A red car.", "model_version": "fake-1.0"})

    def test_passes_pil_image_and_question_to_service(self):
        self.ask(question="Is the light on?")
        image, question = self.service.calls[0]
        self.assertIsInstance(image, PILImage.Image)
        self.assertEqual(question, "Is the light on?")

    def test_requires_authentication(self):
        self.assertEqual(self.ask(headers={}).status_code, 401)

    def test_rejects_missing_question_with_422(self):
        res = self.client.post(
            "/ask",
            files={"image": ("photo.png", png_bytes(), "image/png")},
            headers=self.auth_header(),
        )
        self.assertEqual(res.status_code, 422)

    def test_rejects_too_long_question_with_422(self):
        res = self.ask(question="a" * (inference.MAX_QUESTION_CHARS + 1))
        self.assertEqual(res.status_code, 422)

    def test_rejects_unreadable_image_with_422(self):
        junk = b"this is not an image"
        res = self.ask(files={"image": ("photo.png", junk, "image/png")})
        self.assertEqual(res.status_code, 422)
        self.assertNotIn("PIL", res.json()["detail"])

    def test_rejects_missing_image_with_422(self):
        files = {"question": ("", png_bytes(), "image/png")}
        res = self.ask(files=files)
        self.assertEqual(res.status_code, 422)

    def test_rejects_oversized_image_with_413(self):
        with patch.object(inference, "MAX_IMAGE_BYTES", 8):
            res = self.ask()
        self.assertEqual(res.status_code, 413)


class TestGetInferenceService(unittest.TestCase):
    def setUp(self):
        self.addCleanup(inference.get_inference_service.cache_clear)
        inference.get_inference_service.cache_clear()

    def test_defaults_to_mock_without_checkpoint(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(inference.MODEL_CHECKPOINT_ENV, None)
            inference.get_inference_service.cache_clear()
            self.assertEqual(inference.get_inference_service().model_version, "mock-0.0.0")

    def test_missing_model_package_raises_clear_error(self):
        with (
            patch.dict(os.environ, {inference.MODEL_CHECKPOINT_ENV: "checkpoints/v0.1"}),
            patch.object(inference.importlib, "import_module", side_effect=ImportError("gone")),
            self.assertRaises(RuntimeError) as ctx,
        ):
            inference.get_inference_service()
        message = str(ctx.exception)
        self.assertIn(inference.MODEL_CHECKPOINT_ENV, message)
        self.assertIn("pip install -e ../model", message)


if __name__ == "__main__":
    unittest.main()
