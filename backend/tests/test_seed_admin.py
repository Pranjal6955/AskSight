import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from scripts import seed_admin
from tests.fakes import run


class TestSeedAdmin(unittest.TestCase):
    def test_requires_an_explicit_password(self):
        with (
            patch.object(seed_admin.sys, "argv", ["seed_admin"]),
            patch.dict(os.environ, {}, clear=False),
        ):
            os.environ.pop("ADMIN_PASSWORD", None)
            with self.assertRaises(SystemExit):
                run(seed_admin.main())

    def test_seed_sets_the_admin_role(self):
        upsert = AsyncMock(return_value=SimpleNamespace(email="admin@example.com"))
        fake_db = SimpleNamespace(user=SimpleNamespace(upsert=upsert))
        with patch.object(seed_admin, "db", fake_db):
            run(seed_admin.seed("admin@example.com", "password123"))
        data = upsert.await_args.kwargs["data"]
        self.assertEqual(data["create"]["role"], seed_admin.Role.ADMIN)
        self.assertEqual(data["update"]["role"], seed_admin.Role.ADMIN)


if __name__ == "__main__":
    unittest.main()
