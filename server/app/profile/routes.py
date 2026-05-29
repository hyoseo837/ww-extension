"""GET / PUT /profile — server-authoritative CV text + preferences.

No credit cost. POST /profile/extract lives in scoring/routes.py
because it shares the estimate-debit-refund machinery with /scan.
"""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth.dependency import CurrentUser
from app.profile import db as profile_db

router = APIRouter()


# ── Structured match criteria (v5.0.0, ADR 0013) ────────────────────────────
#
# Stored as the `match_criteria` JSONB column. Shape owned/validated here;
# the DB only guarantees valid JSON. All fields optional/defaulted so a
# partial object is valid and an empty {} round-trips. The free-form
# `preferences` text (below) is re-purposed unchanged as "additional notes".


class WeightedCriterion(BaseModel):
    """One graded preference: how heavily it counts (weight) plus up to four
    value tiers the LLM maps a posting against. Values are user-entered
    strings (e.g. "West Canada"), so no enum constrains them."""

    weight: Literal["must", "strong", "nice-to-have"] = "nice-to-have"
    preferred: list[str] = []   # ideal — full marks
    acceptable: list[str] = []  # fine — no penalty
    avoid: list[str] = []       # allowed but penalized
    excluded: list[str] = []    # never — basis for a future hard Skip (#4)


class MatchCriteria(BaseModel):
    # Eligibility fact, not a preference — no weight/tiers. Unset = unknown.
    work_authorization: Literal["citizen", "pr", "international", "other"] | None = None

    # Weighted, graded preferences. Each defaults to an empty criterion
    # (no preference, no effect).
    preferred_locations: WeightedCriterion = WeightedCriterion()
    work_modes: WeightedCriterion = WeightedCriterion()
    target_term: WeightedCriterion = WeightedCriterion()
    target_length: WeightedCriterion = WeightedCriterion()
    languages: WeightedCriterion = WeightedCriterion()  # spoken/working, not programming


class Profile(BaseModel):
    cv_text: str
    preferences: str  # re-purposed as "additional notes" (ADR 0013)
    match_criteria: MatchCriteria = MatchCriteria()


class ProfileUpdate(BaseModel):
    # All optional — PUT can patch any field independently.
    cv_text: str | None = None
    preferences: str | None = None
    match_criteria: MatchCriteria | None = None


@router.get("/profile", response_model=Profile)
async def get_profile(user: CurrentUser) -> Profile:
    data = await profile_db.get_profile(user["sub"])
    return Profile(**data)


@router.put("/profile", response_model=Profile)
async def put_profile(req: ProfileUpdate, user: CurrentUser) -> Profile:
    data = await profile_db.upsert_profile(
        user["sub"],
        cv_text=req.cv_text,
        preferences=req.preferences,
        match_criteria=(
            req.match_criteria.model_dump() if req.match_criteria is not None else None
        ),
    )
    return Profile(**data)
