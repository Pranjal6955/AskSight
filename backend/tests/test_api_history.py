"""History list, detail, and deletion endpoints (A7)."""

import unittest

from fastapi.testclient import TestClient

from app.core.storage import get_storage
from app.main import app
from tests.fakes import patch_db, patch_storage, run, seed_history

SIGNUP = {"name": "Ada Lovelace", "email": "Ada@Example.com", "password": "password123"}
FOREIGN = {"name": "Bob", "email": "bob@example.com", "password": "password123"}


class HistoryApiTestCase(unittest.TestCase):
    def setUp(self):
        self.db = patch_db(self)
        patch_storage(self)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.user_id, self.headers = self.signup(SIGNUP)

    def signup(self, signup):
        """Create the account and return (user_id, auth headers)."""
        self.client.post("/auth/signup", json=signup)
        token = self.client.post(
            "/auth/login", json={"email": signup["email"], "password": signup["password"]}
        ).json()["access_token"]
        # The API lowercases emails on the way in.
        user = run(self.db.user.find_unique({"email": signup["email"].strip().lower()}))
        return user.id, {"Authorization": f"Bearer {token}"}

    def seed(self, count, image_id="img_existing", owner_id=None):
        return run(seed_history(self.db, owner_id or self.user_id, image_id, count))

    def seed_image(self, owner_id=None):
        """A stored image with real bytes; returns (row, stored bytes)."""
        data = b"photo-bytes"
        key = get_storage().save(data, ".png")
        image = run(
            self.db.image.create(
                {
                    "ownerId": owner_id or self.user_id,
                    "storageKey": key,
                    "mimeType": "image/png",
                    "sizeBytes": len(data),
                    "width": 1,
                    "height": 1,
                }
            )
        )
        return image, data

    def list_page(self, **params):
        return self.client.get("/history", params=params, headers=self.headers)


class TestListHistory(HistoryApiTestCase):
    def test_empty_history_returns_an_empty_page(self):
        res = self.list_page()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"items": [], "next_cursor": None, "has_more": False})

    def test_returns_newest_first(self):
        self.seed(3)
        items = self.list_page().json()["items"]
        self.assertEqual([item["question"] for item in items], ["q2", "q1", "q0"])

    def test_paginates_with_a_cursor_without_gaps_or_duplicates(self):
        self.seed(25)
        seen, cursor, pages = [], None, 0
        while True:
            page = self.list_page(limit=10, **({"cursor": cursor} if cursor else {})).json()
            seen.extend(item["question"] for item in page["items"])
            pages += 1
            if not page["has_more"]:
                self.assertIsNone(page["next_cursor"])
                break
            cursor = page["next_cursor"]
            self.assertLessEqual(pages, 10)  # guard against a cursor that never advances
        self.assertEqual(pages, 3)
        self.assertEqual(seen, [f"q{i}" for i in range(24, -1, -1)])
        self.assertEqual(len(seen), len(set(seen)))

    def test_invalid_cursor_is_400(self):
        res = self.list_page(cursor="not-a-cursor")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["detail"], "Invalid pagination cursor.")

    def test_limit_bounds_are_enforced(self):
        self.assertEqual(self.list_page(limit=0).status_code, 422)
        self.assertEqual(self.list_page(limit=51).status_code, 422)

    def test_never_lists_another_users_entries(self):
        other_id, other_headers = self.signup(FOREIGN)
        run(seed_history(self.db, other_id, "img2", 4))
        self.assertEqual(self.list_page().json()["items"], [])
        foreign_page = self.client.get("/history", headers=other_headers).json()
        self.assertEqual(len(foreign_page["items"]), 4)

    def test_requires_authentication(self):
        self.assertEqual(self.client.get("/history").status_code, 401)


class TestHistoryDetail(HistoryApiTestCase):
    def setUp(self):
        super().setUp()
        (self.entry,) = self.seed(1, image_id="img77")

    def test_returns_the_entry(self):
        res = self.client.get(f"/history/{self.entry.id}", headers=self.headers)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["id"], self.entry.id)
        self.assertEqual(body["image_id"], "img77")
        self.assertEqual(body["image_url"], "/images/img77")
        self.assertEqual(body["question"], "q0")
        self.assertEqual(body["model_version"], "fake-1.0")

    def test_unknown_entry_is_404(self):
        res = self.client.get("/history/nope", headers=self.headers)
        self.assertEqual(res.status_code, 404)

    def test_foreign_entry_is_404_with_the_same_body_as_unknown(self):
        other_id, _ = self.signup(FOREIGN)
        (foreign,) = run(seed_history(self.db, other_id, "img88", 1))
        unknown = self.client.get("/history/nope", headers=self.headers).json()
        own = self.client.get(f"/history/{foreign.id}", headers=self.headers).json()
        self.assertEqual(own, unknown)

    def test_requires_authentication(self):
        self.assertEqual(self.client.get(f"/history/{self.entry.id}").status_code, 401)


class TestDeleteHistory(HistoryApiTestCase):
    def test_deletes_one_entry(self):
        (entry,) = self.seed(1)
        res = self.client.delete(f"/history/{entry.id}", headers=self.headers)
        self.assertEqual(res.status_code, 204)
        self.assertEqual(len(self.db.historyentry.records), 0)

    def test_keeps_the_image_while_other_entries_reference_it(self):
        image, data = self.seed_image()
        entries = run(seed_history(self.db, self.user_id, image.id, 2))
        res = self.client.delete(f"/history/{entries[0].id}", headers=self.headers)
        self.assertEqual(res.status_code, 204)
        self.assertIn(image.id, self.db.image.records)
        self.assertEqual(len(self.db.historyentry.records), 1)
        self.assertEqual(get_storage().read(image.storageKey), data)

    def test_last_entry_for_an_image_also_removes_the_image_bytes(self):
        image, _ = self.seed_image()
        (entry,) = run(seed_history(self.db, self.user_id, image.id, 1))
        res = self.client.delete(f"/history/{entry.id}", headers=self.headers)
        self.assertEqual(res.status_code, 204)
        self.assertNotIn(image.id, self.db.image.records)
        self.assertIsNone(get_storage().read(image.storageKey))
        self.assertEqual(len(self.db.historyentry.records), 0)

    def test_foreign_entry_is_404_and_survives(self):
        other_id, _ = self.signup(FOREIGN)
        (foreign,) = run(seed_history(self.db, other_id, "imgX", 1))
        res = self.client.delete(f"/history/{foreign.id}", headers=self.headers)
        self.assertEqual(res.status_code, 404)
        self.assertIn(foreign.id, self.db.historyentry.records)

    def test_delete_all_wipes_only_the_callers_data_and_bytes(self):
        other_id, other_headers = self.signup(FOREIGN)
        own_image, own_data = self.seed_image()
        foreign_image, foreign_data = self.seed_image(owner_id=other_id)
        self.seed(3, image_id=own_image.id)
        run(seed_history(self.db, other_id, foreign_image.id, 2))

        res = self.client.delete("/history", headers=self.headers)
        self.assertEqual(res.status_code, 204)
        # Everything of the caller's is gone, rows and bytes.
        self.assertEqual(self.db.image.records, {foreign_image.id: foreign_image})
        self.assertIsNone(get_storage().read(own_image.storageKey))
        remaining = list(self.db.historyentry.records.values())
        self.assertEqual({entry.ownerId for entry in remaining}, {other_id})
        self.assertEqual(len(remaining), 2)
        # The other user's bytes are untouched.
        self.assertEqual(get_storage().read(foreign_image.storageKey), foreign_data)
        # And the other user still sees their history.
        foreign_page = self.client.get("/history", headers=other_headers).json()
        self.assertEqual(len(foreign_page["items"]), 2)

    def test_requires_authentication(self):
        self.assertEqual(self.client.delete("/history").status_code, 401)
        self.assertEqual(self.client.delete("/history/whatever").status_code, 401)


if __name__ == "__main__":
    unittest.main()
