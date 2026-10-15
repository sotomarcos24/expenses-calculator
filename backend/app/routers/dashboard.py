from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.db import DbSession
from app.schemas.dashboard import Dashboard
from app.security import CurrentUser
from app.services import dashboard as service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(
    user: CurrentUser,
    db: DbSession,
    date_from: Annotated[date, Query(alias="from")],
    date_to: Annotated[date, Query(alias="to")],
) -> Dashboard:
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="'from' must be on or before 'to'",
        )
    return service.build_dashboard(db, user.id, date_from, date_to)
