"""DB-backed ledger tests, against the real migrations on a disposable
Postgres (see conftest). Skipped without TEST_DATABASE_URL.

Covers the v8.9 credit-flow hardening: the per-user debit lock (the
read-committed balance race of audit 2026-06-11 #3 is asserted closed)
and stranded-scan reconciliation (ADR 0047).
"""

import asyncio
import os
import uuid
from decimal import Decimal

import pytest

from app.billing import db as billing_db

pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not set"
)


async def test_signup_bonus_granted_once(pool, user_id):
    assert await billing_db.get_balance(user_id) == Decimal(200)


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
        ) == Decimal(170)
        assert await billing_db.balance_after_estimate(
            conn, user_id, Decimal(250)
        ) == Decimal(-50)


async def test_grant_purchase_replay_is_noop(pool, user_id):
    event_id = f"evt_{uuid.uuid4().hex}"
    await billing_db.grant_purchase(user_id, Decimal(300), event_id)
    await billing_db.grant_purchase(user_id, Decimal(300), event_id)
    assert await billing_db.get_balance(user_id) == Decimal(500)  # 200 bonus + 300 once


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


async def test_concurrent_debits_cannot_overdraw(pool, user_id):
    """Audit #3 closed (v8.9): with the per-user advisory lock taken before
    the balance check, the second transaction blocks until the first commits,
    sees its debit, and gets rejected — the balance never goes negative.
    (Pre-v8.9 this test asserted the overdraw it now rules out.)"""
    estimate = Decimal(120)  # two of these exceed the 200-credit bonus
    async with pool.acquire() as c1, pool.acquire() as c2:
        tx1 = c1.transaction()
        await tx1.start()
        await billing_db.lock_user_for_debit(c1, user_id)
        r1 = await billing_db.balance_after_estimate(c1, user_id, estimate)
        assert r1 >= 0
        await billing_db.insert_ledger_entry(
            c1, user_id=user_id, delta=-estimate,
            kind="scan_debit", ref=str(uuid.uuid4()),
        )

        async def second_debit() -> Decimal:
            tx2 = c2.transaction()
            await tx2.start()
            try:
                await billing_db.lock_user_for_debit(c2, user_id)
                remaining = await billing_db.balance_after_estimate(
                    c2, user_id, estimate
                )
                if remaining >= 0:
                    await billing_db.insert_ledger_entry(
                        c2, user_id=user_id, delta=-estimate,
                        kind="scan_debit", ref=str(uuid.uuid4()),
                    )
                return remaining
            finally:
                await tx2.commit()

        task = asyncio.create_task(second_debit())
        await asyncio.sleep(0.2)
        assert not task.done()  # blocked on the per-user lock
        await tx1.commit()      # releases the xact lock
        r2 = await asyncio.wait_for(task, timeout=5)

    assert r2 < 0  # second check saw the first debit and rejected
    assert await billing_db.get_balance(user_id) == Decimal(80)


# ── Stranded-scan reconciliation (ADR 0047) ──────────────────────────────────


async def _strand_scan(
    conn, user_id, *, estimate=Decimal("14.16"), minutes_old=20
) -> uuid.UUID:
    """A pending scan whose debit committed but which never settled,
    backdated past the reconciliation cutoff."""
    scan_id = uuid.uuid4()
    await billing_db.insert_scan_pending(
        conn, scan_id=scan_id, user_id=user_id, model="gemini-2.5-flash",
        kind="scan", posting_id="123", estimated_cost=estimate,
    )
    await billing_db.insert_ledger_entry(
        conn, user_id=user_id, delta=-estimate, kind="scan_debit",
        ref=str(scan_id),
    )
    await conn.execute(
        "update scan set created_at = now() - make_interval(mins => $2) "
        "where id = $1",
        scan_id, minutes_old,
    )
    return scan_id


async def test_reconcile_refunds_stranded_scan(pool, user_id):
    async with pool.acquire() as conn:
        scan_id = await _strand_scan(conn, user_id)
    assert await billing_db.get_balance(user_id) == Decimal("185.84")

    assert await billing_db.reconcile_stranded_scans() == 1

    assert await billing_db.get_balance(user_id) == Decimal(200)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select status, error from scan where id = $1", scan_id
        )
    assert row["status"] == "failed"
    assert row["error"] == "stranded"


async def test_reconcile_rerun_is_noop(pool, user_id):
    async with pool.acquire() as conn:
        await _strand_scan(conn, user_id)
    assert await billing_db.reconcile_stranded_scans() == 1
    assert await billing_db.reconcile_stranded_scans() == 0
    assert await billing_db.get_balance(user_id) == Decimal(200)  # no double refund


async def test_reconcile_skips_in_flight_scan(pool, user_id):
    async with pool.acquire() as conn:
        scan_id = await _strand_scan(conn, user_id, minutes_old=0)  # just started

    assert await billing_db.reconcile_stranded_scans() == 0

    assert await billing_db.get_balance(user_id) == Decimal("185.84")
    async with pool.acquire() as conn:
        status = await conn.fetchval(
            "select status from scan where id = $1", scan_id
        )
    assert status == "pending"
