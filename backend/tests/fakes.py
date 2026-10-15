"""In-memory stand-in for `app.db.db`. No Postgres needed."""

from datetime import UTC, datetime
from itertools import count
from types import SimpleNamespace

_ids = count(1)


class FakeUserDelegate:
    def __init__(self):
        self.users = {}

    async def find_unique(self, where):
        uid, email = where.get("id"), where.get("email")
        for user in self.users.values():
            if uid is not None and user.id == uid:
                return user
            if email is not None and user.email == email:
                return user
        return None

    async def create(self, data):
        user = SimpleNamespace(
            id=f"user{next(_ids)}",
            name=data["name"],
            email=data["email"],
            password=data["password"],
            createdAt=datetime.now(UTC),
        )
        self.users[user.id] = user
        return user


class FakeDB:
    def __init__(self):
        self.user = FakeUserDelegate()
        self.connected = False

    async def connect(self):
        self.connected = True

    async def disconnect(self):
        self.connected = False
