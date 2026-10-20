import unittest
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
        self.assertEqual(set(paths), {"/auth/signup", "/auth/login", "/auth/me", "/ask"})

    def test_signup_is_post_and_me_is_get(self):
        paths = self.client.get("/openapi.json").json()["paths"]
        self.assertEqual(set(paths["/auth/signup"]), {"post"})
        self.assertEqual(set(paths["/auth/me"]), {"get"})

    def test_declares_201_created_for_signup(self):
        op = self.client.get("/openapi.json").json()["paths"]["/auth/signup"]["post"]
        self.assertIn("201", op["responses"])


class TestLifespan(unittest.TestCase):
    def test_connects_db_on_startup_and_disconnects_on_shutdown(self):
        fake = FakeDB()
        with patch.object(main, "db", fake):
            with TestClient(main.app) as client:
                self.assertTrue(fake.connected)
                client.get("/openapi.json")
            self.assertFalse(fake.connected)


if __name__ == "__main__":
    unittest.main()
