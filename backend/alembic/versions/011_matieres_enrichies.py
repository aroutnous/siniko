"""Enrichissement table matieres et notes orphelines.

Revision ID: 011_matieres_enrichies
Revises: 010_evaluation_par_cycle
Create Date: 2026-06-04

"""

from collections.abc import Sequence

from alembic import op

revision: str = "011_matieres_enrichies"
down_revision: str | None = "010_evaluation_par_cycle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ADD_MATIERES_COLUMNS = """
ALTER TABLE matieres
    ADD COLUMN IF NOT EXISTS note_max NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS est_obligatoire BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS ordre INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS enseignant_principal_id UUID,
    ADD COLUMN IF NOT EXISTS enseignant_assistant_id UUID
"""

_FK_MATIERES_ENSEIGNANT_PRINCIPAL = """
ALTER TABLE matieres
    ADD CONSTRAINT fk_matieres_enseignant_principal
    FOREIGN KEY (enseignant_principal_id)
    REFERENCES enseignants (id)
    ON DELETE SET NULL
"""

_FK_MATIERES_ENSEIGNANT_ASSISTANT = """
ALTER TABLE matieres
    ADD CONSTRAINT fk_matieres_enseignant_assistant
    FOREIGN KEY (enseignant_assistant_id)
    REFERENCES enseignants (id)
    ON DELETE SET NULL
"""

_IX_MATIERES_ENSEIGNANT_PRINCIPAL = """
CREATE INDEX IF NOT EXISTS ix_matieres_enseignant_principal_id
    ON matieres (enseignant_principal_id)
"""

_IX_MATIERES_ENSEIGNANT_ASSISTANT = """
CREATE INDEX IF NOT EXISTS ix_matieres_enseignant_assistant_id
    ON matieres (enseignant_assistant_id)
"""

_DROP_NOTES_MATIERE_FK = """
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_matiere_id_fkey
"""

_NOTES_MATIERE_NULLABLE = """
ALTER TABLE notes ALTER COLUMN matiere_id DROP NOT NULL
"""

_ADD_NOTES_MATIERE_FK_SET_NULL = """
ALTER TABLE notes
    ADD CONSTRAINT notes_matiere_id_fkey
    FOREIGN KEY (matiere_id)
    REFERENCES matieres (id)
    ON DELETE SET NULL
"""

_RESTORE_NOTES_MATIERE_NOT_NULL = """
UPDATE notes SET matiere_id = (
    SELECT id FROM matieres LIMIT 1
) WHERE matiere_id IS NULL
"""

_DROP_MATIERES_FK_ENSEIGNANT_PRINCIPAL = """
ALTER TABLE matieres DROP CONSTRAINT IF EXISTS fk_matieres_enseignant_principal
"""

_DROP_MATIERES_FK_ENSEIGNANT_ASSISTANT = """
ALTER TABLE matieres DROP CONSTRAINT IF EXISTS fk_matieres_enseignant_assistant
"""


def upgrade() -> None:
    op.execute(_ADD_MATIERES_COLUMNS)
    op.execute(_FK_MATIERES_ENSEIGNANT_PRINCIPAL)
    op.execute(_FK_MATIERES_ENSEIGNANT_ASSISTANT)
    op.execute(_IX_MATIERES_ENSEIGNANT_PRINCIPAL)
    op.execute(_IX_MATIERES_ENSEIGNANT_ASSISTANT)

    op.execute(_DROP_NOTES_MATIERE_FK)
    op.execute(_NOTES_MATIERE_NULLABLE)
    op.execute(_ADD_NOTES_MATIERE_FK_SET_NULL)


def downgrade() -> None:
    op.execute(_DROP_NOTES_MATIERE_FK)
    op.execute(_RESTORE_NOTES_MATIERE_NOT_NULL)
    op.execute(
        """
        ALTER TABLE notes
            ADD CONSTRAINT notes_matiere_id_fkey
            FOREIGN KEY (matiere_id)
            REFERENCES matieres (id)
            ON DELETE CASCADE
        """
    )

    op.execute(_DROP_MATIERES_FK_ENSEIGNANT_ASSISTANT)
    op.execute(_DROP_MATIERES_FK_ENSEIGNANT_PRINCIPAL)
    op.execute("DROP INDEX IF EXISTS ix_matieres_enseignant_assistant_id")
    op.execute("DROP INDEX IF EXISTS ix_matieres_enseignant_principal_id")

    op.drop_column("matieres", "enseignant_assistant_id")
    op.drop_column("matieres", "enseignant_principal_id")
    op.drop_column("matieres", "ordre")
    op.drop_column("matieres", "est_obligatoire")
    op.drop_column("matieres", "note_max")
