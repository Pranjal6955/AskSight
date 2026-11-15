"""Request-ID stamping and structured access logs (A1)."""

import json
import unittest
import uuid

from fastapi.testclient import TestClient

from app.main import app
from tests.fakes import patch_db

SAFE_ID = "mobile-app.abc-123"


class MiddlewareTestCase(unittest.TestCase):
    def setUp(self):
        patch_db(self)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)


class TestRequestId(MiddlewareTestCase):
    def test_generates_a_uuid_when_the_client_sends_none(self):
        request_id = self.client.get("/health/live").headers["x-request-id"]
        self.assertEqual(str(uuid.UUID(request_id)), request_id)

    def test_echoes_a_safe_client_supplied_id(self):
        res = self.client.get("/health/live", headers={"X-Request-ID": SAFE_ID})
        self.assertEqual(res.headers["x-request-id"], SAFE_ID)

    def test_replaces_an_unsafe_client_supplied_id(self):
        # Spaces and control-adjacent characters could forge log lines.
        res = self.client.get("/health/live", headers={"X-Request-ID": "bad id!"})
        self.assertNotEqual(res.headers["x-request-id"], "bad id!")

    def test_replaces_an_oversized_client_supplied_id(self):
        res = self.client.get("/health/live", headers={"X-Request-ID": "x" * 65})
        self.assertNotEqual(res.headers["x-request-id"], "x" * 65)

    def test_error_responses_also_carry_a_request_id(self):
        res = self.client.get("/auth/me")
        self.assertEqual(res.status_code, 401)
        self.assertTrue(res.headers["x-request-id"])


class TestAccessLog(MiddlewareTestCase):
    def capture(self, path, **request_kwargs):
        with self.assertLogs("asksight.access", level="INFO") as logs:
            res = self.client.get(path, **request_kwargs)
        self.assertEqual(len(logs.records), 1)
        return res, json.loads(logs.records[0].getMessage())

    def test_logs_one_json_line_with_the_expected_fields(self):
        res, line = self.capture(
            "/history", params={"limit": 5}, headers={"Authorization": "Bearer garbage"}
        )
        self.assertEqual(set(line), {"ts", "request_id", "method", "path", "status", "duration_ms"})
        self.assertEqual(line["method"], "GET")
        # The path only — query strings and headers never reach the logs.
        self.assertEqual(line["path"], "/history")
        self.assertNotIn("limit", json.dumps(line))
        self.assertNotIn("Bearer", json.dumps(line))
        self.assertEqual(line["status"], res.status_code)
        self.assertEqual(line["request_id"], res.headers["x-request-id"])
        self.assertGreaterEqual(line["duration_ms"], 0)

    def test_logs_failures_with_the_response_status(self):
        _, line = self.capture("/auth/me")
        self.assertEqual(line["status"], 401)


if __name__ == "__main__":
    unittest.main()
