import enum
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class InvestmentType(enum.StrEnum):
    STOCK = "stock"
    FUND = "fund"
    ETF = "etf"
    CRYPTO = "crypto"
    DEPOSIT = "deposit"
    REAL_ESTATE = "real_estate"
    OTHER = "other"


class Investment(TimestampMixin, Base):
    __tablename__ = "investments"
    # Constraint names are completed by NAMING_CONVENTION: ck_investments_<name>.
    __table_args__ = (
        CheckConstraint("amount_invested >= 0", name="amount_invested_non_negative"),
        CheckConstraint("current_value >= 0", name="current_value_non_negative"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    # Stored like Category.kind: the lowercase value in a VARCHAR with a named CHECK constraint.
    type: Mapped[InvestmentType] = mapped_column(
        Enum(
            InvestmentType,
            native_enum=False,
            create_constraint=True,
            name="type",
            length=11,
            values_callable=lambda types: [type_.value for type_ in types],
        )
    )
    # Optional: NULL = no platform (e.g. real estate or a deposit held directly).
    platform: Mapped[str | None] = mapped_column(String(100))
    amount_invested: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    current_value: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    # Date of the last manual update of current_value.
    value_updated_at: Mapped[date] = mapped_column(Date)
