"""Async Gemini REST client.

Single httpx.AsyncClient is opened/closed by the FastAPI lifespan so
HTTP/2 and connection pooling are reused across scans.

The model-facing prompts and response schemas live in `prompts.py`
(server-side, so they never ship to end users in the Web Store zip); this
module is the transport + serialization + parsing/validation logic.
"""

import json

import httpx

from app.billing.pricing import (
    DEFAULT_EXTRACT_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_OUTPUT_TOKENS,
)
from app.core.config import settings
from app.scoring.prompts import (
    PROFILE_EXTRACT_PROMPT,
    PROFILE_SCHEMA,
    RESPONSE_SCHEMA,
    SYSTEM_TEXT,
)

_client: httpx.AsyncClient | None = None

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

# Sampling temperatures. Scan wants a little variety; extract must be
# deterministic so the same PDF yields the same text.
_SCORE_TEMPERATURE = 0.2
_EXTRACT_TEMPERATURE = 0.0

# Verdict ladder over the 1–20 score (ADR 0017). The model returns the score
# and an `excluded` flag, not the verdict — the server owns the verdict so it
# can never disagree with the score.
_VERDICT_BANDS = (
    (17, "Strong Apply"),
    (14, "Apply"),
    (10, "Consider"),
    (6,  "Unlikely"),
    (0,  "Skip"),
)


def verdict_for(score: int, excluded: bool = False) -> str:
    """Server-owned verdict (ADR 0017). A hard exclusion overrides the score
    bands; otherwise the score's band applies."""
    if excluded:
        return "Excluded"
    for floor, verdict in _VERDICT_BANDS:
        if score >= floor:
            return verdict
    return "Skip"


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


# Human-readable labels for the criteria-v2 fact block (ADR 0041).
# Deterministic serialization only — importance is not annotated here; the
# model infers it from the candidate's notes.
_AUTH_LABELS = {
    "citizen": "Canadian citizen",
    "pr": "permanent resident",
    "international": "international student (study permit)",
    "other": "other",
}
_FACT_LABELS = {
    "locations": "Locations",
    "work_modes": "Work modes",
    "target_term": "Target term",
    "term_lengths": "Term lengths",
    "languages": "Languages",
}


def _format_criteria(match_criteria: dict) -> str:
    """Serialize populated facts into a short labelled block. Only non-empty
    fields appear, so empty criteria emit nothing."""
    lines: list[str] = []
    auth = match_criteria.get("work_authorization")
    if auth:
        lines.append(f"Work authorization: {_AUTH_LABELS.get(auth, auth)}")
    for field, label in _FACT_LABELS.items():
        v = match_criteria.get(field)
        if isinstance(v, str):
            if v:
                lines.append(f"{label}: {v}")
        elif isinstance(v, list) and v:
            lines.append(f"{label}: {', '.join(str(x) for x in v)}")
    return "\n".join(lines)


def build_job_part(
    meta: dict,
    description_text: str,
    preferences: str,
    match_criteria: dict | None = None,
) -> str:
    blocks: list[str] = []
    criteria = _format_criteria(match_criteria) if match_criteria else ""
    if criteria:
        blocks.append(f"Candidate Match Criteria:\n{criteria}")
    if preferences:
        blocks.append(f"Additional Notes:\n{preferences}")
    prefix = "\n\n".join(blocks) + "\n\n" if blocks else ""
    title = meta.get("title", "")
    org = meta.get("org", "")
    return f"{prefix}Job: {title} at {org}\nDescription:\n{description_text}"


def _join(values: list) -> str:
    return ", ".join(str(v) for v in values if v)


def _serialize_profile_json(p: dict) -> str:
    """Render the structured profile into a readable block for the scorer.
    Only non-empty sections appear."""
    lines: list[str] = []
    if p.get("summary"):
        lines.append(f"Summary: {p['summary']}")
    for e in p.get("education") or []:
        head = _join([e.get("credential"), e.get("field")])
        tail = _join([e.get("institution"), e.get("dates"), e.get("grade")])
        edu = " — ".join(s for s in [head, tail] if s)
        if edu:
            lines.append(f"Education: {edu}")
    for x in p.get("experience") or []:
        head = _join([x.get("title"), x.get("org"), x.get("dates")])
        line = f"Experience: {head}" if head else "Experience:"
        if x.get("description"):
            line += f" — {x['description']}"
        if head or x.get("description"):
            lines.append(line)
    if p.get("skills"):
        lines.append(f"Skills: {_join(p['skills'])}")
    for pr in p.get("projects") or []:
        line = f"Project: {pr.get('title', '')}".rstrip()
        if pr.get("description"):
            line += f" — {pr['description']}"
        if pr.get("title") or pr.get("description"):
            lines.append(line)
    if p.get("languages"):
        lines.append(f"Languages: {_join(p['languages'])}")
    # Raw-text sections from the package's other documents (v5.1.6).
    for key, label in (
        ("grade_report", "Grade Report"),
        ("coop_history", "Co-op Work History"),
        ("cover_letter", "Cover Letter"),
    ):
        if p.get(key):
            lines.append(f"{label}:\n{p[key]}")
    return "\n".join(lines)


def _serialize_supplement(entries: list) -> str:
    """User-authored entries, kept distinct so the model sees them as
    self-reported rather than resume-extracted."""
    lines = []
    for e in entries:
        label = "Project" if e.get("kind") == "project" else "Experience"
        title = e.get("title", "")
        desc = e.get("description", "")
        body = " — ".join(s for s in [title, desc] if s)
        if body:
            lines.append(f"{label}: {body}")
    if not lines:
        return ""
    return "Additional (self-reported):\n" + "\n".join(lines)


def build_profile_context(
    profile_json: dict | None, supplement: list | None, cv_text: str
) -> str:
    """The "Candidate Profile" text passed to the scorer. Uses the structured
    profile when present (ADR 0015), else falls back to the legacy cv_text
    blob; self-reported supplement entries are always appended."""
    parts: list[str] = []
    serialized = _serialize_profile_json(profile_json) if profile_json else ""
    if serialized:
        parts.append(serialized)
    elif cv_text and cv_text.strip():
        parts.append(cv_text.strip())
    if supplement:
        sup = _serialize_supplement(supplement)
        if sup:
            parts.append(sup)
    return "\n\n".join(parts)


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
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
) -> tuple[dict, dict]:
    """Score one job. Returns (parsed_result, usage_metadata).

    parsed_result is {"score", "reason", "breakdown", "excluded"} (the caller
    derives "verdict"); usage_metadata is Gemini's raw usageMetadata dict so the
    caller can compute actual cost.
    """
    client = _require_client()
    url = f"{_GEMINI_BASE}/models/{model}:generateContent"

    generation_config = {
        "temperature": _SCORE_TEMPERATURE,
        "maxOutputTokens": max_output_tokens,
        "thinkingConfig": {"thinkingBudget": 0},
        "responseMimeType": "application/json",
        "responseSchema": RESPONSE_SCHEMA,
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

    parsed.setdefault("breakdown", [])   # always present for the caller
    parsed.setdefault("excluded", False)
    return parsed, usage


async def extract_profile(
    model: str,
    pdf_b64: str,
    max_output_tokens: int = DEFAULT_EXTRACT_MAX_OUTPUT_TOKENS,
) -> tuple[dict, dict]:
    """Extract a structured profile from a PDF via Gemini multimodal.
    Returns (profile_dict, usage)."""
    client = _require_client()
    url = f"{_GEMINI_BASE}/models/{model}:generateContent"
    body = {
        "contents": [
            {
                "parts": [
                    {"text": PROFILE_EXTRACT_PROMPT},
                    {"inline_data": {"mime_type": "application/pdf", "data": pdf_b64}},
                ]
            }
        ],
        "generationConfig": {
            "temperature": _EXTRACT_TEMPERATURE,
            "maxOutputTokens": max_output_tokens,
            "thinkingConfig": {"thinkingBudget": 0},
            "responseMimeType": "application/json",
            "responseSchema": PROFILE_SCHEMA,
        },
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
        profile = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise GeminiError(f"parse: {exc}; raw: {raw_text[:120]}") from exc
    if not isinstance(profile, dict) or not any(profile.values()):
        raise GeminiError("empty extract result")
    return profile, usage


def _valid_result(p: object) -> bool:
    if not isinstance(p, dict):
        return False
    score = p.get("score")
    reason = p.get("reason")
    if not isinstance(score, int) or not 1 <= score <= 20:
        return False
    if not isinstance(reason, str) or not reason.strip():
        return False
    if not isinstance(p.get("excluded", False), bool):
        return False
    breakdown = p.get("breakdown", [])
    if not isinstance(breakdown, list):
        return False
    for item in breakdown:
        if not isinstance(item, dict):
            return False
        if not isinstance(item.get("point"), str) or not item["point"].strip():
            return False
        if item.get("effect") not in {"plus", "minus"}:
            return False
    return True
