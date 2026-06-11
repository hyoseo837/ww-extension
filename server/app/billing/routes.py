import logging
from decimal import Decimal
from typing import Any, Literal

import stripe
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.auth.dependency import CurrentUser
from app.billing import db, payments
from app.core import ratelimit

router = APIRouter()
log = logging.getLogger("ww.billing")


@router.get("/credits/balance")
async def balance(user: CurrentUser) -> dict[str, float]:
    bal = await db.get_balance(user["sub"])
    # Decimal → float for JSON transport. NUMERIC keeps exact value on the
    # DB side; transport precision is more than sufficient for display.
    return {"balance": float(bal)}


@router.get("/credits/history")
async def history(user: CurrentUser, limit: int = 50, offset: int = 0) -> dict[str, Any]:
    """Paginated credit-ledger history, newest-first (v6.2)."""
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    rows = await db.get_history(user["sub"], limit, offset)
    entries = [
        {
            "id": str(r["id"]),
            "kind": r["kind"],
            "delta": float(r["delta"]),
            "created_at": r["created_at"].isoformat(),
            "org": r["org"],
            "title": r["title"],
            "posting_id": r["posting_id"],
            "batch_id": r["batch_id"],
        }
        for r in rows
    ]
    return {"entries": entries, "limit": limit, "offset": offset}


# ── Stripe credit purchase (v4.5) ──────────────────────────────────────────────


class CheckoutRequest(BaseModel):
    package_id: str
    # Selects the post-checkout return (v6.2): "web" returns to the web app,
    # "extension" (default) uses the chrome-extension result shim.
    client: Literal["web", "extension"] = "extension"


@router.post("/credits/checkout")
async def checkout(req: CheckoutRequest, user: CurrentUser) -> dict[str, str]:
    # Each call creates a Stripe session — free to us per call, but not free
    # to hammer (v8.10, audit #6).
    ratelimit.check("checkout", user["sub"], limit=5)
    if req.package_id not in payments.CREDIT_PACKAGES:
        raise HTTPException(status_code=400, detail=f"unknown package: {req.package_id}")
    url = await payments.create_checkout_session(user["sub"], req.package_id, req.client)
    return {"url": url}


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request) -> dict[str, bool]:
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = payments.verify_event(payload, sig)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise HTTPException(status_code=400, detail="invalid_signature") from exc

    if event["type"] == "checkout.session.completed":
        # event.data.object is a stripe.StripeObject — use subscript access,
        # not dict.get() (StripeObject has no .get()).
        session = event["data"]["object"]
        if session["payment_status"] == "paid":
            meta = session["metadata"] or {}
            await db.grant_purchase(
                user_id=meta["user_id"],
                credits=Decimal(meta["credits"]),
                event_id=event["id"],
            )
            log.info(
                "purchase_granted user=%s credits=%s event=%s",
                meta["user_id"], meta["credits"], event["id"],
            )

    # 200 for handled and ignored events so Stripe stops retrying. A raised
    # DB error becomes a 500, which Stripe will retry — the grant is idempotent.
    return {"received": True}


@router.get("/credits/checkout/result", response_class=HTMLResponse)
async def checkout_result(status: str = "success") -> str:
    if status == "cancel":
        msg = "Checkout cancelled. You can close this tab and return to the extension."
    else:
        msg = ("Payment received. You can close this tab and return to the extension — "
               "your credit balance updates within a few seconds.")
    return (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"UTF-8\">"
        "<title>WW Extension — Checkout</title></head>"
        f"<body><p>{msg}</p></body></html>"
    )
