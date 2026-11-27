"""Self-checks for the bench script's pure helpers (no server needed)."""

from app.core.images import decode_image
from scripts.bench import percentile, png_bytes, summarize


def test_summarize_reports_nearest_rank_percentiles():
    stats = summarize([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0])
    assert stats == {"n": 10, "mean": 5.5, "p50": 5.0, "p95": 10.0, "max": 10.0}


def test_summarize_works_on_a_single_sample():
    assert summarize([42.0]) == {"n": 1, "mean": 42.0, "p50": 42.0, "p95": 42.0, "max": 42.0}


def test_percentile_is_clamped_at_both_ends():
    samples = [1.0, 2.0, 3.0]  # pre-sorted, as summarize() guarantees
    assert percentile(samples, 0.0) == 1.0
    assert percentile(samples, 1.0) == 3.0


def test_png_bytes_are_a_real_png():
    image, mime_type, width, height = decode_image(png_bytes())
    assert mime_type == "image/png"
    assert (width, height) == (64, 64)
