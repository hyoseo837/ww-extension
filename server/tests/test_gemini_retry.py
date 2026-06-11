"""One-retry-on-transient-failure behaviour of the Gemini POST helper
(v8.10, audit #7). Uses httpx.MockTransport — no network, no DB."""

import httpx
import pytest

from app.scoring import gemini


@pytest.fixture(autouse=True)
def _no_backoff(monkeypatch):
    monkeypatch.setattr(gemini, "_RETRY_BACKOFF_S", 0)


def _client_returning(*responses):
    """An AsyncClient whose transport pops one canned response per request."""
    queue = list(responses)
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    return httpx.AsyncClient(transport=httpx.MockTransport(handler)), calls


def test_transient_classification():
    assert gemini._transient(429)
    assert gemini._transient(500)
    assert gemini._transient(503)
    assert not gemini._transient(400)
    assert not gemini._transient(404)


async def test_retries_once_on_503(monkeypatch):
    client, calls = _client_returning(
        httpx.Response(503), httpx.Response(200, json={"ok": True})
    )
    monkeypatch.setattr(gemini, "_client", client)
    res = await gemini._post_gemini("https://test.invalid/x", {})
    assert res.status_code == 200
    assert len(calls) == 2


async def test_retries_once_on_network_error(monkeypatch):
    client, calls = _client_returning(
        httpx.ConnectError("boom"), httpx.Response(200, json={"ok": True})
    )
    monkeypatch.setattr(gemini, "_client", client)
    res = await gemini._post_gemini("https://test.invalid/x", {})
    assert res.status_code == 200
    assert len(calls) == 2


async def test_second_failure_raises(monkeypatch):
    client, calls = _client_returning(httpx.Response(503), httpx.Response(503))
    monkeypatch.setattr(gemini, "_client", client)
    with pytest.raises(gemini.GeminiError) as exc:
        await gemini._post_gemini("https://test.invalid/x", {})
    assert exc.value.status_code == 503
    assert len(calls) == 2


async def test_no_retry_on_plain_4xx(monkeypatch):
    client, calls = _client_returning(httpx.Response(400, text="bad request"))
    monkeypatch.setattr(gemini, "_client", client)
    with pytest.raises(gemini.GeminiError):
        await gemini._post_gemini("https://test.invalid/x", {})
    assert len(calls) == 1
