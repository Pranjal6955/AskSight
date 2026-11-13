"""Liveness and readiness probes — unauthenticated, no secrets (A6/A8)."""

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.api import health as health_module
from app.main import app
from tests.fakes import patch_db


class TestHealth(unittest.TestCase):
    def setUp(self):
        patch_db(self)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_live_needs_no_authentication(self):
        res = self.client.get("/health/live")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok"})

    def test_ready_reports_database_ok(self):
        res = self.client.get("/health/ready")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok", "checks": {"database": "ok"}})

    def test_ready_is_503_when_the_database_is_down(self):
        broken = SimpleNamespace(query_raw=AsyncMock(side_effect=ConnectionError("dsn secret")))
        with patch.object(health_module, "db", broken):
            res = self.client.get("/health/ready")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(
            res.json(), {"status": "unavailable", "checks": {"database": "unavailable"}}
        )
        # Never leak the connection string or the driver error.
        self.assertNotIn("dsn secret", res.text)
        self.assertNotIn("DATABASE_URL", res.text)


if __name__ == "__main__":
    unittest.main()
