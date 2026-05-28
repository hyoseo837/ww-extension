"""User profile (cv_text + preferences) read/write."""

import asyncpg

from app.billing.db import pool


async def get_profile(user_id: str) -> dict[str, str]:
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "select cv_text, preferences from user_profile where user_id = $1::uuid",
            user_id,
        )
    if row is None:
        return {"cv_text": "", "preferences": ""}
    return {"cv_text": row["cv_text"], "preferences": row["preferences"]}


async def get_profile_in_tx(conn: asyncpg.Connection, user_id: str) -> dict[str, str]:
    """Same as get_profile but reuses an existing connection — used inside
    the /scan transaction so cv_text reads are part of the same snapshot
    as the balance check."""
    row = await conn.fetchrow(
        "select cv_text, preferences from user_profile where user_id = $1::uuid",
        user_id,
    )
    if row is None:
        return {"cv_text": "", "preferences": ""}
    return {"cv_text": row["cv_text"], "preferences": row["preferences"]}


async def upsert_profile(
    user_id: str,
    *,
    cv_text: str | None = None,
    preferences: str | None = None,
) -> dict[str, str]:
    """Upsert. Fields left as None aren't touched; both None is a no-op
    that still returns the current row."""
    async with pool().acquire() as conn:
        # COALESCE pattern: keep existing column when caller passed None.
        await conn.execute(
            "insert into user_profile (user_id, cv_text, preferences, updated_at) "
            "values ($1::uuid, coalesce($2, ''), coalesce($3, ''), now()) "
            "on conflict (user_id) do update set "
            "  cv_text     = coalesce($2, user_profile.cv_text), "
            "  preferences = coalesce($3, user_profile.preferences), "
            "  updated_at  = now()",
            user_id,
            cv_text,
            preferences,
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
