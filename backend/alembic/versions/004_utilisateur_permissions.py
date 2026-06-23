"""Table utilisateur_permissions avec RLS tenant.

Revision ID: 004_utilisateur_permissions
Revises: 003_finance_statut
Create Date: 2026-06-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004_utilisateur_permissions"
down_revision: str | None = "003_finance_statut"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE_NAME = "utilisateur_permissions"

_ALTER_ENABLE_RLS = "ALTER TABLE utilisateur_permissions ENABLE ROW LEVEL SECURITY"
_RLS_POLICY = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = 'utilisateur_permissions'
          AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON utilisateur_permissions
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
_SEED_PERMISSIONS_INSERT = """
INSERT INTO utilisateur_permissions (
    id, tenant_id, utilisateur_id, permission, accordee_par, created_at
)
SELECT
    gen_random_uuid(),
    u.tenant_id,
    u.id,
    :permission,
    u.id,
    now()
FROM utilisateurs u
WHERE u.role = :role
  AND NOT EXISTS (
      SELECT 1 FROM utilisateur_permissions up
      WHERE up.utilisateur_id = u.id
        AND up.permission = :permission
  )
"""


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if TABLE_NAME not in inspector.get_table_names():
        op.create_table(
            TABLE_NAME,
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "tenant_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("tenants.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "utilisateur_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("utilisateurs.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("permission", sa.String(length=100), nullable=False),
            sa.Column(
                "accordee_par",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("utilisateurs.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint(
                "utilisateur_id",
                "permission",
                name="uq_utilisateur_permissions_user_permission",
            ),
        )
        op.create_index(
            "ix_utilisateur_permissions_tenant_id",
            TABLE_NAME,
            ["tenant_id"],
        )
        op.create_index(
            op.f("ix_utilisateur_permissions_utilisateur_id"),
            TABLE_NAME,
            ["utilisateur_id"],
        )

    op.execute(_ALTER_ENABLE_RLS)
    op.execute(_RLS_POLICY)

    _seed_default_permissions()


def _seed_default_permissions() -> None:
    """Migre les permissions par rôle vers utilisateur_permissions."""
    role_permissions: dict[str, list[str]] = {
        "directeur": [
            "classes.read",
            "classes.write",
            "eleves.read",
            "eleves.write",
            "eleves.delete",
            "eleves.imprimer",
            "enseignants.read",
            "enseignants.write",
            "absences.read",
            "absences.write",
            "notes.read",
            "notes.write",
            "bulletins.read",
            "bulletins.write",
            "bulletins.validate",
            "bulletins.publish",
            "bulletins.imprimer",
            "rapports.read",
            "statistiques.read",
            "utilisateurs.read",
            "utilisateurs.write",
        ],
        "secretaire": [
            "classes.read",
            "eleves.read",
            "eleves.write",
            "absences.read",
            "absences.write",
            "paiements.read",
            "paiements.write",
            "paiements.imprimer",
            "rapports.read",
            "rapports.imprimer",
        ],
        "comptable": [
            "classes.read",
            "paiements.read",
            "paiements.write",
            "paiements.validate",
            "paiements.imprimer",
            "frais.read",
            "frais.write",
            "salaires.read",
            "salaires.write",
            "depenses.read",
            "depenses.write",
            "rapports.read",
            "statistiques.read",
        ],
    }

    for role, permissions in role_permissions.items():
        for permission in permissions:
            op.execute(
                sa.text(_SEED_PERMISSIONS_INSERT).bindparams(
                    role=role, permission=permission
                )
            )


def downgrade() -> None:
    op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {TABLE_NAME}")
    op.execute(f"ALTER TABLE {TABLE_NAME} DISABLE ROW LEVEL SECURITY")
    op.drop_index(op.f("ix_utilisateur_permissions_utilisateur_id"), table_name=TABLE_NAME)
    op.drop_index("ix_utilisateur_permissions_tenant_id", table_name=TABLE_NAME)
    op.drop_table(TABLE_NAME)
