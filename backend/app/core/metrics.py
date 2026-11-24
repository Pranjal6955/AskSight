"""Prometheus collectors shared by request logging and the /metrics route."""

from prometheus_client import Counter, Gauge, Histogram

# Route templates, not raw paths: user ids and image ids must not become labels.
HTTP_REQUESTS = Counter(
    "asksight_http_requests_total", "HTTP requests", ["method", "route", "status"]
)
HTTP_DURATION = Histogram(
    "asksight_http_request_duration_seconds", "HTTP request duration", ["method", "route"]
)

MODEL_READY = Gauge("asksight_model_ready", "Whether the inference service is ready")
MODEL_REQUESTS = Gauge("asksight_model_requests", "Inference requests handled")
MODEL_FAILURES = Gauge("asksight_model_failures", "Inference failures")
MODEL_TIMEOUTS = Gauge("asksight_model_timeouts", "Inference queue timeouts")
MODEL_LATENCY_P95 = Gauge("asksight_model_latency_p95_seconds", "Inference latency p95")
MODEL_RSS_MB = Gauge("asksight_model_process_rss_mb", "Process resident memory in MB")
