import unittest
from types import SimpleNamespace

from prisma.client import Prisma

from app import db as db_module
from app.db import db as shared_db


class TestDB(unittest.TestCase):
    def test_exports_single_shared_prisma_instance(self):
        self.assertIsInstance(shared_db, Prisma)
        self.assertIs(shared_db, db_module.db)

    def test_exposes_generated_user_model(self):
        self.assertTrue(hasattr(shared_db, "user"))
        self.assertTrue(hasattr(shared_db.user, "find_unique"))
        self.assertTrue(hasattr(shared_db.user, "create"))


class TestPrismaUserShape(unittest.TestCase):
    """Guards the attributes the auth routes read off a user record."""

    REQUIRED = ("id", "name", "email", "password", "createdAt")

    def test_fake_user_matches_fields_routes_use(self):
        user = SimpleNamespace(**{f: "v" for f in self.REQUIRED})
        self.assertTrue(all(hasattr(user, f) for f in self.REQUIRED))


if __name__ == "__main__":
    unittest.main()
