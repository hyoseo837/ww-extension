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


async def get_history(user_id: str, limit: int, offset: int) -> list[dict]:
    """Credit-history items newest-first, for the web view (v6.2).

    Each scan is collapsed to ONE item: its scan_debit + scan_refund ledger
    rows are summed into a net delta (so a -14.16 debit + 11.85 refund shows
    as -2.31). Fully-refunded scans (net 0 — failed/no-op) are dropped. Scan
    items carry the scan's kind ('scan' | 'profile_extract'), org/title, and
    batch_id (for client-side "Scanned N jobs" grouping). Non-scan ledger rows
    (purchase / signup_bonus / admin_grant) pass through unchanged.
    """
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            """
            with scan_items as (
                select s.id::text       as id,
                       s.kind           as kind,
                       sum(l.delta)     as delta,
                       s.created_at     as created_at,
                       s.org            as org,
                       s.title          as title,
                       s.posting_id     as posting_id,
                       s.batch_id::text as batch_id
                from credit_ledger_entry l
                join scan s on s.id = l.ref::uuid
                where l.user_id = $1::uuid
                  and l.kind in ('scan_debit', 'scan_refund')
                group by s.id, s.kind, s.created_at, s.org, s.title,
                         s.posting_id, s.batch_id
                having sum(l.delta) <> 0
            ),
            ledger_items as (
                select id::text    as id,
                       kind        as kind,
                       delta       as delta,
                       created_at  as created_at,
                       null::text  as org,
                       null::text  as title,
                       null::text  as posting_id,
                       null::text  as batch_id
                from credit_ledger_entry
                where user_id = $1::uuid
                  and kind not in ('scan_debit', 'scan_refund')
            )
            select * from (
                select * from scan_items
                union all
                select * from ledger_items
            ) t
            order by created_at desc, id desc
            limit $2 offset $3
            """,
            user_id,
            limit,
            offset,
        )
        return [dict(r) for r in rows]


# Upper bound on ledger rows pulled into a single data export (v6.14). A
# personal account's full history is far below this; the cap just keeps an
# export bounded.
_EXPORT_MAX_ROWS = 100_000


async def export_user(user_id: str) -> dict | None:
    """All of one user's billing-side data for the self-serve export (v6.14):
    account identity, balance, the full credit ledger, and every scan row.
    The profile is added by the route from profile.db. Returns None if the
    auth user doesn't exist."""
    async with pool().acquire() as conn:
        account = await conn.fetchrow(
            "select id::text as user_id, email, created_at "
            "from auth.users where id = $1::uuid",
            user_id,
        )
        if account is None:
            return None
        scans = await conn.fetch(
            "select id::text as id, kind, status, org, title, "
            "       coalesce(actual_cost, estimated_cost) as cost, created_at "
            "from scan where user_id = $1::uuid "
            "order by created_at desc",
            user_id,
        )
    balance = await get_balance(user_id)
    history = await get_history(user_id, _EXPORT_MAX_ROWS, 0)
    return {
        "account": {
            "user_id": account["user_id"],
            "email": account["email"],
            "created_at": account["created_at"].isoformat(),
        },
        "balance": float(balance),
        "credit_history": [
            {
                "id": str(h["id"]),
                "kind": h["kind"],
                "delta": float(h["delta"]),
                "created_at": h["created_at"].isoformat(),
                "org": h["org"],
                "title": h["title"],
                "posting_id": h["posting_id"],
                "batch_id": h["batch_id"],
            }
            for h in history
        ],
        "scans": [
            {
                "id": s["id"],
                "kind": s["kind"],
                "status": s["status"],
                "org": s["org"],
                "title": s["title"],
                "cost": float(s["cost"]) if s["cost"] is not None else None,
                "created_at": s["created_at"].isoformat(),
            }
            for s in scans
        ],
    }


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
    title: str | None = None,
    org: str | None = None,
    batch_id: str | None = None,
) -> dict | None:
    """Insert a pending scan row. On ID conflict (idempotent retry),
    return the existing row instead of creating a duplicate.

    title/org/batch_id (v6.2) feed the credit-history display; all optional.
    """
    row = await conn.fetchrow(
        "insert into scan "
        "(id, user_id, model, kind, posting_id, status, estimated_cost, "
        " title, org, batch_id) "
        "values ($1, $2::uuid, $3, $4, $5, 'pending', $6, $7, $8, $9::uuid) "
        "on conflict (id) do nothing "
        "returning id",
        scan_id,
        user_id,
        model,
        kind,
        posting_id,
        estimated_cost,
        title,
        org,
        batch_id,
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
