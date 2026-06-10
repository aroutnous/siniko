"""Statut abonnement resilie + emetteur sur notifications plateforme.

Revision ID: 007_platform_resilie
Revises: 006_enseignants
Create Date: 2026-06-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "007_platform_resilie"
down_revision: str | None = "006_enseignants"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE statut_abonnement ADD VALUE IF NOT EXISTS 'resilie'")
    op.add_column(
        "notifications_plateforme",
        sa.Column(
            "emetteur_id",
            UUID(as_uuid=True),
            sa.ForeignKey("utilisateurs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_notifications_plateforme_emetteur_id",
        "notifications_plateforme",
        ["emetteur_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notifications_plateforme_emetteur_id",
        table_name="notifications_plateforme",
    )
    op.drop_column("notifications_plateforme", "emetteur_id")
