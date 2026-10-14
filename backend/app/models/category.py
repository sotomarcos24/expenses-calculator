import enum
from typing import Optional

from sqlalchemy import Enum, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class CategoryKind(enum.StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


class Category(TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "kind", "parent_id", "name"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    # Non-native enum: stored as the lowercase value in a VARCHAR with a named CHECK constraint,
    # so Postgres needs no CREATE TYPE.
    kind: Mapped[CategoryKind] = mapped_column(
        Enum(
            CategoryKind,
            native_enum=False,
            create_constraint=True,
            name="kind",
            length=7,
            values_callable=lambda kinds: [kind.value for kind in kinds],
        )
    )
    # NULL = top-level category; set = subcategory.
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), index=True
    )

    parent: Mapped[Optional["Category"]] = relationship(
        back_populates="subcategories", remote_side="Category.id"
    )
    subcategories: Mapped[list["Category"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Category.id",
    )


# Top-level names are unique per user and kind, ignoring case. The UniqueConstraint above cannot
# enforce this because NULL parent_ids are distinct; subcategory case-insensitivity is checked in
# the service layer.
Index(
    "uq_categories_top_level_name",
    Category.user_id,
    Category.kind,
    func.lower(Category.name),
    unique=True,
    sqlite_where=Category.parent_id.is_(None),
    postgresql_where=Category.parent_id.is_(None),
)
