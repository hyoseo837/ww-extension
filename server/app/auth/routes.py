from fastapi import APIRouter

from app.auth.dependency import CurrentUser

router = APIRouter()


@router.get("/me")
def me(user: CurrentUser) -> dict:
    return {
        "user_id": user.get("sub"),
        "email": user.get("email"),
    }
