import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    # Not used as a context manager on purpose: entering it would run the
    # FastAPI lifespan and attempt `prisma.connect()`, which needs a real
    # database. Plain requests skip the lifespan entirely.
    return TestClient(app)
