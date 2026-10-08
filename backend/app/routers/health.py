from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.db import DbSession

router = APIRouter(tags=["health"])


class HealthOut(BaseModel):
    status: str
    database: str


@router.get("/health")
def health(db: DbSession) -> HealthOut:
    db.execute(text("SELECT 1"))
    return HealthOut(status="ok", database="ok")
