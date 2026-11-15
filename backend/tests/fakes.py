"""In-memory stand-in for `app.db.db`. No Postgres needed."""

import asyncio
from datetime import UTC, datetime
from itertools import count
from types import SimpleNamespace
from unittest.mock import patch

_ids = count(1)


def _matches(record, where: dict) -> bool:
    """Prisma-`where` subset the API actually uses: equality, lt, OR."""
    for key, value in (where or {}).items():
        if key == "OR":
            if not any(_matches(record, cond) for cond in value):
                return False
        elif isinstance(value, dict) and "lt" in value:
            if not getattr(record, key) < value["lt"]:
                return False
        elif getattr(record, key) != value:
            return False
    return True


def _sort(records: list, order: list) -> list:
    """Multi-key sort, applied last key first so Python's stable sort composes."""
    for spec in reversed(order):
        key, direction = next(iter(spec.items()))
        records.sort(
            key=lambda record, name=key: getattr(record, name), reverse=direction == "desc"
        )
    return records


class _Delegate:
    """find/count/delete over a dict of records, shared by every fake model."""

    def __init__(self):
        self.records: dict = {}

    def _all(self):
        return self.records.values()

    def _matching(self, where):
        return [record for record in self._all() if _matches(record, where)]

    async def find_unique(self, where):
        for record in self._all():
            if _matches(record, where):
                return record
        return None

    async def find_many(self, where=None, order=None, take=None):
        records = self._matching(where)
        if order:
            _sort(records, order)
        return records[:take] if take is not None else records

    async def count(self, where=None):
        return len(self._matching(where))

    async def delete_many(self, where=None):
        doomed = [record.id for record in self._matching(where)]
        for record_id in doomed:
            del self.records[record_id]
        return len(doomed)


class FakeUserDelegate(_Delegate):
    async def create(self, data):
        user = SimpleNamespace(
            id=f"user{next(_ids)}",
            name=data["name"],
            email=data["email"],
            password=data["password"],
            createdAt=datetime.now(UTC),
        )
        self.records[user.id] = user
        return user


class FakeSessionDelegate(_Delegate):
    async def create(self, data):
        session = SimpleNamespace(
            id=f"sess{next(_ids)}",
            userId=data["userId"],
            createdAt=datetime.now(UTC),
        )
        self.records[session.id] = session
        return session


class FakeImageDelegate(_Delegate):
    def __init__(self, on_delete=None):
        super().__init__()
        # History rows reference the image; the fake replicates the FK cascade.
        self.on_delete = on_delete

    async def create(self, data):
        image = SimpleNamespace(
            id=f"img{next(_ids)}",
            createdAt=datetime.now(UTC),
            **data,
        )
        self.records[image.id] = image
        return image

    async def delete_many(self, where=None):
        doomed = [record.id for record in self._matching(where)]
        for record_id in doomed:
            del self.records[record_id]
        if self.on_delete:
            self.on_delete(doomed)
        return len(doomed)


class FakeHistoryDelegate(_Delegate):
    async def create(self, data):
        fields = dict(data)  # never mutate the caller's dict
        entry = SimpleNamespace(
            id=f"hist{next(_ids)}",
            # Overridable so tests can seed pages with controlled timestamps.
            createdAt=fields.pop("createdAt", None) or datetime.now(UTC),
            **fields,
        )
        self.records[entry.id] = entry
        return entry


class FakeDB:
    def __init__(self):
        self.user = FakeUserDelegate()
        self.session = FakeSessionDelegate()
        self.historyentry = FakeHistoryDelegate()
        self.image = FakeImageDelegate(on_delete=self._cascade_history)
        self.connected = False

    def _cascade_history(self, image_ids):
        for entry_id, entry in list(self.historyentry.records.items()):
            if entry.imageId in image_ids:
                del self.historyentry.records[entry_id]

    async def connect(self):
        self.connected = True

    async def disconnect(self):
        self.connected = False

    async def query_raw(self, query, *args):
        return [{"?column?": 1}]


def patch_db(test_case, fake=None):
    """Point every module that imported `db` at one FakeDB and return it.

    Also resets rate-limit counters: they are module-level state that would
    otherwise leak between tests.
    """
    from app.api import ask, auth, health, history, images
    from app.core import dependencies, rate_limit

    rate_limit.reset_all()
    fake = fake or FakeDB()
    for module in (ask, auth, health, history, images, dependencies):
        patcher = patch.object(module, "db", fake)
        patcher.start()
        test_case.addCleanup(patcher.stop)
    return fake


def patch_storage(test_case):
    """Store bytes in a per-test temp dir and return it."""
    import os
    import tempfile

    from app.core import storage as storage_module

    tmp = tempfile.TemporaryDirectory()
    test_case.addCleanup(tmp.cleanup)
    patcher = patch.dict(
        os.environ,
        {storage_module.STORAGE_BACKEND_ENV: "local", storage_module.STORAGE_ROOT_ENV: tmp.name},
    )
    patcher.start()
    test_case.addCleanup(patcher.stop)
    return tmp.name


async def seed_history(fake_db, owner_id, image_id, count, prefix="q"):
    """Create `count` history rows directly (no HTTP), strictly increasing
    timestamps so pagination expectations are deterministic."""
    from datetime import timedelta

    base = datetime.now(UTC) - timedelta(minutes=count)
    entries = []
    for index in range(count):
        entries.append(
            await fake_db.historyentry.create(
                {
                    "ownerId": owner_id,
                    "imageId": image_id,
                    "question": f"{prefix}{index}",
                    "answer": f"a{index}",
                    "modelVersion": "fake-1.0",
                    "createdAt": base + timedelta(microseconds=index),
                }
            )
        )
    return entries


def run(coro):
    return asyncio.run(coro)
