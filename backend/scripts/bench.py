"""End-to-end latency probe against a running AskSight server.

Usage:
    python scripts/bench.py --base-url http://127.0.0.1:8000 --runs 10

Signs up its own throwaway user, times upload / ask / history, prints
mean/p50/p95/max per endpoint in milliseconds, and deletes the data it
created. Keep --runs at 15 or below: the per-user limit is 30/minute and
each run spends two of those (one upload, one ask).
"""

import argparse
import io
import math
import statistics
import time
from uuid import uuid4

import httpx
from PIL import Image


def png_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), color="red").save(buffer, format="PNG")
    return buffer.getvalue()


def percentile(ordered: list[float], quantile: float) -> float:
    """Nearest-rank percentile on a pre-sorted list."""
    index = max(0, math.ceil(quantile * len(ordered)) - 1)
    return ordered[min(index, len(ordered) - 1)]


def summarize(samples: list[float]) -> dict:
    ordered = sorted(samples)
    return {
        "n": len(ordered),
        "mean": round(statistics.fmean(ordered), 1),
        "p50": round(percentile(ordered, 0.50), 1),
        "p95": round(percentile(ordered, 0.95), 1),
        "max": round(ordered[-1], 1),
    }


def timed(client: httpx.Client, method: str, url: str, **kwargs) -> tuple[httpx.Response, float]:
    started = time.perf_counter()
    response = client.request(method, url, **kwargs)
    response.raise_for_status()
    return response, (time.perf_counter() - started) * 1000


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--runs", type=int, default=10)
    args = parser.parse_args()

    timings: dict[str, list[float]] = {"upload": [], "ask": [], "history": []}
    with httpx.Client(base_url=args.base_url, timeout=60.0) as client:
        email = f"bench-{uuid4().hex[:12]}@example.com"
        password = "bench-password-1"
        client.post("/auth/signup", json={"name": "Bench", "email": email, "password": password})
        login = client.post("/auth/login", json={"email": email, "password": password})
        login.raise_for_status()
        client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"

        try:
            for _ in range(args.runs):
                upload, ms = timed(
                    client,
                    "POST",
                    "/images",
                    files={"file": ("bench.png", png_bytes(), "image/png")},
                )
                timings["upload"].append(ms)

                image_id = upload.json()["id"]
                _, ms = timed(
                    client,
                    "POST",
                    "/ask",
                    json={"image_id": image_id, "question": "What color is this image?"},
                )
                timings["ask"].append(ms)

                _, ms = timed(client, "GET", "/history", params={"limit": 20})
                timings["history"].append(ms)
        finally:
            # Best-effort cleanup of everything this run created.
            client.delete("/history")

    print(f"{'endpoint':<10} {'n':>4} {'mean':>9} {'p50':>9} {'p95':>9} {'max':>9}  (ms)")
    for name, samples in timings.items():
        stats = summarize(samples)
        print(
            f"{name:<10} {stats['n']:>4} {stats['mean']:>9} {stats['p50']:>9}"
            f" {stats['p95']:>9} {stats['max']:>9}"
        )


if __name__ == "__main__":
    main()
