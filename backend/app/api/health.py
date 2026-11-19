"""Liveness, readiness and model-status probes (A6/A8). No secrets exposed."""

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.inference import get_inference_service
from app.db import db
from app.schema.health import LiveResponse, ModelStatusResponse, ReadyResponse

logger = logging.getLogger("asksight.api")

router = APIRouter(prefix="/health", tags=["Health"])


def _model_service():
    """The inference service, or None when it cannot be loaded right now."""
    # shortcut: a failed load is retried on each probe, so a fixed checkpoint
    # recovers without a restart but probes can be slow while it stays broken.
    try:
        return get_inference_service()
    except Exception:
        # Logged at check time; the probe response must not leak paths/errors.
        logger.exception("model_status_check_failed")
        return None


def _model_check() -> str:
    service = _model_service()
    if service is None or not getattr(service, "ready", True):
        return "unavailable"
    return "ok"


@router.get("", response_model=LiveResponse, include_in_schema=False)
@router.get("/live", response_model=LiveResponse)
async def live():
    """Process is up. Touches nothing, so it stays green during an outage."""
    return {"status": "ok"}


@router.get("/ready", response_model=ReadyResponse)
async def ready():
    """Database reachable and model ready. Reports pass/fail only."""
    checks = {"database": "ok", "model": _model_check()}
    try:
        await db.query_raw("SELECT 1")
    except Exception:
        checks["database"] = "unavailable"

    healthy = all(state == "ok" for state in checks.values())
    body = {"status": "ok" if healthy else "unavailable", "checks": checks}
    return body if healthy else JSONResponse(status_code=503, content=body)


@router.get("/model", response_model=ModelStatusResponse)
async def model_status():
    """Operational view of the inference service: version, readiness, stats."""
    service = _model_service()
    if service is None:
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "ready": False, "stats": {}},
        )

    ready = bool(getattr(service, "ready", True))
    stats = getattr(service, "stats", None)
    body = {
        "status": "ok" if ready else "unavailable",
        "ready": ready,
        "model_version": getattr(service, "model_version", None),
        "stats": stats() if callable(stats) else {},
    }
    return body if ready else JSONResponse(status_code=503, content=body)
