from contextlib import asynccontextmanager
from importlib.metadata import version

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.account.routes import router as account_router
from app.admin.routes import router as admin_router
from app.auth.routes import router as auth_router
from app.billing import db as billing_db
from app.billing.routes import router as billing_router
from app.core.config import settings
from app.core.health import router as health_router
from app.profile.routes import router as profile_router
from app.scoring import gemini
from app.scoring.routes import router as scoring_router


# Error monitoring (v8.10, ADR 0049) — errors only, no tracing, inert
# without a DSN.
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        release=version("ww-extension-backend"),
        send_default_pii=False,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    await billing_db.init_pool()
    # Refund any scan stranded 'pending' by the previous process's death —
    # stranding only happens when the process dies, so startup is exactly
    # when the recovery is due (ADR 0047).
    await billing_db.reconcile_stranded_scans()
    await gemini.init_client()
    try:
        yield
    finally:
        await gemini.close_client()
        await billing_db.close_pool()


app = FastAPI(title="ww-extension-backend", lifespan=lifespan)

# Reject oversized bodies before FastAPI buffers and parses them (audit
# 2026-06-11 #5). 8 MiB clears the largest legal body — a 5 MB PDF as
# base64 plus JSON overhead.
_MAX_BODY_BYTES = 8 * 1024 * 1024


def body_too_large(content_length: str | None) -> bool:
    return bool(
        content_length
        and content_length.isdigit()
        and int(content_length) > _MAX_BODY_BYTES
    )


# Registered before CORSMiddleware so CORS stays outermost and a 413 still
# carries the CORS headers the web app needs to read it.
@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    if body_too_large(request.headers.get("content-length")):
        return JSONResponse(status_code=413, content={"detail": "request_too_large"})
    return await call_next(request)


# CORS for the web app (v6.1). Bearer-token auth, no cookies → credentials off.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=False,
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(profile_router)
app.include_router(scoring_router)
app.include_router(admin_router)
app.include_router(account_router)
