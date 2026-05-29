"""User profile (cv_text + preferences + match_criteria) read/write."""

import json
from typing import Any

import asyncpg

from app.billing.db import pool

# Selected by every read; match_criteria comes back as a JSONB-encoded
# string (no codec is registered on the pool) and is parsed by _row_to_profile.
_PROFILE_COLUMNS = "cv_text, preferences, match_criteria"

_EMPTY = {"cv_text": "", "preferences": "", "match_criteria": {}}


def _row_to_profile(row: asyncpg.Record | None) -> dict[str, Any]:
    if row is None:
        return dict(_EMPTY)
    raw = row["match_criteria"]
    return {
        "cv_text": row["cv_text"],
        "preferences": row["preferences"],
        # JSONB reads back as a string; default to {} for legacy/empty rows.
        "match_criteria": json.loads(raw) if raw else {},
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
    the /scan transaction so cv_text reads are part of the same snapshot
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
) -> dict[str, Any]:
    """Upsert. Fields left as None aren't touched; all None is a no-op
    that still returns the current row."""
    # asyncpg has no JSONB codec here, so pass criteria as a JSON string and
    # cast in SQL. None means "leave the column alone" (COALESCE pattern).
    criteria_json = json.dumps(match_criteria) if match_criteria is not None else None
    async with pool().acquire() as conn:
        await conn.execute(
            "insert into user_profile "
            "  (user_id, cv_text, preferences, match_criteria, updated_at) "
            "values ($1::uuid, coalesce($2, ''), coalesce($3, ''), "
            "        coalesce($4::jsonb, '{}'::jsonb), now()) "
            "on conflict (user_id) do update set "
            "  cv_text        = coalesce($2, user_profile.cv_text), "
            "  preferences    = coalesce($3, user_profile.preferences), "
            "  match_criteria = coalesce($4::jsonb, user_profile.match_criteria), "
            "  updated_at     = now()",
            user_id,
            cv_text,
            preferences,
            criteria_json,
        )
    return await get_profile(user_id)


async def upsert_cv_text_in_tx(
    conn: asyncpg.Connection, user_id: str, cv_text: str
) -> None:
    await conn.execute(
        "insert into user_profile (user_id, cv_text, updated_at) "
        "values ($1::uuid, $2, now()) "
        "on conflict (user_id) do update set "
        "  cv_text = $2, updated_at = now()",
        user_id,
        cv_text,
    )
