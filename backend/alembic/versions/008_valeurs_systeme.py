"""Table valeurs_systeme et seed initial.

Revision ID: 008_valeurs_systeme
Revises: 007_platform_resilie
Create Date: 2026-06-04

"""

from collections.abc import Sequence
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "008_valeurs_systeme"
down_revision: str | None = "007_platform_resilie"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SEED_ROWS: tuple[tuple[str, str, dict, int], ...] = (
    ("cycle", "Jardins d enfants", {}, 1),
    ("cycle", "1er Cycle", {}, 2),
    ("cycle", "2eme Cycle", {}, 3),
    ("classe_predefinie", "Petite Section", {"cycle": "Jardins d enfants"}, 1),
    ("classe_predefinie", "Moyenne Section", {"cycle": "Jardins d enfants"}, 2),
    ("classe_predefinie", "Grande Section", {"cycle": "Jardins d enfants"}, 3),
    ("classe_predefinie", "1ere Annee", {"cycle": "1er Cycle"}, 1),
    ("classe_predefinie", "2eme Annee", {"cycle": "1er Cycle"}, 2),
    ("classe_predefinie", "3eme Annee", {"cycle": "1er Cycle"}, 3),
    ("classe_predefinie", "4eme Annee", {"cycle": "1er Cycle"}, 4),
    ("classe_predefinie", "5eme Annee", {"cycle": "1er Cycle"}, 5),
    ("classe_predefinie", "6eme Annee", {"cycle": "1er Cycle"}, 6),
    ("classe_predefinie", "7eme Annee", {"cycle": "2eme Cycle"}, 1),
    ("classe_predefinie", "8eme Annee", {"cycle": "2eme Cycle"}, 2),
    ("classe_predefinie", "9eme Annee", {"cycle": "2eme Cycle"}, 3),
    ("periode", "Trimestre 1", {}, 1),
    ("periode", "Trimestre 2", {}, 2),
    ("periode", "Trimestre 3", {}, 3),
    ("annee_scolaire", "2020-2021", {}, 1),
    ("annee_scolaire", "2021-2022", {}, 2),
    ("annee_scolaire", "2022-2023", {}, 3),
    ("annee_scolaire", "2023-2024", {}, 4),
    ("annee_scolaire", "2024-2025", {}, 5),
    ("annee_scolaire", "2025-2026", {}, 6),
    ("annee_scolaire", "2026-2027", {}, 7),
    ("annee_scolaire", "2027-2028", {}, 8),
    ("annee_scolaire", "2028-2029", {}, 9),
    ("annee_scolaire", "2029-2030", {}, 10),
    ("annee_scolaire", "2030-2031", {}, 11),
    ("annee_scolaire", "2031-2032", {}, 12),
    ("annee_scolaire", "2032-2033", {}, 13),
    ("annee_scolaire", "2033-2034", {}, 14),
    ("annee_scolaire", "2034-2035", {}, 15),
    ("annee_scolaire", "2035-2036", {}, 16),
    ("annee_scolaire", "2036-2037", {}, 17),
    ("annee_scolaire", "2037-2038", {}, 18),
    ("annee_scolaire", "2038-2039", {}, 19),
    ("annee_scolaire", "2039-2040", {}, 20),
    ("annee_scolaire", "2040-2041", {}, 21),
)

valeurs_systeme = sa.table(
    "valeurs_systeme",
    sa.column("id", UUID(as_uuid=True)),
    sa.column("categorie", sa.String),
    sa.column("valeur", sa.String),
    sa.column("metadata_json", JSONB),
    sa.column("ordre", sa.Integer),
    sa.column("actif", sa.Boolean),
    sa.column("created_at", sa.DateTime(timezone=True)),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "valeurs_systeme" in inspector.get_table_names():
        return

    op.create_table(
        "valeurs_systeme",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("categorie", sa.String(length=50), nullable=False),
        sa.Column("valeur", sa.String(length=255), nullable=False),
        sa.Column("metadata_json", JSONB, nullable=True),
        sa.Column("ordre", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("actif", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_valeurs_systeme_categorie", "valeurs_systeme", ["categorie"])

    rows = [
        {
            "id": uuid.uuid4(),
            "categorie": categorie,
            "valeur": valeur,
            "metadata_json": metadata,
            "ordre": ordre,
            "actif": True,
        }
        for categorie, valeur, metadata, ordre in SEED_ROWS
    ]
    op.bulk_insert(valeurs_systeme, rows)


def downgrade() -> None:
    op.drop_index("ix_valeurs_systeme_categorie", table_name="valeurs_systeme")
    op.drop_table("valeurs_systeme")
