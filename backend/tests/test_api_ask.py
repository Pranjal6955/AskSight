import io
import os
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from PIL import Image as PILImage

from app.api import ask as ask_module
from app.core import inference
from app.main import app
from tests.fakes import patch_db, patch_storage

SIGNUP = {"name": "Ada Lovelace", "email": "Ada@Example.com", "password": "password123"}


def png_bytes():
    buffer = io.BytesIO()
    PILImage.new("RGB", (4, 4), color="red").save(buffer, format="PNG")
    return buffer.getvalue()


class FakeService:
    model_version = "fake-1.0"

    def __init__(self, result="A red car.", error=None, delay=0.0):
        self.result = result
        self.error = error
        self.delay = delay
        self.calls = []

    def answer(self, image, question):
        self.calls.append((image, question))
        if self.delay:
            time.sleep(self.delay)
        if self.error:
            raise self.error
        return self.result


class AskApiTestCase(unittest.TestCase):
    def setUp(self):
        self.db = patch_db(self)
        patch_storage(self)
        self.service = FakeService()
        for patcher in (
            patch.object(ask_module, "get_inference_service", return_value=self.service),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def auth_header(self, signup=None):
        self.client.post("/auth/signup", json=signup or SIGNUP)
        token = self.client.post(
            "/auth/login",
            json={"email": (signup or SIGNUP)["email"], "password": (signup or SIGNUP)["password"]},
        ).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def upload(self, headers=None):
        res = self.client.post(
            "/images",
            files={"file": ("photo.png", png_bytes(), "image/png")},
            headers=headers if headers is not None else self.auth_header(),
        )
        assert res.status_code == 201, res.text
        return res.json()["id"]

    def ask(self, image_id, question="What is in the photo?", headers=None):
        return self.client.post(
            "/ask",
            json={"image_id": image_id, "question": question},
            headers=headers if headers is not None else self.auth_header(),
        )


class TestAsk(AskApiTestCase):
    def test_returns_answer_and_model_version(self):
        res = self.ask(self.upload())
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["answer"], "A red car.")
        self.assertEqual(body["model_version"], "fake-1.0")
        self.assertTrue(body["entry_id"])
        self.assertTrue(body["created_at"])

    def test_passes_pil_image_and_question_to_service(self):
        self.ask(self.upload(), question="Is the light on?")
        image, question = self.service.calls[0]
        self.assertIsInstance(image, PILImage.Image)
        self.assertEqual(question, "Is the light on?")

    def test_persists_the_exchange_to_history(self):
        image_id = self.upload()
        entry_id = self.ask(image_id, question="How many wheels?").json()["entry_id"]
        res = self.client.get("/history", headers=self.auth_header())
        self.assertEqual(res.status_code, 200)
        item = res.json()["items"][0]
        self.assertEqual(item["id"], entry_id)
        self.assertEqual(item["image_id"], image_id)
        self.assertEqual(item["question"], "How many wheels?")
        self.assertEqual(item["answer"], "A red car.")
        self.assertEqual(item["image_url"], f"/images/{image_id}")
        self.assertEqual(item["model_version"], "fake-1.0")

    def test_requires_authentication(self):
        res = self.client.post("/ask", json={"image_id": "x", "question": "hi"})
        self.assertEqual(res.status_code, 401)

    def test_unknown_image_is_404(self):
        res = self.ask("img_does_not_exist")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["detail"], "Image not found.")

    def test_foreign_image_is_404_with_the_same_body_as_unknown(self):
        foreign_image = self.upload(headers=self.auth_header(SIGNUP | {"email": "bob@example.com"}))
        unknown = self.ask("img_does_not_exist").json()
        foreign = self.ask(foreign_image).json()
        self.assertEqual(foreign, unknown)

    def test_missing_stored_bytes_is_404_and_says_to_reupload(self):
        from app.core.storage import get_storage

        image_id = self.upload()
        storage_key = self.db.image.records[image_id].storageKey
        get_storage().delete(storage_key)
        res = self.ask(image_id)
        self.assertEqual(res.status_code, 404)
        self.assertEqual(
            res.json()["detail"], "This image is no longer available. Please upload it again."
        )

    def test_corrupt_stored_bytes_is_404(self):
        image_id = self.upload()
        junk_store = SimpleNamespace(read=lambda key: b"not an image")
        with patch.object(ask_module, "get_storage", return_value=junk_store):
            res = self.ask(image_id)
        self.assertEqual(res.status_code, 404)
        self.assertEqual(
            res.json()["detail"], "This image is no longer available. Please upload it again."
        )

    def test_rejects_blank_question_with_422(self):
        self.assertEqual(self.ask(self.upload(), question="   ").status_code, 422)

    def test_rejects_too_long_question_with_422(self):
        res = self.ask(self.upload(), question="a" * (inference.MAX_QUESTION_CHARS + 1))
        self.assertEqual(res.status_code, 422)

    def test_rejects_missing_fields_with_422(self):
        headers = self.auth_header()
        self.assertEqual(
            self.client.post("/ask", json={"question": "hi"}, headers=headers).status_code, 422
        )
        self.assertEqual(
            self.client.post("/ask", json={"image_id": "x"}, headers=headers).status_code, 422
        )

    def test_model_unavailable_is_503(self):
        with patch.object(
            ask_module, "get_inference_service", side_effect=RuntimeError("checkpoint missing")
        ):
            res = self.ask(self.upload())
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()["detail"], "checkpoint missing")

    def test_slow_model_is_504(self):
        self.service.delay = 0.2
        with patch.object(ask_module, "ASK_TIMEOUT_SECONDS", 0.01):
            res = self.ask(self.upload())
        self.assertEqual(res.status_code, 504)
        self.assertEqual(res.json()["detail"], ask_module.ASK_TOO_SLOW)

    def test_service_value_error_is_422(self):
        self.service.error = ValueError("question not answerable")
        res = self.ask(self.upload())
        self.assertEqual(res.status_code, 422)
        self.assertEqual(res.json()["detail"], "question not answerable")

    def test_persistence_failure_is_500_without_logging_content(self):
        image_id = self.upload()
        broken = AsyncMock(side_effect=RuntimeError("db down"))
        with (
            patch.object(self.db.historyentry, "create", broken),
            self.assertLogs("asksight.api", level="ERROR") as logs,
        ):
            res = self.ask(image_id, question="What does the letter say?")
        self.assertEqual(res.status_code, 500)
        self.assertEqual(res.json()["detail"], ask_module.NOT_SAVED)
        joined = "\n".join(logs.output)
        self.assertIn("history_persist_failed", joined)
        self.assertIn(image_id, joined)
        self.assertNotIn("What does the letter say?", joined)


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
