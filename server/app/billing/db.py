from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg

from app.core.config import settings

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=1,
        # 25 covers up to ~8 concurrent scans (3 queries each) without
        # pool waits. See spec v4.4.0 Performance.
        max_size=25,
    )


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("asyncpg pool not initialized")
    return _pool


def _require_pool() -> asyncpg.Pool:
    return pool()


async def get_balance(user_id: str) -> Decimal:
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "select coalesce(sum(delta), 0) as balance "
            "from credit_ledger_entry where user_id = $1::uuid",
            user_id,
        )
        return row["balance"]


async def balance_after_estimate(
    conn: asyncpg.Connection, user_id: str, estimate: Decimal
) -> Decimal:
    """Returns (current_balance - estimate) for the user, computed in a
    single round-trip. Negative result means the caller should reject
    the request as insufficient credits.
    """
    row = await conn.fetchrow(
        "select coalesce(sum(delta), 0) - $2 as remaining "
        "from credit_ledger_entry where user_id = $1::uuid",
        user_id,
        estimate,
    )
    return row["remaining"]


async def grant_purchase(user_id: str, credits: Decimal, event_id: str) -> None:
    """Grant purchased credits, idempotent on the Stripe event id.

    The partial unique index on (ref) WHERE kind='purchase' (migration
    0004) makes a replayed webhook a no-op. Runs on its own connection —
    the webhook is outside the scan transactions.
    """
    async with pool().acquire() as conn:
        await conn.execute(
            "insert into credit_ledger_entry (user_id, delta, kind, ref) "
            "values ($1::uuid, $2, 'purchase', $3) "
            "on conflict (ref) where kind = 'purchase' do nothing",
            user_id,
            credits,
            event_id,
        )


async def insert_ledger_entry(
    conn: asyncpg.Connection,
    *,
    user_id: str,
    delta: Decimal,
    kind: str,
    ref: str | None = None,
) -> None:
    await conn.execute(
        "insert into credit_ledger_entry (user_id, delta, kind, ref) "
        "values ($1::uuid, $2, $3, $4)",
        user_id,
        delta,
        kind,
        ref,
    )


async def insert_scan_pending(
    conn: asyncpg.Connection,
    *,
    scan_id: UUID,
    user_id: str,
    model: str,
    kind: str,
    posting_id: str | None,
    estimated_cost: Decimal,
) -> dict | None:
    """Insert a pending scan row. On ID conflict (idempotent retry),
    return the existing row instead of creating a duplicate."""
    row = await conn.fetchrow(
        "insert into scan "
        "(id, user_id, model, kind, posting_id, status, estimated_cost) "
        "values ($1, $2::uuid, $3, $4, $5, 'pending', $6) "
        "on conflict (id) do nothing "
        "returning id",
        scan_id,
        user_id,
        model,
        kind,
        posting_id,
        estimated_cost,
    )
    if row is None:
        # Conflict — return the pre-existing row.
        existing = await conn.fetchrow(
            "select * from scan where id = $1", scan_id
        )
        return dict(existing) if existing else None
    return None


async def update_scan_success(
    conn: asyncpg.Connection,
    *,
    scan_id: UUID,
    actual_cost: Decimal,
    response: dict,
    usage: dict,
) -> None:
    await conn.execute(
        "update scan set status='success', actual_cost=$2, response=$3::jsonb, "
        "usage=$4::jsonb, completed_at=now() where id=$1",
        scan_id,
        actual_cost,
        _json(response),
        _json(usage),
    )


async def update_scan_failed(
    conn: asyncpg.Connection,
    *,
    scan_id: UUID,
    error: str,
) -> None:
    await conn.execute(
        "update scan set status='failed', error=$2, completed_at=now() "
        "where id=$1",
        scan_id,
        error,
    )


def _json(value: Any) -> str:
    import json
    return json.dumps(value, default=str)
