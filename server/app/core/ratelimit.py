"""Per-user fixed-window rate limiting (v8.10, audit #6).

In-memory and per-process — correct for the single-instance DO deployment
(spec v8.10.0 Notes); counters reset on deploy. Each limited endpoint calls
check() with its own name and budget.
"""

import time

from fastapi import HTTPException

# (endpoint name, user_id) → (window_start, count)
_windows: dict[tuple[str, str], tuple[float, int]] = {}


def check(
    name: str,
    user_id: str,
    *,
    limit: int,
    window_s: int = 60,
    now: float | None = None,
) -> None:
    """Count one call; raise 429 once user_id exceeds limit per window."""
    t = time.monotonic() if now is None else now
    key = (name, user_id)
    start, count = _windows.get(key, (t, 0))
    if t - start >= window_s:
        start, count = t, 0
    if count >= limit:
        raise HTTPException(status_code=429, detail="rate_limited")
    _windows[key] = (start, count + 1)
