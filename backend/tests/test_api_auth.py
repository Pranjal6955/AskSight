import unittest

from fastapi.testclient import TestClient

from app.api import auth as auth_module
from app.core.security import create_refresh_token, verify_password
from app.main import app
from tests.fakes import patch_db

SIGNUP = {"name": "Ada Lovelace", "email": "Ada@Example.com", "password": "password123"}
PASSWORD = "password123"


class AuthApiTestCase(unittest.TestCase):
    def setUp(self):
        self.db = patch_db(self)
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
        stored = next(iter(self.db.user.records.values()))
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
        self.assertEqual(len(self.db.user.records), 0)


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
        res = self.client.post(
            "/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}
        )
        self.assertEqual(res.status_code, 401)

    def test_rejects_invalid_payload_with_422(self):
        self.assertEqual(
            self.client.post("/auth/login", json={"email": "nope", "password": "x"}).status_code,
            422,
        )

    def test_does_not_leak_whether_email_exists(self):
        unknown = self.client.post(
            "/auth/login", json={"email": "nobody@example.com", "password": "x"}
        )
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
            self.client.get("/auth/me", headers={"Authorization": "Bearer garbage"}).status_code,
            401,
        )

    def test_rejects_token_for_deleted_user_with_401(self):
        self.signup()
        headers = self.auth_header()
        self.db.user.records.clear()
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)


class TestRefresh(AuthApiTestCase):
    def setUp(self):
        super().setUp()
        self.signup()

    def tokens(self):
        return self.client.post(
            "/auth/login", json={"email": SIGNUP["email"], "password": PASSWORD}
        ).json()

    def refresh(self, token):
        return self.client.post("/auth/refresh", json={"refresh_token": token})

    def test_login_returns_a_refresh_token(self):
        body = self.tokens()
        self.assertTrue(body["refresh_token"])
        self.assertEqual(body["token_type"], "bearer")

    def test_refresh_returns_a_working_new_token_pair(self):
        first = self.tokens()
        res = self.refresh(first["refresh_token"])
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertNotEqual(body["refresh_token"], first["refresh_token"])
        me = self.client.get(
            "/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
        )
        self.assertEqual(me.status_code, 200)

    def test_refresh_rotates_so_the_old_token_cannot_be_replayed(self):
        first = self.tokens()
        self.assertEqual(self.refresh(first["refresh_token"]).status_code, 200)
        replay = self.refresh(first["refresh_token"])
        self.assertEqual(replay.status_code, 401)
        self.assertEqual(replay.json()["detail"], auth_module.INVALID_SESSION)

    def test_rotation_keeps_exactly_one_live_session(self):
        first = self.tokens()
        self.assertEqual(len(self.db.session.records), 1)
        second = self.refresh(first["refresh_token"]).json()
        self.assertEqual(len(self.db.session.records), 1)
        self.refresh(second["refresh_token"])
        self.assertEqual(len(self.db.session.records), 1)

    def test_refresh_with_garbage_is_401(self):
        self.assertEqual(self.refresh("garbage").status_code, 401)

    def test_access_token_is_not_accepted_as_a_refresh_token(self):
        self.assertEqual(self.refresh(self.tokens()["access_token"]).status_code, 401)

    def test_refresh_without_a_live_session_is_401(self):
        # A well-formed token whose session row no longer exists.
        user = next(iter(self.db.user.records.values()))
        orphan = create_refresh_token(user.id, "sess_gone")
        self.assertEqual(self.refresh(orphan).status_code, 401)

    def test_refresh_requires_the_field(self):
        self.assertEqual(self.client.post("/auth/refresh", json={}).status_code, 422)


class TestLogout(AuthApiTestCase):
    def setUp(self):
        super().setUp()
        self.signup()
        self.token = self.client.post(
            "/auth/login", json={"email": SIGNUP["email"], "password": PASSWORD}
        ).json()["refresh_token"]

    def logout(self, token=None):
        return self.client.post("/auth/logout", json={"refresh_token": token or self.token})

    def test_logout_revokes_the_session(self):
        res = self.logout()
        self.assertEqual(res.status_code, 204)
        self.assertEqual(len(self.db.session.records), 0)
        # The revoked refresh token can no longer be exchanged.
        res = self.client.post("/auth/refresh", json={"refresh_token": self.token})
        self.assertEqual(res.status_code, 401)

    def test_logout_is_idempotent(self):
        self.assertEqual(self.logout().status_code, 204)
        self.assertEqual(self.logout().status_code, 204)

    def test_logout_with_garbage_is_401(self):
        self.assertEqual(self.logout(token="garbage").status_code, 401)

    def test_refresh_token_is_rejected_as_an_access_token(self):
        res = self.client.get("/auth/me", headers={"Authorization": f"Bearer {self.token}"})
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
