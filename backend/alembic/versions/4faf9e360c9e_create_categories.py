"""create categories

Revision ID: 4faf9e360c9e
Revises: 555b346a3f7c
Create Date: 2026-10-14 10:27:55.770254

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4faf9e360c9e"
down_revision: str | Sequence[str] | None = "555b346a3f7c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "categories",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        # Non-native enum: a VARCHAR plus the CHECK constraint below (no CREATE TYPE on Postgres).
        sa.Column("kind", sa.String(length=7), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("kind IN ('income', 'expense')", name=op.f("ck_categories_kind")),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["categories.id"],
            name=op.f("fk_categories_parent_id_categories"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_categories_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
        sa.UniqueConstraint(
            "user_id", "kind", "parent_id", "name", name=op.f("uq_categories_user_id")
        ),
    )
    op.create_index(op.f("ix_categories_parent_id"), "categories", ["parent_id"], unique=False)
    op.create_index(op.f("ix_categories_user_id"), "categories", ["user_id"], unique=False)
    # Written by hand: autogenerate does not render expression/partial indexes.
    # Top-level names are unique per user and kind, ignoring case (NULL parent_ids are distinct,
    # so the unique constraint above does not cover them).
    op.create_index(
        op.f("uq_categories_top_level_name"),
        "categories",
        ["user_id", "kind", sa.text("lower(name)")],
        unique=True,
        sqlite_where=sa.text("parent_id IS NULL"),
        postgresql_where=sa.text("parent_id IS NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("uq_categories_top_level_name"), table_name="categories")
    op.drop_index(op.f("ix_categories_user_id"), table_name="categories")
    op.drop_index(op.f("ix_categories_parent_id"), table_name="categories")
    op.drop_table("categories")
