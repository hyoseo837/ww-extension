from fastapi import FastAPI

from app.auth.routes import router as auth_router
from app.core.health import router as health_router

app = FastAPI(title="ww-extension-backend")
app.include_router(health_router)
app.include_router(auth_router)
