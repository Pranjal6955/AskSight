import asyncio
import time
import unittest
from unittest.mock import patch

import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core import dependencies
from app.core.security import ALGORITHM, SECRET_KEY, create_access_token
from tests.fakes import FakeDB


def run(coro):
    return asyncio.run(coro)


def creds(token):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


class TestGetCurrentUser(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        patcher = patch.object(dependencies, "db", self.db)
        patcher.start()
        self.addCleanup(patcher.stop)

    def call(self, token):
        return run(dependencies.get_current_user(creds(token)))

    def test_returns_user_for_valid_token(self):
        user = run(self.db.user.create({"name": "Ada", "email": "a@b.com", "password": "h"}))
        self.assertIs(self.call(create_access_token(user.id)), user)

    def test_rejects_expired_token(self):
        expired = jwt.encode(
            {"sub": "u1", "exp": time.time() - 10}, SECRET_KEY, algorithm=ALGORITHM
        )
        with self.assertRaises(HTTPException) as ctx:
            self.call(expired)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_rejects_token_signed_with_wrong_secret(self):
        forged = jwt.encode({"sub": "u1", "exp": time.time() + 60}, "attacker", algorithm=ALGORITHM)
        with self.assertRaises(HTTPException) as ctx:
            self.call(forged)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_rejects_token_without_subject(self):
        token = jwt.encode({"exp": time.time() + 60}, SECRET_KEY, algorithm=ALGORITHM)
        with self.assertRaises(HTTPException) as ctx:
            self.call(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid token")

    def test_rejects_token_for_deleted_user(self):
        with self.assertRaises(HTTPException) as ctx:
            self.call(create_access_token("ghost"))
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "User not found")


if __name__ == "__main__":
    unittest.main()
