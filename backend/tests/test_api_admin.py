"""Admin usage endpoint: JWT role gate and empty response shape."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.security import create_access_token, create_refresh_token
from app.main import app

ADMIN_EMAIL = "pranjal@admin.com"


class _EmptyDelegate:
    def __init__(self):
        self.users: dict = {}

    async def group_by(self, **_kwargs):
        return []

    async def find_many(self, **_kwargs):
        return []

    async def count(self):
        return 0

    async def find_unique(self, where):
        for user in self.users.values():
            if all(getattr(user, key) == value for key, value in where.items()):
                return user
        return None


class _EmptyDB:
    def __init__(self):
        self.user = _EmptyDelegate()
        self.image = _EmptyDelegate()
        self.historyentry = _EmptyDelegate()


class AdminApiTestCase(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.db = _EmptyDB()

    def overview(self, headers=None):
        with (
            patch("app.api.admin.db", self.db),
            patch("app.core.dependencies.db", self.db),
        ):
            return self.client.get("/admin/overview", headers=headers or {})

    def add_user(self, email, role="USER", user_id="u1"):
        self.db.user.users[user_id] = SimpleNamespace(id=user_id, email=email, role=role)
        return user_id

    def test_no_token_is_rejected(self):
        self.assertEqual(self.overview().status_code, 401)

    def test_admin_role_bearer_is_accepted(self):
        user_id = self.add_user(ADMIN_EMAIL, role="ADMIN")
        token = create_access_token(user_id)
        res = self.overview(headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res.json(),
            {
                "totals": {
                    "users": 0,
                    "images": 0,
                    "questions": 0,
                    "storage_bytes": 0,
                },
                "users": [],
                "models": [],
                "recent_questions": [],
            },
        )

    def test_regular_account_is_rejected(self):
        user_id = self.add_user("someone@example.com")
        token = create_access_token(user_id)
        res = self.overview(headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 401)

    def test_token_signed_with_another_secret_is_rejected(self):
        user_id = self.add_user(ADMIN_EMAIL, role="ADMIN")
        token = create_access_token(user_id)
        with patch("app.core.dependencies.SECRET_KEY", "a-different-signing-secret"):
            res = self.overview(headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 401)

    def test_unknown_user_and_refresh_token_are_rejected(self):
        self.add_user(ADMIN_EMAIL, role="ADMIN")
        for token in (
            create_access_token("missing"),
            create_refresh_token("u1", "session1"),
        ):
            with self.subTest(token=token[:12]):
                res = self.overview(headers={"Authorization": f"Bearer {token}"})
                self.assertEqual(res.status_code, 401)
