from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient

from app.core.config import settings


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    return PyJWKClient(str(settings.supabase_jwks_url))


def _verify_jwt(token: str) -> dict:
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            leeway=10,
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _verify_jwt(authorization[len("Bearer ") :])


CurrentUser = Annotated[dict, Depends(current_user)]


def require_admin(user: CurrentUser) -> dict:
    """Admin gate (v6.6, ADR 0025): a verified user whose `sub` is in the
    ADMIN_USER_IDS env allowlist. 403 otherwise. Enforced on every /admin/*
    endpoint so the credit-mutating ones are locked server-side, not just
    hidden in the UI."""
    if user.get("sub") not in settings.admin_user_id_list:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin only")
    return user


RequireAdmin = Annotated[dict, Depends(require_admin)]
