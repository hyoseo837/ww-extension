"""POST /scan — billable Gemini scoring with estimate/debit/refund."""

import logging
import time
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.dependency import CurrentUser
from app.billing import db as billing_db, pricing
from app.scoring import gemini

router = APIRouter()
log = logging.getLogger("ww.scan")


class ScanMeta(BaseModel):
    title: str = ""
    org: str = ""


class ScanRequest(BaseModel):
    scan_id: UUID
    model: str
    meta: ScanMeta
    description_text: str
    posting_id: str
    # cv_text / preferences are inline here in v4.4.0; v4.4.2 will move
    # them server-side via the user_profile table.
    cv_text: str
    preferences: str = ""


class ScanResult(BaseModel):
    score: int
    verdict: str
    reason: str


class ScanResponse(BaseModel):
    result: ScanResult
    cost: float = Field(..., description="Net debit in credits")
    balance: float = Field(..., description="User's balance after this scan")


class InsufficientCreditsResponse(BaseModel):
    error: str = "insufficient_credits"
    balance: float
    required: float


@router.post(
    "/scan",
    response_model=ScanResponse,
    responses={402: {"model": InsufficientCreditsResponse}},
)
async def scan(req: ScanRequest, user: CurrentUser):
    started = time.perf_counter()
    user_id = user["sub"]

    if req.model not in pricing.supported_models():
        raise HTTPException(status_code=400, detail=f"unsupported model: {req.model}")

    job_part = gemini.build_job_part(
        meta=req.meta.model_dump(), description_text=req.description_text, preferences=req.preferences
    )
    estimated_input = pricing.estimate_input_tokens(req.cv_text, job_part)
    estimate = pricing.estimate_scan_cost(req.model, estimated_input)

    pool = billing_db.pool()

    # --- Transaction 1: reserve credits or replay idempotent retry. ---
    pre_started = time.perf_counter()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await billing_db.insert_scan_pending(
                conn,
                scan_id=req.scan_id,
                user_id=user_id,
                model=req.model,
                kind="scan",
                posting_id=req.posting_id,
                estimated_cost=estimate,
            )
            if existing is not None:
                return await _replay(existing, user_id)

            remaining = await billing_db.balance_after_estimate(conn, user_id, estimate)
            if remaining < 0:
                # Mark the scan failed and short-circuit. No ledger row written.
                await billing_db.update_scan_failed(
                    conn, scan_id=req.scan_id, error="insufficient_credits"
                )
                current_balance = remaining + estimate
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail={
                        "error": "insufficient_credits",
                        "balance": float(current_balance),
                        "required": float(estimate),
                    },
                )

            await billing_db.insert_ledger_entry(
                conn,
                user_id=user_id,
                delta=-estimate,
                kind="scan_debit",
                ref=str(req.scan_id),
            )
    db_pre_ms = int((time.perf_counter() - pre_started) * 1000)

    # --- Gemini call (no DB lock held). ---
    gemini_started = time.perf_counter()
    try:
        result, usage = await gemini.score(
            model=req.model, cv_text=req.cv_text, job_part=job_part
        )
    except gemini.GeminiError as exc:
        # --- Transaction 2a: full refund + mark failed. ---
        async with pool.acquire() as conn:
            async with conn.transaction():
                await billing_db.insert_ledger_entry(
                    conn,
                    user_id=user_id,
                    delta=estimate,
                    kind="scan_refund",
                    ref=str(req.scan_id),
                )
                await billing_db.update_scan_failed(
                    conn, scan_id=req.scan_id, error=str(exc)
                )
        log.warning(
            "scan_failed scan_id=%s model=%s error=%s",
            req.scan_id, req.model, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "gemini_failed", "message": str(exc)},
        )
    gemini_ms = int((time.perf_counter() - gemini_started) * 1000)

    # --- Transaction 2b: refund unused portion + record success. ---
    actual = pricing.actual_cost(req.model, usage)
    refund = estimate - actual if estimate > actual else Decimal(0)
    post_started = time.perf_counter()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if refund > 0:
                await billing_db.insert_ledger_entry(
                    conn,
                    user_id=user_id,
                    delta=refund,
                    kind="scan_refund",
                    ref=str(req.scan_id),
                )
            await billing_db.update_scan_success(
                conn,
                scan_id=req.scan_id,
                actual_cost=actual,
                response=result,
                usage=usage,
            )
        new_balance = await billing_db.get_balance(user_id)
    db_post_ms = int((time.perf_counter() - post_started) * 1000)

    total_ms = int((time.perf_counter() - started) * 1000)
    log.info(
        "scan_ok scan_id=%s model=%s total_ms=%d db_pre_ms=%d gemini_ms=%d db_post_ms=%d cost=%s",
        req.scan_id, req.model, total_ms, db_pre_ms, gemini_ms, db_post_ms, actual,
    )

    return ScanResponse(
        result=ScanResult(**result),
        cost=float(actual),
        balance=float(new_balance),
    )


async def _replay(existing: dict, user_id: str) -> ScanResponse:
    """Return the original response for an idempotent retry.

    Pending rows (race: same scan_id re-fired before the first
    finished) and failed rows return 409; the client can decide
    whether to wait, give up, or fire a fresh scan_id."""
    if existing["status"] != "success":
        raise HTTPException(
            status_code=409,
            detail={"error": "scan_in_progress_or_failed", "status": existing["status"]},
        )
    result = existing["response"]
    if isinstance(result, str):
        import json
        result = json.loads(result)
    balance = await billing_db.get_balance(user_id)
    return ScanResponse(
        result=ScanResult(**result),
        cost=float(existing["actual_cost"]),
        balance=float(balance),
    )
