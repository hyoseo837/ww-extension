"""Fixed-window rate limiter (v8.10, audit #6). Pure logic — no DB."""

import pytest
from fastapi import HTTPException

from app.core import ratelimit


@pytest.fixture(autouse=True)
def _clean_windows():
    ratelimit._windows.clear()
    yield
    ratelimit._windows.clear()


def test_allows_up_to_limit():
    for _ in range(3):
        ratelimit.check("ep", "u1", limit=3, now=100.0)


def test_rejects_past_limit():
    for _ in range(3):
        ratelimit.check("ep", "u1", limit=3, now=100.0)
    with pytest.raises(HTTPException) as exc:
        ratelimit.check("ep", "u1", limit=3, now=100.0)
    assert exc.value.status_code == 429


def test_window_resets():
    for _ in range(3):
        ratelimit.check("ep", "u1", limit=3, now=100.0)
    ratelimit.check("ep", "u1", limit=3, now=160.0)  # next window — allowed


def test_users_are_independent():
    for _ in range(3):
        ratelimit.check("ep", "u1", limit=3, now=100.0)
    ratelimit.check("ep", "u2", limit=3, now=100.0)  # other user unaffected


def test_endpoints_are_independent():
    for _ in range(3):
        ratelimit.check("checkout", "u1", limit=3, now=100.0)
    ratelimit.check("export", "u1", limit=3, now=100.0)
