"""Async Gemini REST client.

Single httpx.AsyncClient is opened/closed by the FastAPI lifespan so
HTTP/2 and connection pooling are reused across scans.

System prompt + response schema live here (server-side) so they don't
ship to end users in the Web Store zip.
"""

import json

import httpx

from app.billing.pricing import (
    DEFAULT_EXTRACT_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_OUTPUT_TOKENS,
)
from app.core.config import settings

_client: httpx.AsyncClient | None = None

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

# Sampling temperatures. Scan wants a little variety; extract must be
# deterministic so the same PDF yields the same text.
_SCORE_TEMPERATURE = 0.2
_EXTRACT_TEMPERATURE = 0.0

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


# Human-readable labels for the structured criteria block. Deterministic
# serialization only — the prompt rewrite (v5 thread #3) reworks how the model
# is told to *use* weights/tiers; v5.0.0 just states them faithfully.
_AUTH_LABELS = {
    "citizen": "Canadian citizen",
    "pr": "permanent resident",
    "international": "international student (study permit)",
    "other": "other",
}
_CRITERION_LABELS = {
    "preferred_locations": "Location",
    "work_modes": "Work mode",
    "target_term": "Target term",
    "target_length": "Term length",
    "languages": "Languages",
}
_TIER_LABELS = (
    ("preferred", "prefer"),
    ("acceptable", "ok"),
    ("avoid", "avoid"),
    ("excluded", "never"),
)


def _format_criterion(label: str, c: dict) -> str | None:
    """One line like 'Location [strong]: prefer Toronto; ok Ontario; avoid
    West Canada; never outside Canada'. Returns None when no tier is filled."""
    tiers = [
        f"{verb} {', '.join(c[key])}"
        for key, verb in _TIER_LABELS
        if c.get(key)
    ]
    if not tiers:
        return None
    weight = c.get("weight")
    suffix = f" [{weight}]" if weight else ""
    return f"{label}{suffix}: " + "; ".join(tiers)


def _format_criteria(match_criteria: dict) -> str:
    """Serialize populated criteria into a short labelled block. Only
    non-empty fields appear, so empty criteria emit nothing."""
    lines: list[str] = []
    auth = match_criteria.get("work_authorization")
    if auth:
        lines.append(f"Work authorization: {_AUTH_LABELS.get(auth, auth)}")
    for field, label in _CRITERION_LABELS.items():
        c = match_criteria.get(field)
        if isinstance(c, dict):
            line = _format_criterion(label, c)
            if line:
                lines.append(line)
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

    parsed_result is {"score", "verdict", "reason"}; usage_metadata is
    Gemini's raw usageMetadata dict so the caller can compute actual cost.
    """
    client = _require_client()
    url = f"{_GEMINI_BASE}/models/{model}:generateContent"

    generation_config = {
        "temperature": _SCORE_TEMPERATURE,
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


_PROFILE_EXTRACT_PROMPT = (
    "Extract the candidate's profile from this application package PDF into the "
    "given JSON schema. summary: a 1–2 sentence overview. education, "
    "experience, projects: one object per entry, most recent first. skills and "
    "languages: arrays of short strings (languages = spoken/working languages "
    "like English or French, not programming languages — those go in skills). "
    "Use empty strings/arrays for anything the PDF doesn't state; do not invent "
    "facts."
)

# Gemini structured-output schema. Optional fields throughout — the extractor
# leaves them empty when the PDF is silent (validated app-side by StructuredProfile).
_PROFILE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "education": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "institution": {"type": "string"},
                    "credential": {"type": "string"},
                    "field": {"type": "string"},
                    "grade": {"type": "string"},
                    "dates": {"type": "string"},
                },
            },
        },
        "experience": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "org": {"type": "string"},
                    "dates": {"type": "string"},
                    "description": {"type": "string"},
                },
            },
        },
        "skills": {"type": "array", "items": {"type": "string"}},
        "projects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                },
            },
        },
        "languages": {"type": "array", "items": {"type": "string"}},
    },
}


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
                    {"text": _PROFILE_EXTRACT_PROMPT},
                    {"inline_data": {"mime_type": "application/pdf", "data": pdf_b64}},
                ]
            }
        ],
        "generationConfig": {
            "temperature": _EXTRACT_TEMPERATURE,
            "maxOutputTokens": max_output_tokens,
            "thinkingConfig": {"thinkingBudget": 0},
            "responseMimeType": "application/json",
            "responseSchema": _PROFILE_SCHEMA,
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
    verdict = p.get("verdict")
    reason = p.get("reason")
    if not isinstance(score, int) or not 1 <= score <= 10:
        return False
    if verdict not in {"Apply", "Consider", "Skip"}:
        return False
    if not isinstance(reason, str) or not reason.strip():
        return False
    return True
