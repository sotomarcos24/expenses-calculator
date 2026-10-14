from fastapi import APIRouter, HTTPException, status

from app.db import DbSession
from app.schemas.investments import (
    InvestmentCreate,
    InvestmentList,
    InvestmentRead,
    InvestmentUpdate,
)
from app.security import CurrentUser
from app.services import investments as service

router = APIRouter(prefix="/investments", tags=["investments"])

INVESTMENT_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="Investment not found"
)


@router.get("")
def list_investments(user: CurrentUser, db: DbSession) -> InvestmentList:
    investments = service.list_investments(db, user.id)
    return InvestmentList(
        items=[service.to_read(investment) for investment in investments],
        totals=service.compute_totals(investments),
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_investment(body: InvestmentCreate, user: CurrentUser, db: DbSession) -> InvestmentRead:
    return service.to_read(service.create_investment(db, user.id, body))


@router.get("/{investment_id}")
def get_investment(investment_id: int, user: CurrentUser, db: DbSession) -> InvestmentRead:
    try:
        investment = service.get_investment(db, user.id, investment_id)
    except service.InvestmentNotFoundError:
        raise INVESTMENT_NOT_FOUND from None
    return service.to_read(investment)


@router.patch("/{investment_id}")
def update_investment(
    investment_id: int, body: InvestmentUpdate, user: CurrentUser, db: DbSession
) -> InvestmentRead:
    try:
        investment = service.update_investment(db, user.id, investment_id, body)
    except service.InvestmentNotFoundError:
        raise INVESTMENT_NOT_FOUND from None
    return service.to_read(investment)


@router.delete("/{investment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_investment(investment_id: int, user: CurrentUser, db: DbSession) -> None:
    try:
        service.delete_investment(db, user.id, investment_id)
    except service.InvestmentNotFoundError:
        raise INVESTMENT_NOT_FOUND from None
