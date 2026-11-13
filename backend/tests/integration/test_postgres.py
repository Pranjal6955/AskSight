"""Fresh-Postgres proof: the init migration applies and the queries work.

Spins up a throwaway Postgres container, runs `prisma migrate deploy`
against the empty database, then exercises the exact query shapes the API
uses (keyset pagination, ownership counts, delete_many return values, FK
cascades). Skips when Docker is unavailable — it runs in CI.
"""

import asyncio
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

import pytest

BACKEND = Path(__file__).resolve().parents[2]
POSTGRES_PASSWORD = "bench"
POSTGRES_DB = "asksight"
STARTUP_TIMEOUT_SECONDS = 60

docker = shutil.which("docker")

requires_docker = pytest.mark.skipif(docker is None, reason="docker not available")


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_postgres(container: str) -> None:
    # Not a bare TCP probe: docker-proxy binds the host port before Postgres
    # finishes initdb, so an open socket is a false positive (P1001 later).
    # pg_isready inside the container only exits 0 once the server answers.
    deadline = time.time() + STARTUP_TIMEOUT_SECONDS
    while time.time() < deadline:
        probe = subprocess.run(
            [docker, "exec", container, "pg_isready", "-U", "postgres", "-d", POSTGRES_DB],
            capture_output=True,
        )
        if probe.returncode == 0:
            return
        time.sleep(0.25)
    pytest.fail("postgres container never became ready")


@pytest.fixture(scope="module")
def fresh_database():
    """Yield a DATABASE_URL for an empty Postgres with the migration applied."""
    if subprocess.run([docker, "info"], capture_output=True).returncode != 0:
        pytest.skip("docker daemon not available")

    port = free_port()
    container = subprocess.run(
        [
            docker,
            "run",
            "--rm",
            "-d",
            "-e",
            f"POSTGRES_PASSWORD={POSTGRES_PASSWORD}",
            "-e",
            f"POSTGRES_DB={POSTGRES_DB}",
            "-p",
            f"127.0.0.1:{port}:5432",
            "postgres:16-alpine",
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    url = f"postgresql://postgres:{POSTGRES_PASSWORD}@127.0.0.1:{port}/{POSTGRES_DB}"

    previous_url = os.environ.get("DATABASE_URL")
    try:
        wait_for_postgres(container)

        # Fresh database: an empty schema plus this repo's migrations.
        prisma = Path(sys.executable).parent / "prisma"
        deploy = subprocess.run(
            [str(prisma), "migrate", "deploy"],
            cwd=BACKEND,
            env={**os.environ, "DATABASE_URL": url},
            capture_output=True,
            text=True,
        )
        assert deploy.returncode == 0, (
            f"prisma migrate deploy failed on a fresh database:\n{deploy.stdout}\n{deploy.stderr}"
        )

        os.environ["DATABASE_URL"] = url
        yield url
        if previous_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_url
    finally:
        subprocess.run([docker, "rm", "-f", container], capture_output=True)


async def exercise_api_queries() -> None:
    from app.db import db

    await db.connect()
    try:
        user = await db.user.create(
            data={"name": "It", "email": f"it-{uuid4().hex[:8]}@example.com", "password": "x"}
        )
        session = await db.session.create(data={"userId": user.id})
        storage_key = f"{uuid4().hex}.png"
        image = await db.image.create(
            data={
                "ownerId": user.id,
                "storageKey": storage_key,
                "mimeType": "image/png",
                "sizeBytes": 3,
                "width": 1,
                "height": 1,
            }
        )
        for question in ("q1", "q2"):
            await db.historyentry.create(
                data={
                    "ownerId": user.id,
                    "imageId": image.id,
                    "question": question,
                    "answer": "a",
                    "modelVersion": "m",
                }
            )

        # The exact shapes GET /history uses: keyset order and cursor filter.
        page = await db.historyentry.find_many(
            where={"ownerId": user.id},
            order=[{"createdAt": "desc"}, {"id": "desc"}],
            take=3,
        )
        assert [entry.question for entry in page] == ["q2", "q1"]
        cursor = page[-1]
        older = await db.historyentry.find_many(
            where={
                "ownerId": user.id,
                "OR": [
                    {"createdAt": {"lt": cursor.createdAt}},
                    {"createdAt": cursor.createdAt, "id": {"lt": cursor.id}},
                ],
            },
            order=[{"createdAt": "desc"}, {"id": "desc"}],
            take=2,
        )
        assert [entry.question for entry in older] == ["q1"]

        # Ownership counts (used by last-entry cleanup) and auth rotation
        # both rely on delete_many returning the number of rows removed.
        assert await db.historyentry.count(where={"ownerId": user.id}) == 2
        assert await db.session.delete_many(where={"id": session.id, "userId": user.id}) == 1
        assert await db.session.delete_many(where={"id": session.id, "userId": user.id}) == 0

        # Opaque storage keys are unique.
        try:
            await db.image.create(
                data={
                    "ownerId": user.id,
                    "storageKey": storage_key,
                    "mimeType": "image/png",
                    "sizeBytes": 3,
                    "width": 1,
                    "height": 1,
                }
            )
        except Exception:
            pass
        else:
            raise AssertionError("duplicate storageKey was accepted by the database")

        # The readiness probe's query.
        await db.query_raw("SELECT 1")

        # Deleting the user cascades to sessions, images, and history.
        assert await db.user.delete_many(where={"id": user.id}) == 1
        assert await db.session.count() == 0
        assert await db.image.count() == 0
        assert await db.historyentry.count() == 0
    finally:
        await db.disconnect()


@requires_docker
def test_fresh_database_migrates_and_serves_the_api_queries(fresh_database):
    asyncio.run(exercise_api_queries())
