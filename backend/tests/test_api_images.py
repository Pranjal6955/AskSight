"""Image upload, retrieval, and deletion endpoints (A2/A3)."""

import io
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image as PILImage

from app.core import images as image_checks
from app.core.storage import get_storage
from app.main import app
from tests.fakes import patch_db, patch_storage, run, seed_history

SIGNUP = {"name": "Ada Lovelace", "email": "Ada@Example.com", "password": "password123"}
FOREIGN = {"name": "Bob", "email": "bob@example.com", "password": "password123"}


def png_bytes(size=(4, 4)):
    buffer = io.BytesIO()
    PILImage.new("RGB", size, color="red").save(buffer, format="PNG")
    return buffer.getvalue()


class ImagesApiTestCase(unittest.TestCase):
    def setUp(self):
        self.db = patch_db(self)
        self.storage_root = patch_storage(self)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def auth_header(self, signup=None):
        signup = signup or SIGNUP
        self.client.post("/auth/signup", json=signup)
        token = self.client.post(
            "/auth/login", json={"email": signup["email"], "password": signup["password"]}
        ).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def upload(self, data=None, headers=None):
        return self.client.post(
            "/images",
            files={"file": ("photo.png", data if data is not None else png_bytes(), "image/png")},
            headers=headers if headers is not None else self.auth_header(),
        )


class TestUpload(ImagesApiTestCase):
    def test_creates_owned_image_and_returns_201(self):
        res = self.upload()
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertTrue(body["id"])
        self.assertEqual(body["mime_type"], "image/png")
        self.assertEqual(body["width"], 4)
        self.assertEqual(body["height"], 4)
        self.assertEqual(body["size_bytes"], len(png_bytes()))
        self.assertTrue(body["created_at"])
        record = self.db.image.records[body["id"]]
        self.assertEqual(record.ownerId, next(iter(self.db.user.records.values())).id)

    def test_stores_bytes_under_an_opaque_key(self):
        body = self.upload().json()
        record = self.db.image.records[body["id"]]
        # The client filename must never influence where bytes land.
        self.assertNotIn("photo", record.storageKey)
        self.assertTrue(record.storageKey.endswith(".png"))
        self.assertEqual(get_storage().read(record.storageKey), png_bytes())

    def test_requires_authentication(self):
        self.assertEqual(self.upload(headers={}).status_code, 401)
        self.assertEqual(len(self.db.image.records), 0)

    def test_logs_upload_timings_without_content(self):
        with self.assertLogs("asksight.api", level="INFO") as logs:
            res = self.upload()
        self.assertEqual(res.status_code, 201)
        joined = "\n".join(logs.output)
        self.assertIn("upload_timings", joined)
        self.assertIn("storage_ms", joined)
        self.assertNotIn("photo.png", joined)

    def test_rejects_non_image_bytes_with_422_and_stores_nothing(self):
        res = self.upload(data=b"not an image")
        self.assertEqual(res.status_code, 422)
        self.assertNotIn("PIL", res.json()["detail"])
        self.assertEqual(len(self.db.image.records), 0)

    def test_rejects_oversized_upload_with_413_and_stores_nothing(self):
        with patch.object(image_checks, "MAX_IMAGE_BYTES", 8):
            res = self.upload()
        self.assertEqual(res.status_code, 413)
        self.assertEqual(len(self.db.image.records), 0)

    def test_accepts_jpeg_bytes_named_as_png(self):
        buffer = io.BytesIO()
        PILImage.new("RGB", (4, 4)).save(buffer, format="JPEG")
        res = self.upload(data=buffer.getvalue())
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["mime_type"], "image/jpeg")

    def test_row_failure_leaves_no_orphaned_bytes(self):
        from unittest.mock import AsyncMock

        with patch.object(self.db.image, "create", AsyncMock(side_effect=RuntimeError("db down"))):
            # The raw exception becomes a generic 500 in production.
            client = TestClient(app, raise_server_exceptions=False)
            self.addCleanup(client.close)
            res = client.post(
                "/images",
                files={"file": ("photo.png", png_bytes(), "image/png")},
                headers=self.auth_header(),
            )
        self.assertEqual(res.status_code, 500)
        self.assertEqual(len(self.db.image.records), 0)
        self.assertEqual(os.listdir(self.storage_root), [])


class TestGetImage(ImagesApiTestCase):
    def test_returns_stored_bytes_with_media_type(self):
        image_id = self.upload().json()["id"]
        res = self.client.get(f"/images/{image_id}", headers=self.auth_header())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, png_bytes())
        self.assertEqual(res.headers["content-type"], "image/png")

    def test_unknown_image_is_404(self):
        res = self.client.get("/images/nope", headers=self.auth_header())
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["detail"], "Image not found.")

    def test_foreign_image_is_404_with_the_same_body_as_unknown(self):
        foreign_id = self.upload(headers=self.auth_header(FOREIGN)).json()["id"]
        headers = self.auth_header()
        unknown = self.client.get("/images/nope", headers=headers).json()
        foreign = self.client.get(f"/images/{foreign_id}", headers=headers).json()
        self.assertEqual(foreign, unknown)

    def test_missing_bytes_is_404_with_a_reupload_message(self):
        image_id = self.upload().json()["id"]
        record = self.db.image.records[image_id]
        get_storage().delete(record.storageKey)
        res = self.client.get(f"/images/{image_id}", headers=self.auth_header())
        self.assertEqual(res.status_code, 404)
        self.assertEqual(
            res.json()["detail"], "This image is no longer available. Please upload it again."
        )

    def test_requires_authentication(self):
        self.assertEqual(self.client.get("/images/whatever").status_code, 401)


class TestDeleteImage(ImagesApiTestCase):
    def test_removes_row_and_bytes(self):
        image_id = self.upload().json()["id"]
        record = self.db.image.records[image_id]
        headers = self.auth_header()
        res = self.client.delete(f"/images/{image_id}", headers=headers)
        self.assertEqual(res.status_code, 204)
        self.assertNotIn(image_id, self.db.image.records)
        self.assertIsNone(get_storage().read(record.storageKey))
        self.assertEqual(self.client.get(f"/images/{image_id}", headers=headers).status_code, 404)

    def test_cascades_to_history_entries(self):
        image_id = self.upload().json()["id"]
        run(seed_history(self.db, next(iter(self.db.user.records.values())).id, image_id, 3))
        self.assertEqual(len(self.db.historyentry.records), 3)
        res = self.client.delete(f"/images/{image_id}", headers=self.auth_header())
        self.assertEqual(res.status_code, 204)
        self.assertEqual(len(self.db.historyentry.records), 0)

    def test_foreign_image_is_404_and_bytes_survive(self):
        foreign_id = self.upload(headers=self.auth_header(FOREIGN)).json()["id"]
        record = self.db.image.records[foreign_id]
        res = self.client.delete(f"/images/{foreign_id}", headers=self.auth_header())
        self.assertEqual(res.status_code, 404)
        self.assertIn(foreign_id, self.db.image.records)
        self.assertIsNotNone(get_storage().read(record.storageKey))

    def test_unknown_image_is_404(self):
        res = self.client.delete("/images/nope", headers=self.auth_header())
        self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
