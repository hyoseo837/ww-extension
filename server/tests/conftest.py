"""Test fixtures.

App modules instantiate Settings at import time, so dummy env vars are
forced (not setdefault) before any app import — tests must never see the
real server/.env, especially its production DATABASE_URL.

DB-backed tests run only when TEST_DATABASE_URL points at a disposable
Postgres (CI's service container; any local scratch DB). They are skipped
otherwise. The schema is the real migrations applied in filename order,
on top of a minimal stub of Supabase's auth schema (auth.users +
auth.uid()), which the migrations reference.
"""

import asyncio
import os
import pathlib
import uuid

# Read before the override below so a real TEST_DATABASE_URL survives.
TEST_DB_URL = os.environ.get("TEST_DATABASE_URL")

_DUMMY_ENV = {
    "SUPABASE_URL": "https://test.invalid",
    "SUPABASE_SECRET_KEY": "sb_secret_test",
    "SUPABASE_JWKS_URL": "https://test.invalid/jwks",
    "DATABASE_URL": "postgresql://invalid.test/never-used",
    "GEMINI_API_KEY": "test-key",
    "STRIPE_SECRET_KEY": "sk_test_dummy",
    "STRIPE_WEBHOOK_SECRET": "whsec_dummy",
}
os.environ.update(_DUMMY_ENV)

import asyncpg  # noqa: E402
import pytest  # noqa: E402

from app.billing import db as billing_db  # noqa: E402

_MIGRATIONS_DIR = pathlib.Path(__file__).parent.parent / "migrations"

# Just enough of Supabase's auth schema for the migrations to apply:
# auth.users (FK target + signup-bonus trigger host) and auth.uid()
# (referenced by the RLS policies).
_AUTH_STUB = """
create schema if not exists auth;
create table if not exists auth.users (
  id          uuid primary key default gen_random_uuid(),
  email       text,
  created_at  timestamptz not null default now()
);
create or replace function auth.uid() returns uuid
  language sql stable as 'select null::uuid';
"""

async def _apply_schema() -> None:
    conn = await asyncpg.connect(TEST_DB_URL)
    try:
        await conn.execute("drop schema if exists public cascade")
        await conn.execute("drop schema if exists auth cascade")
        await conn.execute("create schema public")
        await conn.execute(_AUTH_STUB)
        for migration in sorted(_MIGRATIONS_DIR.glob("*.sql")):
            await conn.execute(migration.read_text())
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def _schema():
    """Fresh schema once per test session, in its own short-lived loop so
    it doesn't conflict with the per-test loops pytest-asyncio creates."""
    if not TEST_DB_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    asyncio.run(_apply_schema())


@pytest.fixture
async def pool(_schema):
    """Per-test pool (asyncpg pools are bound to one event loop), wired
    into app.billing.db so the module functions under test run unmodified."""
    test_pool = await asyncpg.create_pool(dsn=TEST_DB_URL, min_size=1, max_size=5)
    billing_db._pool = test_pool
    yield test_pool
    billing_db._pool = None
    await test_pool.close()


@pytest.fixture
async def user_id(pool) -> str:
    """A fresh auth user per test. The insert fires the signup-bonus
    trigger, so every new user starts with 100 credits."""
    async with pool.acquire() as conn:
        uid = await conn.fetchval(
            "insert into auth.users (email) values ($1) returning id",
            f"{uuid.uuid4().hex}@example.test",
        )
    return str(uid)
