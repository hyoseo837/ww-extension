from fastapi import APIRouter

from app.auth.dependency import CurrentUser
from app.billing import db

router = APIRouter()


@router.get("/credits/balance")
async def balance(user: CurrentUser) -> dict[str, float]:
    bal = await db.get_balance(user["sub"])
    # Decimal → float for JSON transport. NUMERIC keeps exact value on the
    # DB side; transport precision is more than sufficient for display.
    return {"balance": float(bal)}
