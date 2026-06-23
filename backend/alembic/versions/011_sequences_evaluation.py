"""Séquences d'évaluation par période et cycle.

Revision ID: 011_sequences_evaluation
Revises: 010_evaluation_par_cycle
Create Date: 2026-06-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "011_sequences_evaluation"
down_revision: str | None = "010_evaluation_par_cycle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ENABLE_RLS_SEQUENCES_EVALUATION = (
    "ALTER TABLE sequences_evaluation ENABLE ROW LEVEL SECURITY"
)

_IX_SEQUENCES_EVALUATION_TENANT_ID = """
CREATE INDEX IF NOT EXISTS ix_sequences_evaluation_tenant_id
    ON sequences_evaluation (tenant_id)
"""

_RLS_POLICY_SEQUENCES_EVALUATION = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = 'sequences_evaluation'
          AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON sequences_evaluation
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

_CK_NOTES_PERIODE_OU_SEQUENCE = """
ALTER TABLE notes
    ADD CONSTRAINT ck_notes_periode_ou_sequence
    CHECK (periode_id IS NOT NULL OR sequence_id IS NOT NULL)
"""

_DROP_CK_NOTES_PERIODE_OU_SEQUENCE = """
ALTER TABLE notes
    DROP CONSTRAINT IF EXISTS ck_notes_periode_ou_sequence
"""

_DROP_POLICY_SEQUENCES_EVALUATION = (
    "DROP POLICY IF EXISTS tenant_isolation ON sequences_evaluation"
)

_DROP_IX_SEQUENCES_EVALUATION_TENANT_ID = (
    "DROP INDEX IF EXISTS ix_sequences_evaluation_tenant_id"
)

_DROP_TABLE_SEQUENCES_EVALUATION = (
    "DROP TABLE IF EXISTS sequences_evaluation CASCADE"
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "sequences_evaluation" in inspector.get_table_names():
        note_columns = {col["name"] for col in inspector.get_columns("notes")}
        if "sequence_id" in note_columns:
            return

    op.create_table(
        "sequences_evaluation",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "cycle_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cycles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "periode_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("periodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("nom", sa.String(length=100), nullable=False),
        sa.Column("date_debut", sa.Date(), nullable=True),
        sa.Column("date_fin", sa.Date(), nullable=True),
        sa.Column("ordre", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.execute(_ENABLE_RLS_SEQUENCES_EVALUATION)
    op.execute(_IX_SEQUENCES_EVALUATION_TENANT_ID)
    op.execute(_RLS_POLICY_SEQUENCES_EVALUATION)

    op.add_column(
        "notes",
        sa.Column(
            "sequence_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sequences_evaluation.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.alter_column(
        "notes",
        "periode_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.execute(_CK_NOTES_PERIODE_OU_SEQUENCE)


def downgrade() -> None:
    op.execute(_DROP_CK_NOTES_PERIODE_OU_SEQUENCE)
    op.drop_column("notes", "sequence_id")
    op.alter_column(
        "notes",
        "periode_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )

    op.execute(_DROP_POLICY_SEQUENCES_EVALUATION)
    op.execute(_DROP_IX_SEQUENCES_EVALUATION_TENANT_ID)
    op.execute(_DROP_TABLE_SEQUENCES_EVALUATION)
