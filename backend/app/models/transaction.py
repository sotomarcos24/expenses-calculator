from datetime import date as date_type
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, Enum, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.category import Category, CategoryKind


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"
    # Constraint names are completed by NAMING_CONVENTION: ck_transactions_<name>.
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint(
            "gross_amount IS NULL OR gross_amount >= amount", name="gross_amount_gte_amount"
        ),
        CheckConstraint("gross_amount IS NULL OR type = 'income'", name="gross_amount_income_only"),
        # The leading user_id column also serves the per-user lookups (tech-spec §4).
        Index("ix_transactions_user_id_date", "user_id", "date"),
        Index("ix_transactions_category_id", "category_id"),
        Index("ix_transactions_subcategory_id", "subcategory_id"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # Stored like Category.kind: the lowercase value in a VARCHAR with a named CHECK constraint.
    type: Mapped[CategoryKind] = mapped_column(
        Enum(
            CategoryKind,
            native_enum=False,
            create_constraint=True,
            name="type",
            length=7,
            values_callable=lambda kinds: [kind.value for kind in kinds],
        )
    )
    date: Mapped[date_type] = mapped_column(Date)
    # Net amount for a salary; gross_amount is only set on income.
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    gross_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # NO ACTION (no ondelete): a category in use cannot be deleted, while deleting a user still
    # cascades to both categories and transactions because the check runs at statement end.
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    subcategory_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    note: Mapped[str | None] = mapped_column(String(500))

    # No back-reference on Category: its default cascade would null category_id on delete and
    # bypass the FK protection.
    category: Mapped[Category] = relationship(foreign_keys=[category_id])
    subcategory: Mapped[Category | None] = relationship(foreign_keys=[subcategory_id])
