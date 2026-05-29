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


def _row_to_profile(row: asyncpg.Record | None) -> dict[str, Any]:
    if row is None:
        return {**_EMPTY, "profile_supplement": []}  # fresh list, not the shared default
    return {
        "cv_text": row["cv_text"],
        "preferences": row["preferences"],
        "match_criteria": _loads(row["match_criteria"], {}),
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
) -> dict[str, Any]:
    """Upsert. Fields left as None aren't touched; all None is a no-op
    that still returns the current row. profile_json is not written here —
    it's set by the extract flow (upsert_profile_json_in_tx)."""
    # No JSONB codec on the pool, so pass JSON as a string and cast in SQL.
    criteria_json = json.dumps(match_criteria) if match_criteria is not None else None
    supplement_json = (
        json.dumps(profile_supplement) if profile_supplement is not None else None
    )
    async with pool().acquire() as conn:
        await conn.execute(
            "insert into user_profile "
            "  (user_id, cv_text, preferences, match_criteria, profile_supplement, "
            "   updated_at) "
            "values ($1::uuid, coalesce($2, ''), coalesce($3, ''), "
            "        coalesce($4::jsonb, '{}'::jsonb), "
            "        coalesce($5::jsonb, '[]'::jsonb), now()) "
            "on conflict (user_id) do update set "
            "  cv_text            = coalesce($2, user_profile.cv_text), "
            "  preferences        = coalesce($3, user_profile.preferences), "
            "  match_criteria     = coalesce($4::jsonb, user_profile.match_criteria), "
            "  profile_supplement = coalesce($5::jsonb, user_profile.profile_supplement), "
            "  updated_at         = now()",
            user_id,
            cv_text,
            preferences,
            criteria_json,
            supplement_json,
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
