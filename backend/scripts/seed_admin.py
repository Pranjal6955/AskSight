"""Create or reset the admin dashboard account.

Usage (from backend/):
    python -m scripts.seed_admin [email] [password]

Defaults to pranjal@admin.com / admin12345. Running it again resets that
account's password, so the documented credentials always work. This is for
local development: pass a stronger password before exposing the API.
"""

import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()

from app.core.security import hash_password  # noqa: E402
from app.db import db  # noqa: E402

DEFAULT_EMAIL = "pranjal@admin.com"
DEFAULT_PASSWORD = "admin12345"


async def seed(email: str, password: str) -> str:
    hashed = hash_password(password)
    user = await db.user.upsert(
        where={"email": email},
        data={
            "create": {"name": "Admin", "email": email, "password": hashed},
            "update": {"name": "Admin", "password": hashed},
        },
    )
    return user.email


async def main() -> None:
    email = sys.argv[1] if len(sys.argv) > 1 else os.getenv("ADMIN_EMAIL", DEFAULT_EMAIL)
    password = sys.argv[2] if len(sys.argv) > 2 else os.getenv("ADMIN_PASSWORD", DEFAULT_PASSWORD)
    email = email.strip().lower()

    await db.connect()
    try:
        stored = await seed(email, password)
        print(f"Admin account ready: {stored}")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
