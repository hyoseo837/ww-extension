"""GET / PUT /profile — server-authoritative CV text + preferences.

No credit cost. POST /profile/extract lives in scoring/routes.py
because it shares the estimate-debit-refund machinery with /scan.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth.dependency import CurrentUser
from app.profile import db as profile_db

router = APIRouter()


class Profile(BaseModel):
    cv_text: str
    preferences: str


class ProfileUpdate(BaseModel):
    # Both optional — PUT can patch either field independently.
    cv_text: str | None = None
    preferences: str | None = None


@router.get("/profile", response_model=Profile)
async def get_profile(user: CurrentUser) -> Profile:
    data = await profile_db.get_profile(user["sub"])
    return Profile(**data)


@router.put("/profile", response_model=Profile)
async def put_profile(req: ProfileUpdate, user: CurrentUser) -> Profile:
    data = await profile_db.upsert_profile(
        user["sub"], cv_text=req.cv_text, preferences=req.preferences
    )
    return Profile(**data)
