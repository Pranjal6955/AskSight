"""Create or reset the admin dashboard account.

Usage (from backend/):
    python -m scripts.seed_admin [email] <password>

The password is required: no usable default ships with the code. Running it
again resets that account's password. The account gets the ADMIN role, so it
can open /admin without any extra configuration.
"""

import asyncio
import os
import sys

from dotenv import load_dotenv
from prisma.enums import Role

load_dotenv()

from app.core.security import hash_password  # noqa: E402
from app.db import db  # noqa: E402

DEFAULT_EMAIL = "pranjal@admin.com"


async def seed(email: str, password: str) -> str:
    hashed = hash_password(password)
    user = await db.user.upsert(
        where={"email": email},
        data={
            "create": {"name": "Admin", "email": email, "password": hashed, "role": Role.ADMIN},
            "update": {"name": "Admin", "password": hashed, "role": Role.ADMIN},
        },
    )
    return user.email


async def main() -> None:
    email = sys.argv[1] if len(sys.argv) > 1 else os.getenv("ADMIN_EMAIL", DEFAULT_EMAIL)
    password = sys.argv[2] if len(sys.argv) > 2 else os.getenv("ADMIN_PASSWORD", "")
    if not password:
        raise SystemExit("Pass an admin password as the second argument or set ADMIN_PASSWORD.")
    email = email.strip().lower()

    await db.connect()
    try:
        stored = await seed(email, password)
        print(f"Admin account ready: {stored}")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
