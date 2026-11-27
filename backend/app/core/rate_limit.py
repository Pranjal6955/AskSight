"""In-memory sliding-window rate limits for sensitive endpoints (A6).

Counters live in this process: limits reset on restart and do not span
multiple workers. Good enough for a single uvicorn process; move to shared
storage (e.g. Redis) if the API ever runs with several workers or hosts.
"""

import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, status

from app.core.dependencies import get_current_user

RATE_LIMITED = "Too many requests. Please wait a moment and try again."

# Stale keys are only swept when the table grows large — bounded per-key
# memory without walking every key on every request.
_SWEEP_AT = 10_000


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        if len(self._hits) >= _SWEEP_AT:
            self._sweep(now)
        hits = self._hits[key]
        cutoff = now - self.window
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True

    def _sweep(self, now: float) -> None:
        cutoff = now - self.window
        for key, hits in list(self._hits.items()):
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if not hits:
                del self._hits[key]

    def reset(self) -> None:
        self._hits.clear()


# Password-checking endpoints: brute-force shield, keyed by client IP.
auth_limiter = RateLimiter(limit=10, window_seconds=60)
# Interactive usage: one photo plus a few questions a minute, keyed by user.
user_limiter = RateLimiter(limit=30, window_seconds=60)


def reset_all() -> None:
    """Clear every counter. Tests call this; nothing else needs it."""
    auth_limiter.reset()
    user_limiter.reset()


async def per_ip(request: Request) -> None:
    host = request.client.host if request.client else "unknown"
    if not auth_limiter.allow(f"ip:{host}"):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=RATE_LIMITED)


async def per_user(current_user=Depends(get_current_user)) -> None:
    if not user_limiter.allow(f"user:{current_user.id}"):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=RATE_LIMITED)
