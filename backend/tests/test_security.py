import time
import unittest

import jwt

from app.core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing(unittest.TestCase):
    def test_hash_returns_verifyable_hash(self):
        hashed = hash_password("correct horse battery")
        self.assertNotEqual(hashed, "correct horse battery")
        self.assertTrue(verify_password("correct horse battery", hashed))

    def test_hash_is_salted_so_equal_passwords_differ(self):
        self.assertNotEqual(hash_password("same-password"), hash_password("same-password"))

    def test_verify_rejects_wrong_password(self):
        self.assertFalse(verify_password("wrong", hash_password("right")))

    def test_verify_rejects_garbage_hash(self):
        self.assertFalse(verify_password("anything", "not-a-real-hash"))


class TestAccessToken(unittest.TestCase):
    def test_token_decodes_to_subject(self):
        token = create_access_token("user-123")
        self.assertEqual(jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])["sub"], "user-123")

    def test_token_is_signed_with_hs256(self):
        self.assertEqual(jwt.get_unverified_header(create_access_token("u1"))["alg"], "HS256")

    def test_token_carries_expiry(self):
        decoded = jwt.decode(create_access_token("u1"), SECRET_KEY, algorithms=[ALGORITHM])
        remaining = decoded["exp"] - time.time()
        self.assertAlmostEqual(remaining, ACCESS_TOKEN_EXPIRE_MINUTES * 60, delta=5)

    def test_token_signed_with_other_secret_is_rejected(self):
        forged = jwt.encode({"sub": "u1", "exp": time.time() + 60}, "attacker", algorithm=ALGORITHM)
        with self.assertRaises(jwt.InvalidTokenError):
            jwt.decode(forged, SECRET_KEY, algorithms=[ALGORITHM])

    def test_expired_token_is_rejected(self):
        expired = jwt.encode(
            {"sub": "u1", "exp": time.time() - 10}, SECRET_KEY, algorithm=ALGORITHM
        )
        with self.assertRaises(jwt.ExpiredSignatureError):
            jwt.decode(expired, SECRET_KEY, algorithms=[ALGORITHM])


if __name__ == "__main__":
    unittest.main()
