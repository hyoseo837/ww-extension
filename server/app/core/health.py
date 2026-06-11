import asyncio
from importlib.metadata import version

from fastapi import APIRouter, HTTPException

from app.billing import db as billing_db

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    # An honest health check touches the DB (v8.10, audit #8) — a dead
    # connection pool is the most likely real outage.
    try:
        async with asyncio.timeout(5):
            async with billing_db.pool().acquire() as conn:
                await conn.fetchval("select 1")
    except Exception:
        raise HTTPException(status_code=503, detail={"status": "db_unavailable"})
    return {
        "service": "ww-extension-backend",
        "version": version("ww-extension-backend"),
        "status": "ok",
    }
