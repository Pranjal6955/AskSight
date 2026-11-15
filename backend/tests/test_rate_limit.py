"""Rate limiting: unit behavior and endpoint enforcement (A6)."""

import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core import rate_limit
from app.core.rate_limit import RATE_LIMITED, RateLimiter
from app.main import app
from tests.fakes import patch_db

SIGNUP = {"name": "Ada Lovelace", "email": "Ada@Example.com", "password": "password123"}
FOREIGN = {"name": "Bob", "email": "bob@example.com", "password": "password123"}


class TestRateLimiter(unittest.TestCase):
    def test_allows_up_to_the_limit_then_denies(self):
        limiter = RateLimiter(limit=3, window_seconds=60)
        self.assertEqual([limiter.allow("k") for _ in range(4)], [True, True, True, False])

    def test_keys_are_independent(self):
        limiter = RateLimiter(limit=1, window_seconds=60)
        self.assertTrue(limiter.allow("a"))
        self.assertTrue(limiter.allow("b"))
        self.assertFalse(limiter.allow("a"))

    def test_slots_free_when_the_window_passes(self):
        limiter = RateLimiter(limit=1, window_seconds=0.05)
        self.assertTrue(limiter.allow("k"))
        self.assertFalse(limiter.allow("k"))
        time.sleep(0.06)
        self.assertTrue(limiter.allow("k"))

    def test_sweep_drops_expired_keys(self):
        limiter = RateLimiter(limit=1, window_seconds=0.01)
        for index in range(6):
            limiter._hits[f"old{index}"].append(time.monotonic() - 10)
        with patch.object(rate_limit, "_SWEEP_AT", 5):
            self.assertTrue(limiter.allow("new"))  # triggers the sweep
        self.assertEqual(list(limiter._hits), ["new"])

    def test_reset_clears_everything(self):
        limiter = RateLimiter(limit=1, window_seconds=60)
        limiter.allow("k")
        limiter.reset()
        self.assertTrue(limiter.allow("k"))


class TestAuthRateLimit(unittest.TestCase):
    def setUp(self):
        patch_db(self)  # resets counters as well
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def login(self):
        return self.client.post(
            "/auth/login", json={"email": "nobody@example.com", "password": "wrong-pass"}
        )

    def test_login_is_capped_per_ip_and_recovers_after_reset(self):
        statuses = [self.login().status_code for _ in range(rate_limit.auth_limiter.limit)]
        self.assertEqual(statuses, [401] * rate_limit.auth_limiter.limit)
        limited = self.login()
        self.assertEqual(limited.status_code, 429)
        self.assertEqual(limited.json()["detail"], RATE_LIMITED)
        # A cleared window (restart, tests) serves again.
        rate_limit.reset_all()
        self.assertEqual(self.login().status_code, 401)

    def test_signup_and_refresh_share_the_same_budget(self):
        for _ in range(rate_limit.auth_limiter.limit):
            self.client.post("/auth/signup", json=SIGNUP)
        res = self.client.post("/auth/refresh", json={"refresh_token": "x"})
        self.assertEqual(res.status_code, 429)


class TestUserRateLimit(unittest.TestCase):
    def setUp(self):
        self.db = patch_db(self)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.headers = self.signup(SIGNUP)

    def signup(self, signup):
        self.client.post("/auth/signup", json=signup)
        token = self.client.post(
            "/auth/login", json={"email": signup["email"], "password": signup["password"]}
        ).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def upload(self, headers):
        import io

        from PIL import Image as PILImage

        buffer = io.BytesIO()
        PILImage.new("RGB", (4, 4)).save(buffer, format="PNG")
        return self.client.post(
            "/images",
            files={"file": ("photo.png", buffer.getvalue(), "image/png")},
            headers=headers,
        )

    def exhaust(self, user_id):
        limiter = rate_limit.user_limiter
        while limiter.allow(f"user:{user_id}"):
            pass  # burn the window for this user only

    def test_upload_is_capped_per_user_and_other_users_are_unaffected(self):
        user_id = next(iter(self.db.user.records.values())).id
        self.exhaust(user_id)
        self.assertEqual(self.upload(self.headers).status_code, 429)

        other = self.signup(FOREIGN)
        self.assertEqual(self.upload(other).status_code, 201)

    def test_ask_is_capped_per_user(self):
        user_id = next(iter(self.db.user.records.values())).id
        image_id = self.upload(self.headers).json()["id"]
        self.exhaust(user_id)
        res = self.client.post(
            "/ask", json={"image_id": image_id, "question": "hi?"}, headers=self.headers
        )
        self.assertEqual(res.status_code, 429)
        self.assertEqual(res.json()["detail"], RATE_LIMITED)

    def test_reads_are_not_capped(self):
        user_id = next(iter(self.db.user.records.values())).id
        self.exhaust(user_id)
        self.assertEqual(self.client.get("/history", headers=self.headers).status_code, 200)


if __name__ == "__main__":
    unittest.main()
