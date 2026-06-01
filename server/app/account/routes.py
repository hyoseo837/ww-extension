"""Data-subject rights endpoints (v6.14+).

GET /account/export — the access / portability right: everything we store
about the caller, returned as one JSON object. No credit cost. Account
deletion (the erasure right, v6.9) is intended to live here too.

The route owns no DB queries of its own: it reuses billing.db for the
ledger/scans/account row and profile.db for the profile.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.auth.dependency import CurrentUser
from app.billing import db as billing_db
from app.profile import db as profile_db

router = APIRouter()


@router.get("/account/export")
async def export_account(user: CurrentUser) -> dict:
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
