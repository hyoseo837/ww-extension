"""Admin console endpoints (v6.6, ADR 0025).

Every route depends on RequireAdmin — a verified user whose `sub` is in the
ADMIN_USER_IDS allowlist (403 otherwise). The gift-grant endpoint mutates
balances, so the gate lives here, server-side, not just in the UI.
"""

import logging
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.admin import db
from app.auth.dependency import RequireAdmin

router = APIRouter(prefix="/admin")
log = logging.getLogger("ww.admin")


@router.get("/stats")
async def stats(_: RequireAdmin) -> dict:
    return await db.get_stats()


@router.get("/users")
async def users(_: RequireAdmin, search: str = "", limit: int = 50, offset: int = 0) -> dict:
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    rows = await db.list_users(search.strip(), limit, offset)
    return {"users": rows, "limit": limit, "offset": offset}


@router.get("/feedback")
async def feedback(_: RequireAdmin, limit: int = 50, offset: int = 0) -> dict:
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    rows = await db.list_feedback(limit, offset)
    return {"feedback": rows, "limit": limit, "offset": offset}


@router.get("/users/{user_id}")
async def inspect(user_id: str, _: RequireAdmin) -> dict:
    detail = await db.inspect_user(user_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="user not found")
    return detail


class GrantRequest(BaseModel):
    email: str
    credits: Decimal
    reason: str | None = None


@router.post("/grant")
async def grant(req: GrantRequest, admin: RequireAdmin) -> dict:
    if req.credits <= 0:
        raise HTTPException(status_code=400, detail="credits must be positive")
    user_id = await db.resolve_email(req.email.strip())
    if user_id is None:
        raise HTTPException(status_code=404, detail=f"no user with email: {req.email}")
    reason = (req.reason or "").strip() or None
    balance = await db.grant_credits(
        user_id=user_id, credits=req.credits, admin_id=admin["sub"], reason=reason
    )
    log.info(
        "admin_grant by=%s to=%s credits=%s reason=%s",
        admin["sub"], user_id, req.credits, reason,
    )
    return {"user_id": user_id, "balance": balance}
