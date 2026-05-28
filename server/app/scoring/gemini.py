"""Async Gemini REST client.

Single httpx.AsyncClient is opened/closed by the FastAPI lifespan so
HTTP/2 and connection pooling are reused across scans.

System prompt + response schema live here (server-side) so they don't
ship to end users in the Web Store zip.
"""

import json

import httpx

from app.core.config import settings

_client: httpx.AsyncClient | None = None

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

SYSTEM_TEXT = """You are a job-fit scorer. Score how well the candidate fits the job.

score: 1–10 (10 = perfect fit)
verdict: Apply if strong fit, Consider if marginal, Skip if poor fit
reason: 2–3 sentences explaining the score"""

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "score":   {"type": "integer"},
        "verdict": {"type": "string", "enum": ["Apply", "Consider", "Skip"]},
        "reason":  {"type": "string"},
    },
    "required": ["score", "verdict", "reason"],
}


async def init_client() -> None:
    global _client
    _client = httpx.AsyncClient(
        http2=True,
        timeout=httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0),
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
    )


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _require_client() -> httpx.AsyncClient:
    if _client is None:
        raise RuntimeError("httpx client not initialized")
    return _client


def build_job_part(meta: dict, description_text: str, preferences: str) -> str:
    prefs = f"Candidate Preferences:\n{preferences}\n\n" if preferences else ""
    title = meta.get("title", "")
    org = meta.get("org", "")
    return f"{prefs}Job: {title} at {org}\nDescription:\n{description_text}"


class GeminiError(Exception):
    """Raised when Gemini returns a non-2xx or an unparseable response."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


async def score(
    model: str,
    cv_text: str,
    job_part: str,
    cache_name: str | None = None,
    max_output_tokens: int = 1024,
) -> tuple[dict, dict]:
    """Score one job. Returns (parsed_result, usage_metadata).

    parsed_result is {"score", "verdict", "reason"}; usage_metadata is
    Gemini's raw usageMetadata dict so the caller can compute actual cost.
    """
    client = _require_client()
    url = f"{_GEMINI_BASE}/models/{model}:generateContent"

    generation_config = {
        "temperature": 0.2,
        "maxOutputTokens": max_output_tokens,
        "thinkingConfig": {"thinkingBudget": 0},
        "responseMimeType": "application/json",
        "responseSchema": _RESPONSE_SCHEMA,
    }

    if cache_name:
        body = {
            "cachedContent": cache_name,
            "contents": [{"role": "user", "parts": [{"text": job_part}]}],
            "generationConfig": generation_config,
        }
    else:
        body = {
            "systemInstruction": {"parts": [{"text": SYSTEM_TEXT}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"Candidate Profile:\n{cv_text}\n\n{job_part}"}],
                }
            ],
            "generationConfig": generation_config,
        }

    try:
        res = await client.post(
            url,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": settings.gemini_api_key,
            },
            json=body,
        )
    except httpx.HTTPError as exc:
        raise GeminiError(f"network: {exc}") from exc

    if res.status_code >= 400:
        snippet = res.text[:200] if res.text else ""
        raise GeminiError(
            f"http {res.status_code}: {snippet}", status_code=res.status_code
        )

    data = res.json()
    usage = data.get("usageMetadata", {}) or {}

    try:
        raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise GeminiError(f"unexpected response shape: {exc}") from exc

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise GeminiError(f"parse: {exc}; raw: {raw_text[:120]}") from exc

    if not _valid_result(parsed):
        raise GeminiError(f"invalid result shape: {str(parsed)[:120]}")

    return parsed, usage


def _valid_result(p: object) -> bool:
    if not isinstance(p, dict):
        return False
    score = p.get("score")
    verdict = p.get("verdict")
    reason = p.get("reason")
    if not isinstance(score, int) or not 1 <= score <= 10:
        return False
    if verdict not in {"Apply", "Consider", "Skip"}:
        return False
    if not isinstance(reason, str) or not reason.strip():
        return False
    return True
