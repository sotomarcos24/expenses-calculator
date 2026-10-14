"""create transactions

Revision ID: 6061000eeaed
Revises: 4faf9e360c9e
Create Date: 2026-10-14 11:30:40.650366

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6061000eeaed"
down_revision: str | Sequence[str] | None = "4faf9e360c9e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "transactions",
        sa.Column("user_id", sa.Integer(), nullable=False),
        # Non-native enum like categories.kind: a VARCHAR plus the CHECK constraint below.
        sa.Column("type", sa.String(length=7), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("gross_amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("subcategory_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        # Written by hand: autogenerate does not render expression CHECKs reliably.
        sa.CheckConstraint("type IN ('income', 'expense')", name=op.f("ck_transactions_type")),
        sa.CheckConstraint("amount > 0", name=op.f("ck_transactions_amount_positive")),
        sa.CheckConstraint(
            "gross_amount IS NULL OR gross_amount >= amount",
            name=op.f("ck_transactions_gross_amount_gte_amount"),
        ),
        sa.CheckConstraint(
            "gross_amount IS NULL OR type = 'income'",
            name=op.f("ck_transactions_gross_amount_income_only"),
        ),
        # Category FKs are NO ACTION on purpose (no ondelete): a category in use cannot be
        # deleted, while a user delete still cascades to categories and transactions.
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_transactions_category_id_categories"),
        ),
        sa.ForeignKeyConstraint(
            ["subcategory_id"],
            ["categories.id"],
            name=op.f("fk_transactions_subcategory_id_categories"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_transactions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transactions")),
    )
    op.create_index(
        "ix_transactions_user_id_date", "transactions", ["user_id", "date"], unique=False
    )
    op.create_index("ix_transactions_category_id", "transactions", ["category_id"], unique=False)
    op.create_index(
        "ix_transactions_subcategory_id", "transactions", ["subcategory_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_transactions_subcategory_id", table_name="transactions")
    op.drop_index("ix_transactions_category_id", table_name="transactions")
    op.drop_index("ix_transactions_user_id_date", table_name="transactions")
    op.drop_table("transactions")
