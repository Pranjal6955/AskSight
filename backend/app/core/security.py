import os
from datetime import UTC, datetime, timedelta

import jwt
from dotenv import load_dotenv
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

load_dotenv()

SECRET_KEY = os.getenv("JWT")
if not SECRET_KEY:
    raise RuntimeError("JWT is not set in the environment (.env)")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 30
# Marks a token as a refresh token. Access tokens carry no `type`, so the two
# kinds can never be swapped for each other.
REFRESH_TOKEN_TYPE = "refresh"

passwordHash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return passwordHash.hash(password)


def verify_password(plain_password: str, hash_password: str) -> bool:
    try:
        return passwordHash.verify(plain_password, hash_password)
    except UnknownHashError:
        return False


def create_access_token(user_id: str) -> str:
    expires_at = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {"sub": user_id, "exp": expires_at}

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: str, session_id: str) -> str:
    """A long-lived token bound to one session row; refresh rotates both."""
    expires_at = datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    payload = {"sub": user_id, "sid": session_id, "type": REFRESH_TOKEN_TYPE, "exp": expires_at}

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_refresh_token(token: str) -> tuple[str, str]:
    """Return (user_id, session_id) from a refresh token.

    Raises `jwt.InvalidTokenError` for anything that is not a valid, unexpired
    refresh token — including access tokens, which carry no `type` claim.
    """
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != REFRESH_TOKEN_TYPE:
        raise jwt.InvalidTokenError("not a refresh token")
    user_id, session_id = payload.get("sub"), payload.get("sid")
    if not user_id or not session_id:
        raise jwt.InvalidTokenError("refresh token is missing session claims")
    return user_id, session_id
