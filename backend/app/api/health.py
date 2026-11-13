"""Liveness and readiness probes (A6/A8). Unauthenticated, no secrets."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db import db
from app.schema.health import LiveResponse, ReadyResponse

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/live", response_model=LiveResponse)
async def live():
    """Process is up. Touches nothing, so it stays green during an outage."""
    return {"status": "ok"}


@router.get("/ready", response_model=ReadyResponse)
async def ready():
    """Database reachable. Reports pass/fail only — never the DSN or errors."""
    try:
        await db.query_raw("SELECT 1")
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "checks": {"database": "unavailable"}},
        )
    return {"status": "ok", "checks": {"database": "ok"}}
