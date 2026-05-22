"""Schéma initial (vide — les tables métier arrivent par migrations ultérieures).

Revision ID: 0001
Revises:
Create Date: 2026-05-22

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Migration initiale — aucune table métier pour l'instant."""
    pass


def downgrade() -> None:
    """Rollback de la migration initiale."""
    pass
