"""Stripe Checkout + webhook helpers (v4.5).

Named payments.py, not stripe.py, so it doesn't shadow the `stripe`
package. Credit packages are in-code constants (no Stripe Dashboard
Products); the dollar amount equals the credit count because
1 credit = $0.01 CAD = 1 cent. See ADR 0012.
"""

import stripe
from fastapi.concurrency import run_in_threadpool

from app.core.config import settings

stripe.api_key = settings.stripe_secret_key

# package_id -> {cad_cents, credits}. Base rate is 1 credit = 1 cent, but
# bigger packs include BONUS credits, so cad_cents != credits above the
# entry tier (ADR 0034). Stripe is charged cad_cents; the ledger is
# granted credits.
CREDIT_PACKAGES: dict[str, dict[str, int]] = {
    "credits_100":  {"cad_cents": 100,  "credits": 100},
    "credits_550":  {"cad_cents": 500,  "credits": 550},
    "credits_1200": {"cad_cents": 1000, "credits": 1200},
}


async def create_checkout_session(
    user_id: str, package_id: str, client: str = "extension"
) -> str:
    """Create a hosted Checkout session for one credit package and return
    its URL. Raises KeyError on an unknown package_id (caller maps to 400).
    The credit amount is taken from CREDIT_PACKAGES, never from the client.

    `client` selects the post-checkout return (v6.2): "web" returns to the
    web app; "extension" (default) uses the chrome-extension result shim.
    """
    pkg = CREDIT_PACKAGES[package_id]
    credits = pkg["credits"]

    if client == "web":
        base = settings.web_app_url.rstrip("/")
        success_url = f"{base}/billing?checkout=success"
        cancel_url = f"{base}/buy?checkout=cancel"
    else:
        base = settings.public_base_url.rstrip("/")
        success_url = f"{base}/credits/checkout/result?status=success"
        cancel_url = f"{base}/credits/checkout/result?status=cancel"

    # The stripe SDK is synchronous and this makes a blocking HTTP call —
    # run it off the event loop.
    session = await run_in_threadpool(
        stripe.checkout.Session.create,
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": "cad",
                "unit_amount": pkg["cad_cents"],
                "product_data": {"name": f"{credits} credits"},
            },
            "quantity": 1,
        }],
        client_reference_id=user_id,
        metadata={"user_id": user_id, "credits": str(credits), "package_id": package_id},
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return session.url


def verify_event(payload: bytes, sig_header: str) -> stripe.Event:
    """Verify the Stripe-Signature header and return the parsed event.
    Raises stripe.SignatureVerificationError / ValueError on a bad
    signature or malformed payload (caller maps to 400). Pure local
    crypto — no network, so no threadpool needed.
    """
    return stripe.Webhook.construct_event(
        payload, sig_header, settings.stripe_webhook_secret
    )
