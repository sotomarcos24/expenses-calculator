"""Investment business logic: gain/loss, portfolio totals, ``value_updated_at`` and CRUD."""

from collections.abc import Iterable
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Investment
from app.schemas.investments import (
    InvestmentCreate,
    InvestmentRead,
    InvestmentUpdate,
    PortfolioTotals,
)
from app.schemas.money import RATE_STEP

ZERO = Decimal("0.00")


class InvestmentNotFoundError(Exception):
    """The investment does not exist or belongs to another user."""


def today() -> date:
    """The single source of "today" (the server's local date); tests monkeypatch it."""
    return date.today()


def compute_gain(amount_invested: Decimal, current_value: Decimal) -> Decimal:
    """``current_value - amount_invested`` (negative for a loss)."""
    return current_value - amount_invested


def compute_gain_pct(amount_invested: Decimal, current_value: Decimal) -> Decimal | None:
    """``gain / amount_invested`` quantized to 4 decimals half up; ``None`` if nothing invested."""
    if amount_invested == 0:
        return None
    gain = compute_gain(amount_invested, current_value)
    return (gain / amount_invested).quantize(RATE_STEP, rounding=ROUND_HALF_UP)


def compute_totals(investments: Iterable[Investment]) -> PortfolioTotals:
    """Sum every investment with ``Decimal``; ``gain_pct`` is ``None`` when nothing is invested.

    Totals are not stored, so they may exceed NUMERIC(14, 2).
    """
    total_invested = ZERO
    current_value = ZERO
    for investment in investments:
        total_invested += investment.amount_invested
        current_value += investment.current_value
    return PortfolioTotals(
        total_invested=total_invested,
        current_value=current_value,
        gain=compute_gain(total_invested, current_value),
        gain_pct=compute_gain_pct(total_invested, current_value),
    )


def to_read(investment: Investment) -> InvestmentRead:
    return InvestmentRead(
        id=investment.id,
        name=investment.name,
        type=investment.type,
        platform=investment.platform,
        amount_invested=investment.amount_invested,
        current_value=investment.current_value,
        value_updated_at=investment.value_updated_at,
        gain=compute_gain(investment.amount_invested, investment.current_value),
        gain_pct=compute_gain_pct(investment.amount_invested, investment.current_value),
        created_at=investment.created_at,
        updated_at=investment.updated_at,
    )


def get_investment(db: Session, user_id: int, investment_id: int) -> Investment:
    """Return the user's investment, or raise ``InvestmentNotFoundError`` (also for others')."""
    investment = db.scalar(
        select(Investment).where(Investment.id == investment_id, Investment.user_id == user_id)
    )
    if investment is None:
        raise InvestmentNotFoundError
    return investment


def list_investments(db: Session, user_id: int) -> list[Investment]:
    """All the user's investments, by name case-insensitively, then id."""
    query = (
        select(Investment)
        .where(Investment.user_id == user_id)
        .order_by(func.lower(Investment.name), Investment.id)
    )
    return list(db.scalars(query))


def create_investment(db: Session, user_id: int, body: InvestmentCreate) -> Investment:
    investment = Investment(
        user_id=user_id,
        name=body.name,
        type=body.type,
        platform=body.platform,
        amount_invested=body.amount_invested,
        current_value=body.current_value,
        value_updated_at=(body.value_updated_at if body.value_updated_at is not None else today()),
    )
    db.add(investment)
    db.commit()
    db.refresh(investment)
    return investment


def update_investment(
    db: Session, user_id: int, investment_id: int, body: InvestmentUpdate
) -> Investment:
    """Apply a partial update.

    Sending ``current_value`` without ``value_updated_at`` sets ``value_updated_at`` to today,
    even when the value is unchanged (the user confirmed it today). An explicit
    ``value_updated_at`` always wins. Without either field the date is unchanged.
    """
    investment = get_investment(db, user_id, investment_id)
    changes: dict[str, Any] = body.model_dump(exclude_unset=True)
    if not changes:
        return investment
    if "current_value" in changes and "value_updated_at" not in changes:
        changes["value_updated_at"] = today()

    for field, value in changes.items():
        setattr(investment, field, value)
    db.commit()
    db.refresh(investment)
    return investment


def delete_investment(db: Session, user_id: int, investment_id: int) -> None:
    investment = get_investment(db, user_id, investment_id)
    db.delete(investment)
    db.commit()
