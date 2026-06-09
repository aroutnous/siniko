"""Réinitialise les permissions utilisateur (nouveau référentiel).

Revision ID: 005_update_permissions
Revises: 004_utilisateur_permissions
Create Date: 2026-06-09

"""

from collections.abc import Sequence

from alembic import op

revision: str = "005_update_permissions"
down_revision: str | None = "004_utilisateur_permissions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DELETE_ALL_PERMISSIONS = "DELETE FROM utilisateur_permissions"


def upgrade() -> None:
    op.execute(_DELETE_ALL_PERMISSIONS)


def downgrade() -> None:
    pass
