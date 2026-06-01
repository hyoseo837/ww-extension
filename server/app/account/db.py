"""Account (data-subject rights) DB access. Reuses the billing pool."""

import hashlib

from app.billing.db import pool


def _email_hash(email: str) -> str:
    """One-way hash of the lowercased email — the only thing retained past a
    deletion (ADR 0029). Must match the trigger's
    encode(digest(lower(email),'sha256'),'hex')."""
    return hashlib.sha256(email.lower().encode("utf-8")).hexdigest()


async def block_signup_bonus(email: str) -> None:
    """Record this identity so a future re-register doesn't re-grant the signup
    bonus (ADR 0029). Idempotent. Called before the auth user is deleted, while
    the email is still known."""
    async with pool().acquire() as conn:
        await conn.execute(
            "insert into signup_bonus_block (email_hash) values ($1) "
            "on conflict (email_hash) do nothing",
            _email_hash(email),
        )
