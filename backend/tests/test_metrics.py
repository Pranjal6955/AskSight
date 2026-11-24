"""The scrape endpoint is open, cheap, and never starts a model load."""

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api import metrics as metrics_module
from app.main import app


class TestMetrics(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_scrape_exposes_http_and_model_metrics_without_auth(self):
        self.client.get("/health/live")
        res = self.client.get("/metrics")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/plain", res.headers["content-type"])
        self.assertIn("asksight_http_requests_total", res.text)
        self.assertIn('route="/health/live"', res.text)
        self.assertIn("asksight_model_ready", res.text)

    def test_scrape_does_not_start_a_model_load(self):
        with patch.object(metrics_module, "cached_service", return_value=None) as cached:
            res = self.client.get("/metrics")
        self.assertEqual(res.status_code, 200)
        cached.assert_called_once_with()
        self.assertIn("asksight_model_ready 0.0", res.text)


if __name__ == "__main__":
    unittest.main()
