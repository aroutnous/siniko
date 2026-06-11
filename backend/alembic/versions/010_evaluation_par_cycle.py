"""Évaluation par cycle — migration config_notation vers cycles.

Revision ID: 010_evaluation_par_cycle
Revises: 009_renommage_etablissement
Create Date: 2026-06-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "010_evaluation_par_cycle"
down_revision: str | None = "009_renommage_etablissement"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# --- cycles : colonnes et contraintes ---
_ADD_CYCLES_COLUMNS = """
ALTER TABLE cycles
    ADD COLUMN IF NOT EXISTS type_evaluation VARCHAR(20) NOT NULL DEFAULT 'chiffree',
    ADD COLUMN IF NOT EXISTS note_max NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS note_passage NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS arrondi INTEGER DEFAULT 2,
    ADD COLUMN IF NOT EXISTS valeur_systeme_ref VARCHAR(100)
"""

_CK_CYCLES_TYPE_EVALUATION = """
ALTER TABLE cycles
    ADD CONSTRAINT ck_cycles_type_evaluation
    CHECK (type_evaluation IN ('chiffree', 'qualitative'))
"""

_PROPAGATE_CONFIG_NOTATION_TO_CYCLES = """
UPDATE cycles c
SET
    note_max = cn.note_max,
    note_passage = cn.note_passage,
    arrondi = cn.arrondi
FROM config_notation cn
WHERE c.tenant_id = cn.tenant_id
"""

_SET_CYCLES_DEFAULTS = """
UPDATE cycles
SET note_max = 20
WHERE note_max IS NULL;

UPDATE cycles
SET note_passage = 10
WHERE note_passage IS NULL;

UPDATE cycles
SET arrondi = 2
WHERE arrondi IS NULL
"""

_SET_CYCLES_QUALITATIVE_JARDINS = """
UPDATE cycles
SET
    type_evaluation = 'qualitative',
    note_max = NULL,
    note_passage = NULL,
    arrondi = NULL
WHERE nom = 'Jardins d enfants'
"""

_DROP_CONFIG_NOTATION_POLICY = (
    "DROP POLICY IF EXISTS tenant_isolation ON config_notation"
)
_DROP_CONFIG_NOTATION_INDEX = (
    "DROP INDEX IF EXISTS ix_config_notation_tenant_id_rls"
)
_DROP_CONFIG_NOTATION_TABLE = "DROP TABLE IF EXISTS config_notation CASCADE"

# --- valeurs_systeme : merge JSONB seed cycles ---
_UPDATE_VALEURS_JARDINS = """
UPDATE valeurs_systeme
SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) || '{"type_evaluation": "qualitative", "note_max": null, "note_passage": null, "arrondi": null}'::jsonb
WHERE categorie = 'cycle'
  AND valeur = 'Jardins d enfants'
"""

_UPDATE_VALEURS_1ER_CYCLE = """
UPDATE valeurs_systeme
SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) || '{"type_evaluation": "chiffree", "note_max": 10, "note_passage": 5, "arrondi": 2}'::jsonb
WHERE categorie = 'cycle'
  AND valeur = '1er Cycle'
"""

_UPDATE_VALEURS_2EME_CYCLE = """
UPDATE valeurs_systeme
SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) || '{"type_evaluation": "chiffree", "note_max": 20, "note_passage": 10, "arrondi": 2}'::jsonb
WHERE categorie = 'cycle'
  AND valeur = '2eme Cycle'
"""

# --- notes : contraintes ---
_CK_NOTES_VALEUR_XOR = """
ALTER TABLE notes
    ADD CONSTRAINT ck_notes_valeur_xor
    CHECK (
        (valeur IS NOT NULL AND valeur_qualitative IS NULL)
        OR (valeur IS NULL AND valeur_qualitative IS NOT NULL)
    )
"""

_CK_NOTES_VALEUR_QUALITATIVE = """
ALTER TABLE notes
    ADD CONSTRAINT ck_notes_valeur_qualitative
    CHECK (
        valeur_qualitative IS NULL
        OR valeur_qualitative IN (
            'acquis',
            'en_cours_acquisition',
            'non_acquis'
        )
    )
"""

# --- bulletins : contrainte ---
_CK_BULLETINS_TYPE_BULLETIN = """
ALTER TABLE bulletins
    ADD CONSTRAINT ck_bulletins_type_bulletin
    CHECK (type_bulletin IN ('chiffre', 'competences'))
"""

# --- bulletin_lignes : contrainte ---
_CK_BULLETIN_LIGNES_STATUT_COMPETENCE = """
ALTER TABLE bulletin_lignes
    ADD CONSTRAINT ck_bulletin_lignes_statut_competence
    CHECK (
        statut_competence IS NULL
        OR statut_competence IN (
            'acquis',
            'en_cours_acquisition',
            'non_acquis'
        )
    )
"""

# --- downgrade : config_notation ---
_CONFIG_NOTATION_ENABLE_RLS = (
    "ALTER TABLE config_notation ENABLE ROW LEVEL SECURITY"
)
_CONFIG_NOTATION_CREATE_INDEX = """
CREATE INDEX IF NOT EXISTS ix_config_notation_tenant_id_rls
    ON config_notation (tenant_id)
"""
_CONFIG_NOTATION_RLS_POLICY = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = 'config_notation'
          AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON config_notation
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

_REBUILD_CONFIG_NOTATION_FROM_CYCLES = """
INSERT INTO config_notation (
    id,
    tenant_id,
    note_max,
    note_passage,
    arrondi,
    created_at
)
SELECT DISTINCT ON (tenant_id)
    gen_random_uuid(),
    tenant_id,
    COALESCE(note_max, 20),
    COALESCE(note_passage, 10),
    COALESCE(arrondi, 2),
    now()
FROM cycles
ORDER BY tenant_id, ordre
"""

_CLEAN_VALEURS_SYSTEME_METADATA = """
UPDATE valeurs_systeme
SET metadata_json = metadata_json
    - 'type_evaluation'
    - 'note_max'
    - 'note_passage'
    - 'arrondi'
WHERE categorie = 'cycle'
  AND valeur IN ('Jardins d enfants', '1er Cycle', '2eme Cycle')
"""


def upgrade() -> None:
    # 1. cycles — colonnes + CHECK
    op.execute(_ADD_CYCLES_COLUMNS)
    op.execute(_CK_CYCLES_TYPE_EVALUATION)

    # 2. config_notation → cycles puis DROP
    op.execute(_PROPAGATE_CONFIG_NOTATION_TO_CYCLES)
    op.execute(_SET_CYCLES_DEFAULTS)
    op.execute(_SET_CYCLES_QUALITATIVE_JARDINS)
    op.execute(_DROP_CONFIG_NOTATION_POLICY)
    op.execute(_DROP_CONFIG_NOTATION_INDEX)
    op.execute(_DROP_CONFIG_NOTATION_TABLE)

    # 3. valeurs_systeme seed (merge JSONB)
    op.execute(_UPDATE_VALEURS_JARDINS)
    op.execute(_UPDATE_VALEURS_1ER_CYCLE)
    op.execute(_UPDATE_VALEURS_2EME_CYCLE)

    # 4. matieres
    op.add_column(
        "matieres",
        sa.Column(
            "est_domaine_competence",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # 5. notes
    op.alter_column(
        "notes",
        "valeur",
        existing_type=sa.Numeric(5, 2),
        nullable=True,
    )
    op.add_column(
        "notes",
        sa.Column("valeur_qualitative", sa.String(length=30), nullable=True),
    )
    op.execute(_CK_NOTES_VALEUR_XOR)
    op.execute(_CK_NOTES_VALEUR_QUALITATIVE)

    # 6. bulletins
    op.alter_column(
        "bulletins",
        "moyenne_generale",
        existing_type=sa.Numeric(5, 2),
        nullable=True,
    )
    op.alter_column(
        "bulletins",
        "rang",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.alter_column(
        "bulletins",
        "mention",
        existing_type=sa.String(length=50),
        nullable=True,
    )
    op.add_column(
        "bulletins",
        sa.Column(
            "type_bulletin",
            sa.String(length=20),
            nullable=False,
            server_default="chiffre",
        ),
    )
    op.execute(_CK_BULLETINS_TYPE_BULLETIN)

    # 7. bulletin_lignes
    op.alter_column(
        "bulletin_lignes",
        "note",
        existing_type=sa.Numeric(5, 2),
        nullable=True,
    )
    op.alter_column(
        "bulletin_lignes",
        "moyenne_classe",
        existing_type=sa.Numeric(5, 2),
        nullable=True,
    )
    op.alter_column(
        "bulletin_lignes",
        "coefficient",
        existing_type=sa.Numeric(5, 2),
        nullable=True,
    )
    op.add_column(
        "bulletin_lignes",
        sa.Column("statut_competence", sa.String(length=30), nullable=True),
    )
    op.execute(_CK_BULLETIN_LIGNES_STATUT_COMPETENCE)


def downgrade() -> None:
    # bulletin_lignes — contraintes et colonnes ajoutées
    op.execute(
        "ALTER TABLE bulletin_lignes "
        "DROP CONSTRAINT IF EXISTS ck_bulletin_lignes_statut_competence"
    )
    op.drop_column("bulletin_lignes", "statut_competence")
    op.alter_column(
        "bulletin_lignes",
        "coefficient",
        existing_type=sa.Numeric(5, 2),
        nullable=False,
        server_default="1",
    )
    op.alter_column(
        "bulletin_lignes",
        "note",
        existing_type=sa.Numeric(5, 2),
        nullable=False,
    )

    # bulletins — contraintes et colonnes ajoutées
    op.execute(
        "ALTER TABLE bulletins "
        "DROP CONSTRAINT IF EXISTS ck_bulletins_type_bulletin"
    )
    op.drop_column("bulletins", "type_bulletin")

    # notes — contraintes et colonnes ajoutées
    op.execute("ALTER TABLE notes DROP CONSTRAINT IF EXISTS ck_notes_valeur_qualitative")
    op.execute("ALTER TABLE notes DROP CONSTRAINT IF EXISTS ck_notes_valeur_xor")
    op.drop_column("notes", "valeur_qualitative")
    op.alter_column(
        "notes",
        "valeur",
        existing_type=sa.Numeric(5, 2),
        nullable=False,
    )

    # matieres
    op.drop_column("matieres", "est_domaine_competence")

    # config_notation — recréation (avant suppression colonnes cycles)
    op.create_table(
        "config_notation",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "note_max",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="20",
        ),
        sa.Column(
            "note_passage",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="10",
        ),
        sa.Column(
            "arrondi",
            sa.Integer(),
            nullable=False,
            server_default="2",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(_REBUILD_CONFIG_NOTATION_FROM_CYCLES)
    op.execute(_CONFIG_NOTATION_ENABLE_RLS)
    op.execute(_CONFIG_NOTATION_CREATE_INDEX)
    op.execute(_CONFIG_NOTATION_RLS_POLICY)

    # cycles — contraintes et colonnes ajoutées
    op.execute(
        "ALTER TABLE cycles DROP CONSTRAINT IF EXISTS ck_cycles_type_evaluation"
    )
    op.drop_column("cycles", "valeur_systeme_ref")
    op.drop_column("cycles", "arrondi")
    op.drop_column("cycles", "note_passage")
    op.drop_column("cycles", "note_max")
    op.drop_column("cycles", "type_evaluation")

    # valeurs_systeme — nettoyage metadata_json
    op.execute(_CLEAN_VALEURS_SYSTEME_METADATA)
