from fastapi import FastAPI

from app.config import get_settings
from app.middleware import RequireJsonContentTypeMiddleware
from app.routers import (
    auth,
    categories,
    dashboard,
    health,
    investments,
    simulator,
    transactions,
)


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{get_settings().app_name} API",
        version="0.1.0",
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
        redoc_url=None,
    )
    app.add_middleware(RequireJsonContentTypeMiddleware)
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(categories.router, prefix="/api")
    app.include_router(transactions.router, prefix="/api")
    app.include_router(investments.router, prefix="/api")
    app.include_router(dashboard.router, prefix="/api")
    app.include_router(simulator.router, prefix="/api")
    return app


app = create_app()
