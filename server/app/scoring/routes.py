"""Billable Gemini calls — POST /scan and POST /profile/extract.

Both endpoints follow the same estimate-debit-call-refund pattern. The
metering happens inside a transaction that closes before the Gemini
call so the row lock doesn't span the 1–10s external API latency.
"""

import base64
import logging
import time
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.dependency import CurrentUser
from app.billing import db as billing_db, pricing
from app.profile import db as profile_db
from app.scoring import gemini

router = APIRouter()
log = logging.getLogger("ww.scan")

_MAX_PDF_BYTES = 5 * 1024 * 1024


# ── /scan ─────────────────────────────────────────────────────────────────────


class ScanMeta(BaseModel):
    title: str = ""
    org: str = ""


class ScanRequest(BaseModel):
    scan_id: UUID
    model: str
    meta: ScanMeta
    description_text: str
    posting_id: str


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

    pool = billing_db.pool()

    # --- Transaction 1: load profile, reserve credits, or replay retry. ---
    pre_started = time.perf_counter()
    async with pool.acquire() as conn:
        async with conn.transaction():
            profile = await profile_db.get_profile_in_tx(conn, user_id)
            if not profile["cv_text"].strip():
                raise HTTPException(
                    status_code=400,
                    detail={"error": "profile_not_set", "message": "Set up your Profile before scanning."},
                )

            job_part = gemini.build_job_part(
                meta=req.meta.model_dump(),
                description_text=req.description_text,
                preferences=profile["preferences"],
                match_criteria=profile["match_criteria"],
            )
            estimated_input = pricing.estimate_input_tokens(profile["cv_text"], job_part)
            estimate = pricing.estimate_scan_cost(req.model, estimated_input)

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
            model=req.model, cv_text=profile["cv_text"], job_part=job_part
        )
    except gemini.GeminiError as exc:
        await _refund_and_fail(req.scan_id, user_id, estimate, str(exc))
        log.warning(
            "scan_failed scan_id=%s model=%s error=%s",
            req.scan_id, req.model, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "gemini_failed", "message": str(exc)},
        )
    gemini_ms = int((time.perf_counter() - gemini_started) * 1000)

    # --- Transaction 2: partial refund + success row. ---
    actual = pricing.actual_cost(req.model, usage)
    post_started = time.perf_counter()
    new_balance = await _settle_success(
        scan_id=req.scan_id,
        user_id=user_id,
        estimate=estimate,
        actual=actual,
        result=result,
        usage=usage,
    )
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


# ── /profile/extract ──────────────────────────────────────────────────────────


class ExtractRequest(BaseModel):
    scan_id: UUID
    model: str = pricing.DEFAULT_MODEL
    pdf_b64: str = Field(..., description="Base64 PDF (no data: prefix)")


class ExtractResponse(BaseModel):
    text: str
    cost: float
    balance: float


@router.post(
    "/profile/extract",
    response_model=ExtractResponse,
    responses={402: {"model": InsufficientCreditsResponse}},
)
async def extract(req: ExtractRequest, user: CurrentUser):
    started = time.perf_counter()
    user_id = user["sub"]

    if req.model not in pricing.supported_models():
        raise HTTPException(status_code=400, detail=f"unsupported model: {req.model}")

    # Cheap sanity check on size before paying the base64-decode cost.
    # Base64 is ~4/3 the binary size, so cap on the decoded length.
    estimated_bytes = (len(req.pdf_b64) * 3) // 4
    if estimated_bytes > _MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="pdf_too_large")

    # Optional strict validation that input is real base64 — avoids
    # surfacing the failure inside the Gemini call.
    try:
        # validate=True raises on non-base64 chars; don't need the bytes.
        base64.b64decode(req.pdf_b64, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise HTTPException(status_code=400, detail=f"invalid_base64: {exc}") from exc

    estimate = pricing.estimate_extract_cost(req.model, estimated_bytes)
    pool = billing_db.pool()

    # --- Transaction 1: reserve credits or replay. ---
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await billing_db.insert_scan_pending(
                conn,
                scan_id=req.scan_id,
                user_id=user_id,
                model=req.model,
                kind="profile_extract",
                posting_id=None,
                estimated_cost=estimate,
            )
            if existing is not None:
                return await _replay_extract(existing, user_id)

            remaining = await billing_db.balance_after_estimate(conn, user_id, estimate)
            if remaining < 0:
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

    # --- Gemini multimodal call. ---
    try:
        text, usage = await gemini.extract_pdf(model=req.model, pdf_b64=req.pdf_b64)
    except gemini.GeminiError as exc:
        await _refund_and_fail(req.scan_id, user_id, estimate, str(exc))
        log.warning(
            "extract_failed scan_id=%s model=%s error=%s",
            req.scan_id, req.model, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "gemini_failed", "message": str(exc)},
        )

    # --- Transaction 2: partial refund + success row + upsert profile. ---
    actual = pricing.actual_cost(req.model, usage)
    refund = estimate - actual if estimate > actual else Decimal(0)
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
            await profile_db.upsert_cv_text_in_tx(conn, user_id, text)
            await billing_db.update_scan_success(
                conn,
                scan_id=req.scan_id,
                actual_cost=actual,
                response={"text_chars": len(text)},  # don't blow up the row with full text
                usage=usage,
            )
        new_balance = await billing_db.get_balance(user_id)

    total_ms = int((time.perf_counter() - started) * 1000)
    log.info(
        "extract_ok scan_id=%s model=%s total_ms=%d text_chars=%d cost=%s",
        req.scan_id, req.model, total_ms, len(text), actual,
    )

    return ExtractResponse(
        text=text, cost=float(actual), balance=float(new_balance)
    )


# ── helpers ───────────────────────────────────────────────────────────────────


async def _replay(existing: dict, user_id: str) -> ScanResponse:
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


async def _replay_extract(existing: dict, user_id: str) -> ExtractResponse:
    if existing["status"] != "success":
        raise HTTPException(
            status_code=409,
            detail={"error": "scan_in_progress_or_failed", "status": existing["status"]},
        )
    # The original text isn't stored on the scan row (would bloat it); read
    # it from user_profile, which the original extract upserted.
    profile = await profile_db.get_profile(user_id)
    balance = await billing_db.get_balance(user_id)
    return ExtractResponse(
        text=profile["cv_text"],
        cost=float(existing["actual_cost"]),
        balance=float(balance),
    )


async def _refund_and_fail(scan_id: UUID, user_id: str, estimate: Decimal, error: str) -> None:
    async with billing_db.pool().acquire() as conn:
        async with conn.transaction():
            await billing_db.insert_ledger_entry(
                conn,
                user_id=user_id,
                delta=estimate,
                kind="scan_refund",
                ref=str(scan_id),
            )
            await billing_db.update_scan_failed(
                conn, scan_id=scan_id, error=error
            )


async def _settle_success(
    *,
    scan_id: UUID,
    user_id: str,
    estimate: Decimal,
    actual: Decimal,
    result: dict,
    usage: dict,
) -> Decimal:
    refund = estimate - actual if estimate > actual else Decimal(0)
    async with billing_db.pool().acquire() as conn:
        async with conn.transaction():
            if refund > 0:
                await billing_db.insert_ledger_entry(
                    conn,
                    user_id=user_id,
                    delta=refund,
                    kind="scan_refund",
                    ref=str(scan_id),
                )
            await billing_db.update_scan_success(
                conn,
                scan_id=scan_id,
                actual_cost=actual,
                response=result,
                usage=usage,
            )
        return await billing_db.get_balance(user_id)
