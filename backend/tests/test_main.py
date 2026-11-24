import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main
from tests.fakes import FakeDB


class TestRouting(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def test_registers_all_endpoints(self):
        paths = self.client.get("/openapi.json").json()["paths"]
        self.assertEqual(
            set(paths),
            {
                "/auth/signup",
                "/auth/login",
                "/auth/refresh",
                "/auth/logout",
                "/auth/me",
                "/admin/overview",
                "/images",
                "/images/{image_id}",
                "/ask",
                "/history",
                "/history/{entry_id}",
                "/health/live",
                "/health/ready",
                "/health/model",
                "/stt",
                "/tts",
            },
        )

    def test_signup_is_post_and_me_is_get(self):
        paths = self.client.get("/openapi.json").json()["paths"]
        self.assertEqual(set(paths["/auth/signup"]), {"post"})
        self.assertEqual(set(paths["/auth/me"]), {"get"})

    def test_declares_201_created_for_signup(self):
        op = self.client.get("/openapi.json").json()["paths"]["/auth/signup"]["post"]
        self.assertIn("201", op["responses"])


class TestDashboardMount(unittest.TestCase):
    def test_missing_build_directory_does_not_break_startup(self):
        missing = Path(tempfile.gettempdir()) / "asksight-dashboard-not-built"
        with patch.object(main, "DASHBOARD_DIR", missing):
            application = main.create_app()
        self.assertNotIn(
            "/dashboard", {getattr(route, "path", None) for route in application.routes}
        )

    def test_built_dashboard_is_mounted(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(main, "DASHBOARD_DIR", Path(directory)),
        ):
            application = main.create_app()
        self.assertIn("/dashboard", {getattr(route, "path", None) for route in application.routes})


class TestLifespan(unittest.TestCase):
    def test_connects_db_on_startup_and_disconnects_on_shutdown(self):
        fake = FakeDB()
        with patch.object(main, "db", fake):
            with TestClient(main.app) as client:
                self.assertTrue(fake.connected)
                client.get("/openapi.json")
            self.assertFalse(fake.connected)

    def test_model_load_failure_does_not_stop_the_api(self):
        fake = FakeDB()
        with (
            patch.object(main, "db", fake),
            patch.object(main, "get_inference_service", side_effect=RuntimeError("no checkpoint")),
            TestClient(main.app) as client,
        ):
            self.assertEqual(client.get("/health/live").status_code, 200)
            self.assertTrue(fake.connected)


if __name__ == "__main__":
    unittest.main()
