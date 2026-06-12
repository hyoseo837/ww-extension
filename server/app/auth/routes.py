from fastapi import APIRouter

from app.auth.dependency import CurrentUser
from app.billing import db as billing_db

router = APIRouter()


@router.get("/me")
async def me(user: CurrentUser) -> dict:
    # referral_eligible (v8.12, ADR 0050): whether the web app should show
    # the "Who invited you?" wizard step.
    return {
        "user_id": user.get("sub"),
        "email": user.get("email"),
        "referral_eligible": await billing_db.referral_eligible(
            user.get("sub"), user.get("email") or ""
        ),
    }
