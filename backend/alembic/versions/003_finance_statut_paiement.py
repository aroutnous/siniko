"""Ajout statut_paiement et mode cheque sur paiements.

Revision ID: 003_finance_statut
Revises: 002_audit_nullable
Create Date: 2026-06-05

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "003_finance_statut"
down_revision: str | None = "002_audit_nullable"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TYPE mode_paiement ADD VALUE IF NOT EXISTS 'cheque'"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_paiement') THEN
                CREATE TYPE statut_paiement AS ENUM ('en_attente', 'valide', 'annule');
            END IF;
        END $$;
        """
    )
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    paiement_columns = {col["name"] for col in inspector.get_columns("paiements")}
    if "statut" not in paiement_columns:
        op.add_column(
            "paiements",
            sa.Column(
                "statut",
                sa.Enum(
                    "en_attente",
                    "valide",
                    "annule",
                    name="statut_paiement",
                    create_type=False,
                ),
                nullable=False,
                server_default="valide",
            ),
        )
    constraints = {
        c["name"]
        for c in inspector.get_unique_constraints("paiements")
    }
    if "uq_paiements_tenant_reference" not in constraints:
        op.create_unique_constraint(
            "uq_paiements_tenant_reference",
            "paiements",
            ["tenant_id", "reference_transaction"],
        )


def downgrade() -> None:
    op.drop_constraint("uq_paiements_tenant_reference", "paiements", type_="unique")
    op.drop_column("paiements", "statut")
    op.execute("DROP TYPE IF EXISTS statut_paiement")
