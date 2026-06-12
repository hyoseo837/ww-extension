"""DB-backed referral-bonus tests (v8.12, ADR 0050), against the real
migrations on a disposable Postgres (see conftest). Skipped without
TEST_DATABASE_URL.

Covers: attribution insert/once-only, eligibility (fresh / attributed /
scanned / suppression-blocked), and the settlement grant — fires exactly
once per invitee regardless of how many scans settle.
"""

import hashlib
import os
import uuid
from decimal import Decimal

import pytest

from app.billing import db as billing_db, pricing

pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not set"
)


async def _new_user(pool, email: str | None = None) -> tuple[str, str]:
    email = email or f"{uuid.uuid4().hex}@example.test"
    async with pool.acquire() as conn:
        uid = await conn.fetchval(
            "insert into auth.users (email) values ($1) returning id", email
        )
    return str(uid), email


# ── attribution ───────────────────────────────────────────────────────────────


async def test_insert_referral_once(pool, user_id):
    inviter, _ = await _new_user(pool)
    assert await billing_db.insert_referral(user_id, inviter) is True
    other, _ = await _new_user(pool)
    assert await billing_db.insert_referral(user_id, other) is False  # already set


async def test_find_user_id_by_email_is_case_insensitive(pool):
    uid, email = await _new_user(pool, f"{uuid.uuid4().hex}@Example.Test".lower())
    assert await billing_db.find_user_id_by_email(email) == uid
    assert await billing_db.find_user_id_by_email("nobody@example.test") is None


# ── eligibility ───────────────────────────────────────────────────────────────


async def test_eligible_fresh_user(pool, user_id):
    assert await billing_db.referral_eligible(user_id, "a@example.test") is True


async def test_not_eligible_after_attribution(pool, user_id):
    inviter, _ = await _new_user(pool)
    await billing_db.insert_referral(user_id, inviter)
    assert await billing_db.referral_eligible(user_id, "a@example.test") is False


async def test_not_eligible_after_scan(pool, user_id):
    async with pool.acquire() as conn:
        await billing_db.insert_scan_pending(
            conn, scan_id=uuid.uuid4(), user_id=user_id, model="gemini-2.5-flash",
            kind="scan", posting_id="1", estimated_cost=Decimal("2.5"),
        )
    assert await billing_db.has_scans(user_id) is True
    assert await billing_db.referral_eligible(user_id, "a@example.test") is False


async def test_not_eligible_when_suppression_blocked(pool, user_id):
    email = f"{uuid.uuid4().hex}@example.test"
    async with pool.acquire() as conn:
        await conn.execute(
            "insert into signup_bonus_block (email_hash) values ($1)",
            hashlib.sha256(email.encode()).hexdigest(),
        )
    assert await billing_db.is_blocked(email) is True
    assert await billing_db.referral_eligible(user_id, email) is False


# ── grant ─────────────────────────────────────────────────────────────────────


async def test_grant_fires_once_per_invitee(pool, user_id):
    inviter, _ = await _new_user(pool)
    await billing_db.insert_referral(user_id, inviter)
    before = await billing_db.get_balance(inviter)

    async with pool.acquire() as conn:
        await billing_db.grant_referral_bonus(conn, user_id)   # first scan settles
        await billing_db.grant_referral_bonus(conn, user_id)   # second scan settles

    assert await billing_db.get_balance(inviter) == before + Decimal(
        pricing.REFERRAL_BONUS_CREDITS
    )


async def test_grant_is_noop_without_attribution(pool, user_id):
    balance = await billing_db.get_balance(user_id)
    async with pool.acquire() as conn:
        await billing_db.grant_referral_bonus(conn, user_id)
    assert await billing_db.get_balance(user_id) == balance
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "select count(*) from credit_ledger_entry "
            "where kind = 'referral_bonus' and ref = $1",
            user_id,
        )
    assert count == 0


async def test_two_invitees_one_inviter(pool):
    inviter, _ = await _new_user(pool)
    a, _ = await _new_user(pool)
    b, _ = await _new_user(pool)
    await billing_db.insert_referral(a, inviter)
    await billing_db.insert_referral(b, inviter)
    before = await billing_db.get_balance(inviter)
    async with pool.acquire() as conn:
        await billing_db.grant_referral_bonus(conn, a)
        await billing_db.grant_referral_bonus(conn, b)
        await billing_db.grant_referral_bonus(conn, a)  # replay
    assert await billing_db.get_balance(inviter) == before + 2 * Decimal(
        pricing.REFERRAL_BONUS_CREDITS
    )


async def test_export_includes_referral(pool, user_id):
    inviter, _ = await _new_user(pool)
    await billing_db.insert_referral(user_id, inviter)
    invitee_export = await billing_db.export_user(user_id)
    inviter_export = await billing_db.export_user(inviter)
    assert invitee_export["referral"] == {
        "invited_by_user_id": inviter,
        "invited_user_ids": [],
    }
    assert inviter_export["referral"]["invited_user_ids"] == [user_id]
