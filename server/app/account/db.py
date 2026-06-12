"""Account (data-subject rights) DB access. Reuses the billing pool."""

from app.billing.db import email_hash, pool


async def block_signup_bonus(email: str) -> None:
    """Record this identity so a future re-register doesn't re-grant the signup
    bonus (ADR 0029). Idempotent. Called before the auth user is deleted, while
    the email is still known."""
    async with pool().acquire() as conn:
        await conn.execute(
            "insert into signup_bonus_block (email_hash) values ($1) "
            "on conflict (email_hash) do nothing",
            email_hash(email),
        )
