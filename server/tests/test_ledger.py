"""DB-backed ledger tests, against the real migrations on a disposable
Postgres (see conftest). Skipped without TEST_DATABASE_URL.

These encode today's behaviour on purpose — including the read-committed
balance race (audit 2026-06-11 #3). When v8.9 adds the per-user lock,
test_concurrent_debits_can_overdraw must flip to assert the opposite.
"""

import os
import uuid
from decimal import Decimal

import pytest

from app.billing import db as billing_db

pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not set"
)


async def test_signup_bonus_granted_once(pool, user_id):
    assert await billing_db.get_balance(user_id) == Decimal(100)


async def test_insert_scan_pending_is_idempotent(pool, user_id):
    scan_id = uuid.uuid4()
    async with pool.acquire() as conn:
        first = await billing_db.insert_scan_pending(
            conn, scan_id=scan_id, user_id=user_id, model="gemini-2.5-flash",
            kind="scan", posting_id="123", estimated_cost=Decimal("2.5"),
        )
        second = await billing_db.insert_scan_pending(
            conn, scan_id=scan_id, user_id=user_id, model="gemini-2.5-flash",
            kind="scan", posting_id="123", estimated_cost=Decimal("2.5"),
        )
    assert first is None                      # fresh insert
    assert second is not None                 # replay returns the existing row
    assert second["id"] == scan_id
    assert second["status"] == "pending"


async def test_balance_after_estimate(pool, user_id):
    async with pool.acquire() as conn:
        assert await billing_db.balance_after_estimate(
            conn, user_id, Decimal(30)
        ) == Decimal(70)
        assert await billing_db.balance_after_estimate(
            conn, user_id, Decimal(150)
        ) == Decimal(-50)


async def test_grant_purchase_replay_is_noop(pool, user_id):
    event_id = f"evt_{uuid.uuid4().hex}"
    await billing_db.grant_purchase(user_id, Decimal(300), event_id)
    await billing_db.grant_purchase(user_id, Decimal(300), event_id)
    assert await billing_db.get_balance(user_id) == Decimal(400)  # 100 bonus + 300 once


async def _make_scan(conn, user_id, *, title="Dev", org="Acme") -> uuid.UUID:
    scan_id = uuid.uuid4()
    await billing_db.insert_scan_pending(
        conn, scan_id=scan_id, user_id=user_id, model="gemini-2.5-flash",
        kind="scan", posting_id="123", estimated_cost=Decimal("14.16"),
        title=title, org=org,
    )
    return scan_id


async def test_history_collapses_debit_and_refund(pool, user_id):
    async with pool.acquire() as conn:
        scan_id = await _make_scan(conn, user_id)
        await billing_db.insert_ledger_entry(
            conn, user_id=user_id, delta=Decimal("-14.16"),
            kind="scan_debit", ref=str(scan_id),
        )
        await billing_db.insert_ledger_entry(
            conn, user_id=user_id, delta=Decimal("11.85"),
            kind="scan_refund", ref=str(scan_id),
        )

    history = await billing_db.get_history(user_id, limit=50, offset=0)
    scan_items = [h for h in history if h["kind"] == "scan"]
    assert len(scan_items) == 1
    assert scan_items[0]["delta"] == Decimal("-2.31")  # net of debit + refund
    assert scan_items[0]["org"] == "Acme"
    # The signup bonus passes through as its own ledger item.
    assert any(h["kind"] == "signup_bonus" for h in history)


async def test_history_drops_fully_refunded_scans(pool, user_id):
    async with pool.acquire() as conn:
        scan_id = await _make_scan(conn, user_id)
        await billing_db.insert_ledger_entry(
            conn, user_id=user_id, delta=Decimal("-14.16"),
            kind="scan_debit", ref=str(scan_id),
        )
        await billing_db.insert_ledger_entry(
            conn, user_id=user_id, delta=Decimal("14.16"),
            kind="scan_refund", ref=str(scan_id),
        )

    history = await billing_db.get_history(user_id, limit=50, offset=0)
    assert not [h for h in history if h["kind"] == "scan"]


async def test_concurrent_debits_can_overdraw(pool, user_id):
    """Documents audit #3: two read-committed transactions both pass the
    balance check before either debit commits, so the balance goes negative.
    v8.9's per-user lock must make this impossible — flip this test then."""
    estimate = Decimal(60)  # two of these exceed the 100-credit bonus
    async with pool.acquire() as c1, pool.acquire() as c2:
        tx1, tx2 = c1.transaction(), c2.transaction()
        await tx1.start()
        await tx2.start()
        try:
            r1 = await billing_db.balance_after_estimate(c1, user_id, estimate)
            r2 = await billing_db.balance_after_estimate(c2, user_id, estimate)
            assert r1 >= 0 and r2 >= 0  # both checks pass — neither sees the other
            for conn in (c1, c2):
                await billing_db.insert_ledger_entry(
                    conn, user_id=user_id, delta=-estimate,
                    kind="scan_debit", ref=str(uuid.uuid4()),
                )
        finally:
            await tx1.commit()
            await tx2.commit()

    assert await billing_db.get_balance(user_id) == Decimal(-20)
