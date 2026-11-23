"""Admin usage endpoint: auth gates and empty response shape."""

import os
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

    def overview(self, headers=None, **env):
        credentials = {"ADMIN_TOKEN": "", "ADMIN_EMAILS": "", **env}
        with (
            patch.dict(os.environ, credentials),
            patch("app.api.admin.db", self.db),
            patch("app.core.dependencies.db", self.db),
        ):
            return self.client.get("/admin/overview", headers=headers or {})

    def add_user(self, email, user_id="u1"):
        self.db.user.users[user_id] = SimpleNamespace(id=user_id, email=email)
        return user_id

    def test_disabled_when_no_credentials_are_configured(self):
        res = self.overview(headers={"X-Admin-Token": "x"})
        self.assertEqual(res.status_code, 503)

    def test_rejects_missing_or_wrong_key(self):
        self.assertEqual(self.overview(ADMIN_TOKEN="secret").status_code, 401)
        self.assertEqual(
            self.overview(headers={"X-Admin-Token": "wrong"}, ADMIN_TOKEN="secret").status_code,
            401,
        )

    def test_valid_key_returns_the_empty_overview(self):
        res = self.overview(headers={"X-Admin-Token": "secret"}, ADMIN_TOKEN="secret")
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

    def test_admin_account_bearer_is_accepted(self):
        user_id = self.add_user(ADMIN_EMAIL)
        token = create_access_token(user_id)
        res = self.overview(
            headers={"Authorization": f"Bearer {token}"},
            ADMIN_EMAILS=ADMIN_EMAIL,
        )
        self.assertEqual(res.status_code, 200)

    def test_other_accounts_are_rejected(self):
        user_id = self.add_user("someone@example.com")
        token = create_access_token(user_id)
        res = self.overview(
            headers={"Authorization": f"Bearer {token}"},
            ADMIN_EMAILS=ADMIN_EMAIL,
        )
        self.assertEqual(res.status_code, 401)

    def test_unknown_user_and_refresh_token_are_rejected(self):
        self.add_user(ADMIN_EMAIL)
        for token in (
            create_access_token("missing"),
            create_refresh_token("u1", "session1"),
        ):
            with self.subTest(token=token[:12]):
                res = self.overview(
                    headers={"Authorization": f"Bearer {token}"},
                    ADMIN_EMAILS=ADMIN_EMAIL,
                )
                self.assertEqual(res.status_code, 401)
