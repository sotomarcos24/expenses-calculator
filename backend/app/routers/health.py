from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text

from app.config import Settings, get_settings
from app.db import DbSession

router = APIRouter(tags=["health"])


class HealthOut(BaseModel):
    status: str
    database: str
    commit: str


@router.get("/health")
def health(db: DbSession, settings: Annotated[Settings, Depends(get_settings)]) -> HealthOut:
    db.execute(text("SELECT 1"))
    commit = settings.render_git_commit.strip() or "unknown"
    return HealthOut(status="ok", database="ok", commit=commit)
