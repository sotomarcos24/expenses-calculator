"""create investments

Revision ID: 2d10786f0a3e
Revises: 6061000eeaed
Create Date: 2026-10-14 17:35:37.851899

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2d10786f0a3e"
down_revision: str | Sequence[str] | None = "6061000eeaed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "investments",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        # Non-native enum like categories.kind: a VARCHAR plus the CHECK constraint below.
        sa.Column("type", sa.String(length=11), nullable=False),
        # Optional: NULL = no platform.
        sa.Column("platform", sa.String(length=100), nullable=True),
        sa.Column("amount_invested", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("current_value", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("value_updated_at", sa.Date(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        # Written by hand: autogenerate duplicates the enum CHECK and renders it unnamed.
        sa.CheckConstraint(
            "type IN ('stock', 'fund', 'etf', 'crypto', 'deposit', 'real_estate', 'other')",
            name=op.f("ck_investments_type"),
        ),
        sa.CheckConstraint(
            "amount_invested >= 0", name=op.f("ck_investments_amount_invested_non_negative")
        ),
        sa.CheckConstraint(
            "current_value >= 0", name=op.f("ck_investments_current_value_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_investments_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_investments")),
    )
    op.create_index("ix_investments_user_id", "investments", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_investments_user_id", table_name="investments")
    op.drop_table("investments")
