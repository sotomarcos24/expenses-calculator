from fastapi import FastAPI

from app.config import get_settings
from app.routers import health


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{get_settings().app_name} API",
        version="0.1.0",
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
        redoc_url=None,
    )
    app.include_router(health.router, prefix="/api")
    return app


app = create_app()
