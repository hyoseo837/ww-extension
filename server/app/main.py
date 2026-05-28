from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.auth.routes import router as auth_router
from app.billing import db as billing_db
from app.billing.routes import router as billing_router
from app.core.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await billing_db.init_pool()
    try:
        yield
    finally:
        await billing_db.close_pool()


app = FastAPI(title="ww-extension-backend", lifespan=lifespan)
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(billing_router)
