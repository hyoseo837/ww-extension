"""Billable Gemini calls — POST /scan and POST /profile/extract.

Both endpoints follow the same estimate-debit-call-refund pattern. The
metering happens inside a transaction that closes before the Gemini
call so the row lock doesn't span the 1–10s external API latency.
"""

import base64
import logging
import time
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.dependency import CurrentUser
from app.billing import db as billing_db, pricing
from app.core import ratelimit
from app.profile import db as profile_db
from app.scoring import gemini

router = APIRouter()
log = logging.getLogger("ww.scan")

_MAX_PDF_BYTES = 5 * 1024 * 1024
# Server-side input caps (v8.9, audit #5) — the client caps were the only
# bound before. 6000 mirrors the extension's DESC_CHAR_CAP; pdf_b64 is the
# 5 MB PDF cap in base64 (4/3×) with slack.
_MAX_DESC_CHARS = 6000
_MAX_META_CHARS = 300
_MAX_PDF_B64_CHARS = 7_000_000


# ── /scan ─────────────────────────────────────────────────────────────────────


class ScanMeta(BaseModel):
    title: str = Field("", max_length=_MAX_META_CHARS)
    org: str = Field("", max_length=_MAX_META_CHARS)


class ScanRequest(BaseModel):
    scan_id: UUID
    # Optional since v8.11: the server owns the default so retiring a Gemini
    # model is a deploy, not a Web Store review cycle.
    model: str = pricing.DEFAULT_MODEL
    meta: ScanMeta
    description_text: str = Field(..., max_length=_MAX_DESC_CHARS)
    posting_id: str = Field(..., max_length=32)
    batch_id: UUID | None = None  # groups scans from one Scan run (v6.2)


class BreakdownItem(BaseModel):
    point: str
    effect: Literal["plus", "minus"]


class ScanResult(BaseModel):
    score: int                          # 1–20 (ADR 0017)
    verdict: str                        # server-derived from score
    reason: str
    breakdown: list[BreakdownItem] = []


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
            profile_context = gemini.build_profile_context(
                profile["profile_json"],
                profile["profile_supplement"],
                profile["cv_text"],
            )
            if not profile_context.strip():
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
            estimated_input = pricing.estimate_input_tokens(profile_context, job_part)
            estimate = pricing.estimate_scan_cost(req.model, estimated_input)

            existing = await billing_db.insert_scan_pending(
                conn,
                scan_id=req.scan_id,
                user_id=user_id,
                model=req.model,
                kind="scan",
                posting_id=req.posting_id,
                estimated_cost=estimate,
                title=req.meta.title or None,
                org=req.meta.org or None,
                batch_id=str(req.batch_id) if req.batch_id else None,
            )
            if existing is not None:
                return await _replay(existing, user_id)

            # Serialize concurrent debits per user so the balance check
            # can't be raced past (v8.9); released at commit.
            await billing_db.lock_user_for_debit(conn, user_id)
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
            model=req.model, cv_text=profile_context, job_part=job_part
        )
        # Derive the verdict from the score + exclusion flag (ADR 0017) and fold
        # it into the result so the stored row + replays carry the full shape.
        result["verdict"] = gemini.verdict_for(result["score"], result.get("excluded", False))
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


# ── /scan/feedback ────────────────────────────────────────────────────────────


_MAX_COMMENT_CHARS = 500


class FeedbackRequest(BaseModel):
    scan_id: UUID
    rating: Literal["up", "down"]
    # Parse-time caps reject abuse; the friendlier truncation to
    # _MAX_COMMENT_CHARS / _MAX_DESC_CHARS below still applies.
    comment: str = Field("", max_length=2000)
    description_text: str = Field("", max_length=8000)


@router.post("/scan/feedback")
async def scan_feedback(req: FeedbackRequest, user: CurrentUser) -> dict:
    """Record the user's verdict on a scored posting (ADR 0044).

    Upserts one row per scan — latest verdict wins. The posting description
    is stored only on 👎, where it's needed to debug the score.
    """
    user_id = user["sub"]
    # Free endpoint; 30/min covers honest voting through a scored batch
    # (v8.10, audit #6).
    ratelimit.check("feedback", user_id, limit=30)
    comment = req.comment.strip()[:_MAX_COMMENT_CHARS] or None
    description = (
        req.description_text.strip()[:_MAX_DESC_CHARS] or None
        if req.rating == "down" else None
    )

    async with billing_db.pool().acquire() as conn:
        owns = await conn.fetchval(
            "select 1 from scan "
            "where id = $1 and user_id = $2::uuid "
            "  and kind = 'scan' and status = 'success'",
            req.scan_id, user_id,
        )
        if not owns:
            raise HTTPException(status_code=404, detail="scan not found")
        await conn.execute(
            """
            insert into scan_feedback
              (scan_id, user_id, rating, comment, description_text)
            values ($1, $2::uuid, $3, $4, $5)
            on conflict (scan_id) do update set
              rating = excluded.rating,
              comment = excluded.comment,
              description_text = excluded.description_text,
              updated_at = now()
            """,
            req.scan_id, user_id, req.rating, comment, description,
        )

    log.info("scan_feedback scan_id=%s rating=%s", req.scan_id, req.rating)
    return {"ok": True}


# ── /profile/extract ──────────────────────────────────────────────────────────


class ExtractRequest(BaseModel):
    scan_id: UUID
    model: str = pricing.DEFAULT_MODEL
    pdf_b64: str = Field(
        ..., max_length=_MAX_PDF_B64_CHARS, description="Base64 PDF (no data: prefix)"
    )


class ExtractResponse(BaseModel):
    profile: dict  # structured profile (v5.1.0)
    text: str      # readable serialization of `profile`, for display/back-compat
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

            await billing_db.lock_user_for_debit(conn, user_id)
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
        profile_json, usage = await gemini.extract_profile(
            model=req.model, pdf_b64=req.pdf_b64
        )
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
            await profile_db.upsert_profile_json_in_tx(conn, user_id, profile_json)
            await billing_db.update_scan_success(
                conn,
                scan_id=req.scan_id,
                actual_cost=actual,
                response={"fields": len(profile_json)},  # don't blow up the row with the profile
                usage=usage,
            )
        new_balance = await billing_db.get_balance(user_id)

    # Readable serialization of the structured profile, for display/back-compat.
    text = gemini.build_profile_context(profile_json, [], "")
    total_ms = int((time.perf_counter() - started) * 1000)
    log.info(
        "extract_ok scan_id=%s model=%s total_ms=%d fields=%d cost=%s",
        req.scan_id, req.model, total_ms, len(profile_json), actual,
    )

    return ExtractResponse(
        profile=profile_json, text=text, cost=float(actual), balance=float(new_balance)
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
    # The profile isn't stored on the scan row (would bloat it); read it from
    # user_profile, which the original extract upserted into profile_json.
    profile = await profile_db.get_profile(user_id)
    profile_json = profile["profile_json"]
    return ExtractResponse(
        profile=profile_json,
        text=gemini.build_profile_context(profile_json, [], ""),
        cost=float(existing["actual_cost"]),
        balance=float(await billing_db.get_balance(user_id)),
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
            # Friend-invitation bonus (v8.12, ADR 0050): no-op without an
            # attribution row; at most once per invitee via partial index.
            await billing_db.grant_referral_bonus(conn, user_id)
        return await billing_db.get_balance(user_id)
