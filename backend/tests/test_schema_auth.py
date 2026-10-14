import unittest

from pydantic import ValidationError

from app.schema.auth import LoginRequest, SignupRequest, UserResponse


class TestSignupRequest(unittest.TestCase):
    def test_accepts_valid_payload(self):
        req = SignupRequest(name="Ada", email="Ada@Example.com", password="password123")
        self.assertEqual(req.email, "Ada@example.com")

    def test_rejects_short_name(self):
        with self.assertRaises(ValidationError):
            SignupRequest(name="A", email="a@b.com", password="password123")

    def test_rejects_short_password(self):
        with self.assertRaises(ValidationError):
            SignupRequest(name="Ada", email="a@b.com", password="short7c")

    def test_rejects_overlong_password(self):
        with self.assertRaises(ValidationError):
            SignupRequest(name="Ada", email="a@b.com", password="x" * 129)

    def test_rejects_malformed_email(self):
        with self.assertRaises(ValidationError):
            SignupRequest(name="Ada", email="not-an-email", password="password123")


class TestLoginRequest(unittest.TestCase):
    def test_accepts_any_password_length(self):
        self.assertEqual(LoginRequest(email="a@b.com", password="x").password, "x")

    def test_rejects_malformed_email(self):
        with self.assertRaises(ValidationError):
            LoginRequest(email="nope", password="password123")


class TestUserResponse(unittest.TestCase):
    def test_rejects_password_field_leakage(self):
        user = UserResponse(
            id="u1", name="Ada", email="a@b.com", createdAt="2024-01-01T00:00:00",
            password="hashed-secret",
        )
        self.assertNotIn("password", user.model_dump())


if __name__ == "__main__":
    unittest.main()
