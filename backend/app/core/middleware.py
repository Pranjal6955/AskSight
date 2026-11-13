"""Request IDs and structured access logs (A1).

Every response carries `X-Request-ID`, and every request produces one JSON
line on the `asksight` loggers. Lines hold the method, path, status and
duration only — never headers, query strings or bodies, so tokens and user
content cannot reach the logs.
"""

import json
import logging
import os
import re
import time
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime

# A client-supplied id is echoed only when it is short and printable, so a
# hostile header cannot inject newlines or control characters into a log line.
SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

request_id_var: ContextVar[str] = ContextVar("request_id", default="")

logger = logging.getLogger("asksight.access")


def setup_logging() -> None:
    """Send JSON log lines from the `asksight` tree to stderr."""
    root = logging.getLogger("asksight")
    root.setLevel(os.getenv("ASKSIGHT_LOG_LEVEL", "INFO").upper())
    root.propagate = False  # the root logger would print each line twice
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        root.addHandler(handler)


def get_request_id() -> str:
    """The id of the request being handled right now (empty outside a request)."""
    return request_id_var.get()


def _client_request_id(scope) -> str | None:
    for name, value in scope["headers"]:
        if name == b"x-request-id":
            candidate = value.decode("latin-1")
            if SAFE_REQUEST_ID.match(candidate):
                return candidate
            return None  # hostile or oversized: replace rather than echo
    return None


class RequestContextMiddleware:
    """Stamps each request with an id and logs one JSON line when it finishes."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _client_request_id(scope) or str(uuid.uuid4())
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status_code = 500  # overwritten when the response starts; 500 if it never does

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                message["headers"] = [
                    *message.get("headers", []),
                    (b"x-request-id", request_id.encode()),
                ]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            logger.info(
                json.dumps(
                    {
                        "ts": datetime.now(UTC).isoformat(),
                        "request_id": request_id,
                        "method": scope["method"],
                        "path": scope["path"],
                        "status": status_code,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    },
                    separators=(",", ":"),
                )
            )
            request_id_var.reset(token)
