"""audit_logs.tenant_id nullable pour journaux sans contexte tenant.

Revision ID: 002_audit_nullable
Revises: 001_initial
Create Date: 2026-06-04

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "002_audit_nullable"
down_revision: str | None = "001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "audit_logs",
        "tenant_id",
        existing_type=sa.UUID(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "audit_logs",
        "tenant_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
