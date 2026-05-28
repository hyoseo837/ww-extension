from importlib.metadata import version

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {
        "service": "ww-extension-backend",
        "version": version("ww-extension-backend"),
        "status": "ok",
    }
