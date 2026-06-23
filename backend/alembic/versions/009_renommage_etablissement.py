"""Renommage niveaux→classes, classes→salles.

Revision ID: 009_renommage_etablissement
Revises: 008_valeurs_systeme
Create Date: 2026-06-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "009_renommage_etablissement"
down_revision: str | None = "008_valeurs_systeme"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RLS_POLICY = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = 'salles'
          AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON salles
        FOR ALL
        USING (
            tenant_id = current_setting('app.current_tenant', true)::uuid
        )
        WITH CHECK (
            tenant_id = current_setting('app.current_tenant', true)::uuid
        );
    END IF;
END $$;
"""


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "niveaux" not in inspector.get_table_names():
        return

    # Libère le nom "classes" : divisions physiques → salles
    op.rename_table("classes", "salles")

    # Niveaux scolaires → classes
    op.rename_table("niveaux", "classes")

    # Colonnes salles (ex-classes physiques)
    op.alter_column("salles", "niveau_id", new_column_name="classe_id")
    op.alter_column("salles", "capacite_max", new_column_name="capacite")
    op.add_column("salles", sa.Column("nom_salle", sa.String(length=100), nullable=True))

    # Référence système sur classes (ex-niveaux)
    op.add_column(
        "classes",
        sa.Column("valeur_systeme_ref", sa.String(length=255), nullable=True),
    )

    # Matières et frais : niveau_id → classe_id
    op.alter_column("matieres", "niveau_id", new_column_name="classe_id")
    op.alter_column("frais_scolaires", "niveau_id", new_column_name="classe_id")

    op.execute("ALTER TABLE salles ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_salles_tenant_id_rls ON salles (tenant_id)"
    )
    op.execute(_RLS_POLICY)

    # Copie nom existant vers nom_salle pour les données existantes
    op.execute("UPDATE salles SET nom_salle = nom WHERE nom_salle IS NULL")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON salles")

    op.alter_column("frais_scolaires", "classe_id", new_column_name="niveau_id")
    op.alter_column("matieres", "classe_id", new_column_name="niveau_id")

    op.drop_column("classes", "valeur_systeme_ref")
    op.drop_column("salles", "nom_salle")

    op.alter_column("salles", "capacite", new_column_name="capacite_max")
    op.alter_column("salles", "classe_id", new_column_name="niveau_id")

    op.rename_table("classes", "niveaux")
    op.rename_table("salles", "classes")
