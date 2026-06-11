"""Data-subject rights endpoints.

GET /account/export — the access / portability right (v6.14): everything we
store about the caller, returned as one JSON object. No credit cost.
DELETE /account — the erasure right (v6.9, ADR 0027/0029): hard-delete the
caller's Supabase auth user (FK cascade clears all app data), after recording a
one-way email hash so a re-register can't re-grab the signup bonus.

The export route owns no DB queries of its own: it reuses billing.db for the
ledger/scans/account row and profile.db for the profile.
"""

import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Response

from app.account import db as account_db
from app.auth.dependency import CurrentUser
from app.billing import db as billing_db
from app.core import ratelimit
from app.core.config import settings
from app.profile import db as profile_db

router = APIRouter()
log = logging.getLogger("ww.account")


@router.get("/account/export")
async def export_account(user: CurrentUser) -> dict:
    # Heavy multi-table query, free to call (v8.10, audit #6).
    ratelimit.check("export", user["sub"], limit=3)
    data = await billing_db.export_user(user["sub"])
    if data is None:
        raise HTTPException(status_code=404, detail="user not found")
    profile = await profile_db.get_profile(user["sub"])
    return {
        "export_format": "ww-scorer-account-export",
        "export_version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "account": data["account"],
        "balance": data["balance"],
        "profile": profile,
        "credit_history": data["credit_history"],
        "scans": data["scans"],
    }


@router.delete("/account", status_code=204)
async def delete_account(user: CurrentUser) -> Response:
    """Hard-delete the caller's account (ADR 0027). Order matters: record the
    signup-bonus block hash (ADR 0029) while the email is still known, then
    delete the Supabase auth user — FK cascade clears user_profile, the credit
    ledger, and scans. Only the caller's own account (keyed on the JWT sub)."""
    user_id = user["sub"]
    email = user.get("email")
    if email:
        await account_db.block_signup_bonus(email)

    base = str(settings.supabase_url).rstrip("/")
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.delete(f"{base}/auth/v1/admin/users/{user_id}", headers=headers)
    if resp.status_code not in (200, 204):
        log.error(
            "account_delete_failed user=%s status=%s body=%s",
            user_id, resp.status_code, resp.text[:200],
        )
        raise HTTPException(status_code=502, detail="account deletion failed upstream")
    log.info("account_deleted user=%s", user_id)
    return Response(status_code=204)
