"""User profile read/write.

Columns: cv_text (legacy fallback), preferences (notes), match_criteria
(v5.0.0), profile_json + profile_supplement (v5.1.0). The JSONB columns have
no codec registered on the pool, so they read back as strings and are parsed
by _row_to_profile.
"""

import json
from typing import Any

import asyncpg

from app.billing.db import pool

_PROFILE_COLUMNS = (
    "cv_text, preferences, match_criteria, profile_json, profile_supplement"
)

_EMPTY = {
    "cv_text": "",
    "preferences": "",
    "match_criteria": {},
    "profile_json": {},
    "profile_supplement": [],
}


def _loads(raw: Any, default: Any) -> Any:
    """JSONB columns read back as strings; default for legacy/empty rows."""
    return json.loads(raw) if raw else default


# Legacy v1 criteria (ADR 0013): weighted-criterion dicts under these keys.
# v2 (ADR 0041) keeps flat fact lists; map v1 `preferred` values onto them.
_V1_TO_V2 = {
    "preferred_locations": "locations",
    "work_modes": "work_modes",
    "target_term": "target_term",
    "target_length": "term_lengths",
    "languages": "languages",
}


def _criteria_v2(mc: dict[str, Any]) -> dict[str, Any]:
    """Read-time v1→v2 conversion (ADR 0041). Weights and the
    acceptable/avoid/excluded tiers are dropped by decision; v2 rows (no
    criterion dicts) pass through untouched."""
    if not any(isinstance(mc.get(k), dict) for k in _V1_TO_V2):
        return mc
    out = {k: v for k, v in mc.items() if k not in _V1_TO_V2}
    for old, new in _V1_TO_V2.items():
        v1 = mc.get(old)
        preferred = v1.get("preferred") or [] if isinstance(v1, dict) else []
        out[new] = (preferred[0] if preferred else "") if new == "target_term" else preferred
    return out


def _row_to_profile(row: asyncpg.Record | None) -> dict[str, Any]:
    if row is None:
        return {**_EMPTY, "profile_supplement": []}  # fresh list, not the shared default
    return {
        "cv_text": row["cv_text"],
        "preferences": row["preferences"],
        "match_criteria": _criteria_v2(_loads(row["match_criteria"], {})),
        "profile_json": _loads(row["profile_json"], {}),
        "profile_supplement": _loads(row["profile_supplement"], []),
    }


async def get_profile(user_id: str) -> dict[str, Any]:
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            f"select {_PROFILE_COLUMNS} from user_profile where user_id = $1::uuid",
            user_id,
        )
    return _row_to_profile(row)


async def get_profile_in_tx(conn: asyncpg.Connection, user_id: str) -> dict[str, Any]:
    """Same as get_profile but reuses an existing connection — used inside
    the /scan transaction so profile reads are part of the same snapshot
    as the balance check."""
    row = await conn.fetchrow(
        f"select {_PROFILE_COLUMNS} from user_profile where user_id = $1::uuid",
        user_id,
    )
    return _row_to_profile(row)


async def upsert_profile(
    user_id: str,
    *,
    cv_text: str | None = None,
    preferences: str | None = None,
    match_criteria: dict[str, Any] | None = None,
    profile_supplement: list[Any] | None = None,
    profile_json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Upsert. Fields left as None aren't touched; all None is a no-op
    that still returns the current row. profile_json is normally set by the
    extract flow (upsert_profile_json_in_tx); it's accepted here only for a
    full replace (the client clears the profile by passing {})."""
    # No JSONB codec on the pool, so pass JSON as a string and cast in SQL.
    criteria_json = json.dumps(match_criteria) if match_criteria is not None else None
    supplement_json = (
        json.dumps(profile_supplement) if profile_supplement is not None else None
    )
    profile_json_str = json.dumps(profile_json) if profile_json is not None else None
    async with pool().acquire() as conn:
        await conn.execute(
            "insert into user_profile "
            "  (user_id, cv_text, preferences, match_criteria, profile_supplement, "
            "   profile_json, updated_at) "
            "values ($1::uuid, coalesce($2, ''), coalesce($3, ''), "
            "        coalesce($4::jsonb, '{}'::jsonb), "
            "        coalesce($5::jsonb, '[]'::jsonb), "
            "        coalesce($6::jsonb, '{}'::jsonb), now()) "
            "on conflict (user_id) do update set "
            "  cv_text            = coalesce($2, user_profile.cv_text), "
            "  preferences        = coalesce($3, user_profile.preferences), "
            "  match_criteria     = coalesce($4::jsonb, user_profile.match_criteria), "
            "  profile_supplement = coalesce($5::jsonb, user_profile.profile_supplement), "
            "  profile_json       = coalesce($6::jsonb, user_profile.profile_json), "
            "  updated_at         = now()",
            user_id,
            cv_text,
            preferences,
            criteria_json,
            supplement_json,
            profile_json_str,
        )
    return await get_profile(user_id)


async def upsert_profile_json_in_tx(
    conn: asyncpg.Connection, user_id: str, profile_json: dict[str, Any]
) -> None:
    """Set the extracted structured profile. Used inside the /profile/extract
    transaction. Leaves cv_text and profile_supplement untouched (ADR 0015)."""
    await conn.execute(
        "insert into user_profile (user_id, profile_json, updated_at) "
        "values ($1::uuid, $2::jsonb, now()) "
        "on conflict (user_id) do update set "
        "  profile_json = $2::jsonb, updated_at = now()",
        user_id,
        json.dumps(profile_json),
    )
