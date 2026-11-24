"""Prometheus scrape endpoint. Keep it on an internal network: no auth here."""

from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.core import metrics
from app.core.inference import cached_service

router = APIRouter(tags=["Metrics"])

_MODEL_GAUGES = (
    (metrics.MODEL_REQUESTS, "requests"),
    (metrics.MODEL_FAILURES, "failures"),
    (metrics.MODEL_TIMEOUTS, "timeouts"),
    (metrics.MODEL_LATENCY_P95, "latency_p95_s"),
    (metrics.MODEL_RSS_MB, "process_rss_mb"),
)


@router.get("/metrics", include_in_schema=False)
async def prometheus_metrics():
    service = cached_service()
    stats = (
        service.stats() if service is not None and callable(getattr(service, "stats", None)) else {}
    )
    metrics.MODEL_READY.set(int(bool(stats.get("ready", False))))
    for gauge, key in _MODEL_GAUGES:
        value = stats.get(key)
        if isinstance(value, (int, float)):
            gauge.set(value)
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
