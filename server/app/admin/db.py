"""Admin-console queries (v6.6, ADR 0025).

Read-only aggregates over auth.users + credit_ledger_entry + scan, plus the
single gift-grant write. The backend pool uses the service role and bypasses
RLS, so these read any user's rows directly; authZ is the ADMIN_USER_IDS
allowlist enforced in the route dependency, not RLS.
"""

from decimal import Decimal

from app.billing.db import get_history, pool


async def get_stats() -> dict:
    async with pool().acquire() as conn:
        total_users = await conn.fetchval("select count(*) from auth.users")
        issued = await conn.fetchval(
            "select coalesce(sum(delta), 0) from credit_ledger_entry where delta > 0"
        )
        # Net credits consumed in the last 24h: scan debits (negative) plus
        # their refunds (positive), sign-flipped to a positive "used" figure.
        used_24h = await conn.fetchval(
            "select coalesce(-sum(delta), 0) from credit_ledger_entry "
            "where kind in ('scan_debit', 'scan_refund') "
            "  and created_at > now() - interval '24 hours'"
        )
    return {
        "total_users": int(total_users),
        "total_credits_issued": float(issued),
        "credits_used_24h": float(used_24h),
    }


async def list_users(search: str, limit: int, offset: int) -> list[dict]:
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            """
            select u.id::text     as user_id,
                   u.email        as email,
                   u.created_at   as created_at,
                   coalesce(
                     (select sum(delta) from credit_ledger_entry l
                       where l.user_id = u.id), 0) as balance
            from auth.users u
            where ($1 = '' or u.email ilike '%' || $1 || '%')
            order by u.created_at desc
            limit $2 offset $3
            """,
            search,
            limit,
            offset,
        )
    return [
        {
            "user_id": r["user_id"],
            "email": r["email"],
            "created_at": r["created_at"].isoformat(),
            "balance": float(r["balance"]),
        }
        for r in rows
    ]


async def resolve_email(email: str) -> str | None:
    async with pool().acquire() as conn:
        return await conn.fetchval(
            "select id::text from auth.users where lower(email) = lower($1)", email
        )


async def inspect_user(user_id: str) -> dict | None:
    """User detail for the admin inspect view: identity, balance, recent scan
    activity, and scan-merged credit history (reusing the web history shape)."""
    async with pool().acquire() as conn:
        u = await conn.fetchrow(
            "select id::text as user_id, email, created_at "
            "from auth.users where id = $1::uuid",
            user_id,
        )
        if u is None:
            return None
        balance = await conn.fetchval(
            "select coalesce(sum(delta), 0) from credit_ledger_entry "
            "where user_id = $1::uuid",
            user_id,
        )
        scans = await conn.fetch(
            "select id::text as id, kind, status, org, title, "
            "       coalesce(actual_cost, estimated_cost) as cost, created_at "
            "from scan where user_id = $1::uuid "
            "order by created_at desc limit 25",
            user_id,
        )
        profile_summary = await conn.fetchval(
            "select (profile_json->>'summary') from user_profile "
            "where user_id = $1::uuid",
            user_id,
        )
    history = await get_history(user_id, 25, 0)
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "created_at": u["created_at"].isoformat(),
        "balance": float(balance),
        "profile": {
            "cv_ready": bool(profile_summary),
            "summary": profile_summary,
        },
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
        "history": [
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
    }


async def grant_credits(
    *, user_id: str, credits: Decimal, admin_id: str, reason: str | None
) -> float:
    """Insert one admin_grant ledger row (created_by = admin, note = reason)
    and return the user's new balance. Same connection so the read reflects
    the write."""
    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "insert into credit_ledger_entry "
                "  (user_id, delta, kind, created_by, note) "
                "values ($1::uuid, $2, 'admin_grant', $3::uuid, $4)",
                user_id,
                credits,
                admin_id,
                reason,
            )
            balance = await conn.fetchval(
                "select coalesce(sum(delta), 0) from credit_ledger_entry "
                "where user_id = $1::uuid",
                user_id,
            )
    return float(balance)
