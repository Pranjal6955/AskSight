"""Liveness, readiness and model-status probes — unauthenticated (A6/A8)."""

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.api import health as health_module
from app.core import inference
from app.main import app
from tests.fakes import patch_db


class FakeModel:
    model_version = "fake-1.0"
    ready = True

    def stats(self):
        return {"requests": 3, "model_version": self.model_version}


class TestHealth(unittest.TestCase):
    def setUp(self):
        patch_db(self)
        inference.get_inference_service.cache_clear()
        self.addCleanup(inference.get_inference_service.cache_clear)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_live_needs_no_authentication(self):
        res = self.client.get("/health/live")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok"})

    def test_bare_health_is_liveness(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok"})

    def test_ready_reports_database_and_model_ok(self):
        res = self.client.get("/health/ready")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok", "checks": {"database": "ok", "model": "ok"}})

    def test_ready_is_503_when_the_database_is_down(self):
        broken = SimpleNamespace(query_raw=AsyncMock(side_effect=ConnectionError("dsn secret")))
        with patch.object(health_module, "db", broken):
            res = self.client.get("/health/ready")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(
            res.json(),
            {
                "status": "unavailable",
                "checks": {"database": "unavailable", "model": "ok"},
            },
        )
        # Never leak the connection string or the driver error.
        self.assertNotIn("dsn secret", res.text)
        self.assertNotIn("DATABASE_URL", res.text)

    def test_ready_is_503_when_the_model_cannot_load(self):
        with patch.object(
            health_module, "get_inference_service", side_effect=RuntimeError("checkpoint missing")
        ):
            res = self.client.get("/health/ready")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(
            res.json(),
            {
                "status": "unavailable",
                "checks": {"database": "ok", "model": "unavailable"},
            },
        )
        # The checkpoint path and loader error stay in the logs.
        self.assertNotIn("checkpoint missing", res.text)

    def test_model_reports_version_and_stats(self):
        with patch.object(health_module, "get_inference_service", return_value=FakeModel()):
            res = self.client.get("/health/model")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "ok")
        self.assertTrue(body["ready"])
        self.assertEqual(body["model_version"], "fake-1.0")
        self.assertEqual(body["stats"]["requests"], 3)

    def test_model_is_503_when_unavailable(self):
        with patch.object(health_module, "get_inference_service", side_effect=RuntimeError("boom")):
            res = self.client.get("/health/model")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json(), {"status": "unavailable", "ready": False, "stats": {}})
        self.assertNotIn("boom", res.text)


if __name__ == "__main__":
    unittest.main()
