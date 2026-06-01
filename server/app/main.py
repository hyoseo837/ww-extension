from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    await billing_db.init_pool()
    await gemini.init_client()
    try:
        yield
    finally:
        await gemini.close_client()
        await billing_db.close_pool()


app = FastAPI(title="ww-extension-backend", lifespan=lifespan)

# CORS for the web app (v6.1). Bearer-token auth, no cookies → credentials off.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
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
