import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api import auth as auth_module
from app.core import dependencies
from app.core.security import verify_password
from app.main import app
from tests.fakes import FakeDB

SIGNUP = {"name": "Ada Lovelace", "email": "Ada@Example.com", "password": "password123"}
PASSWORD = "password123"


class AuthApiTestCase(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        for module in (auth_module, dependencies):
            patcher = patch.object(module, "db", self.db)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def signup(self, **overrides):
        return self.client.post("/auth/signup", json={**SIGNUP, **overrides})


class TestSignup(AuthApiTestCase):
    def test_creates_user_and_returns_201(self):
        res = self.signup()
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body["email"], "ada@example.com")
        self.assertEqual(body["name"], "Ada Lovelace")
        self.assertTrue(body["id"])

    def test_normalizes_and_strips_email(self):
        self.assertEqual(self.signup(email="  MiXeD@Case.COM  ").json()["email"], "mixed@case.com")

    def test_trims_name(self):
        self.assertEqual(self.signup(name="  Ada  ").json()["name"], "Ada")

    def test_never_returns_password(self):
        self.assertNotIn("password", self.signup().json())

    def test_stores_password_hashed_not_plaintext(self):
        self.signup()
        stored = next(iter(self.db.user.users.values()))
        self.assertNotEqual(stored.password, PASSWORD)
        self.assertTrue(verify_password(PASSWORD, stored.password))

    def test_rejects_duplicate_email_with_409(self):
        self.signup()
        res = self.signup()
        self.assertEqual(res.status_code, 409)

    def test_duplicate_detection_is_case_insensitive(self):
        self.signup(email="ada@example.com")
        self.assertEqual(self.signup(email="ADA@example.com").status_code, 409)

    def test_rejects_invalid_payload_with_422(self):
        for bad in ({"email": "nope"}, {"password": "short"}, {"name": "A"}, {"email": ""}):
            with self.subTest(bad=bad):
                self.assertEqual(self.signup(**bad).status_code, 422)

    def test_does_not_create_user_when_validation_fails(self):
        self.signup(password="short")
        self.assertEqual(len(self.db.user.users), 0)


class TestLogin(AuthApiTestCase):
    def setUp(self):
        super().setUp()
        self.signup()

    def test_returns_bearer_token(self):
        res = self.client.post("/auth/login", json={"email": SIGNUP["email"], "password": PASSWORD})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["token_type"], "bearer")
        self.assertTrue(res.json()["access_token"])

    def test_login_is_case_insensitive_on_email(self):
        res = self.client.post(
            "/auth/login", json={"email": "ADA@example.com", "password": PASSWORD}
        )
        self.assertEqual(res.status_code, 200)

    def test_rejects_wrong_password_with_401(self):
        res = self.client.post("/auth/login", json={"email": SIGNUP["email"], "password": "wrong"})
        self.assertEqual(res.status_code, 401)

    def test_rejects_unknown_email_with_401(self):
        res = self.client.post("/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
        self.assertEqual(res.status_code, 401)

    def test_rejects_invalid_payload_with_422(self):
        self.assertEqual(
            self.client.post("/auth/login", json={"email": "nope", "password": "x"}).status_code, 422
        )

    def test_does_not_leak_whether_email_exists(self):
        unknown = self.client.post("/auth/login", json={"email": "nobody@example.com", "password": "x"})
        wrong = self.client.post("/auth/login", json={"email": SIGNUP["email"], "password": "x"})
        self.assertEqual(unknown.json(), wrong.json())


class TestMe(AuthApiTestCase):
    def auth_header(self):
        token = self.client.post(
            "/auth/login", json={"email": SIGNUP["email"], "password": PASSWORD}
        ).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_returns_current_user(self):
        self.signup()
        res = self.client.get("/auth/me", headers=self.auth_header())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["email"], "ada@example.com")
        self.assertNotIn("password", res.json())

    def test_rejects_missing_header_with_401(self):
        self.assertEqual(self.client.get("/auth/me").status_code, 401)

    def test_rejects_malformed_header_with_401(self):
        self.assertEqual(
            self.client.get("/auth/me", headers={"Authorization": "Token abc"}).status_code, 401
        )

    def test_rejects_garbage_token_with_401(self):
        self.assertEqual(
            self.client.get("/auth/me", headers={"Authorization": "Bearer garbage"}).status_code, 401
        )

    def test_rejects_token_for_deleted_user_with_401(self):
        self.signup()
        headers = self.auth_header()
        self.db.user.users.clear()
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)


if __name__ == "__main__":
    unittest.main()
