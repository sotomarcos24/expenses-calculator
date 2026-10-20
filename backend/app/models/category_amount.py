from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CategoryAmount(TimestampMixin, Base):
    """A fixed monthly net amount for a category or subcategory, valid for every month."""

    __tablename__ = "category_amounts"
    # Constraint names are completed by NAMING_CONVENTION: ck_category_amounts_<name>.
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        UniqueConstraint("user_id", "category_id", "subcategory_id"),
        # The UniqueConstraint cannot cover the NULL subcategory case (NULLs are distinct).
        Index(
            "uq_category_amounts_user_id_category_id_no_subcategory",
            "user_id",
            "category_id",
            unique=True,
            sqlite_where=text("subcategory_id IS NULL"),
            postgresql_where=text("subcategory_id IS NULL"),
        ),
        Index("ix_category_amounts_user_id", "user_id"),
        Index("ix_category_amounts_category_id", "category_id"),
        Index("ix_category_amounts_subcategory_id", "subcategory_id"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # NO ACTION (no ondelete) like transactions: a user delete still cascades in one statement.
    # No back-reference on Category, for the same reason.
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    subcategory_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    note: Mapped[str | None] = mapped_column(String(500))
