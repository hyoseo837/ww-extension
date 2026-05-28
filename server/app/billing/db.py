from decimal import Decimal

import asyncpg

from app.core.config import settings

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=1,
        max_size=10,
    )


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _require_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("asyncpg pool not initialized")
    return _pool


async def get_balance(user_id: str) -> Decimal:
    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select coalesce(sum(delta), 0) as balance "
            "from credit_ledger_entry where user_id = $1::uuid",
            user_id,
        )
        return row["balance"]
