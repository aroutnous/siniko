"""Tables enseignants, enseignant_matieres, enseignant_classes avec RLS.

Revision ID: 006_enseignants
Revises: 005_update_permissions
Create Date: 2026-06-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "006_enseignants"
down_revision: str | None = "005_update_permissions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DROP_STATUT_ENSEIGNANT = "DROP TYPE IF EXISTS statut_enseignant"

_ENABLE_RLS_ENSEIGNANTS = "ALTER TABLE enseignants ENABLE ROW LEVEL SECURITY"
_ENABLE_RLS_ENSEIGNANT_MATIERES = (
    "ALTER TABLE enseignant_matieres ENABLE ROW LEVEL SECURITY"
)
_ENABLE_RLS_ENSEIGNANT_CLASSES = (
    "ALTER TABLE enseignant_classes ENABLE ROW LEVEL SECURITY"
)

_RLS_POLICY_ENSEIGNANTS = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = 'enseignants'
          AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON enseignants
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

_RLS_POLICY_ENSEIGNANT_MATIERES = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = 'enseignant_matieres'
          AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON enseignant_matieres
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

_RLS_POLICY_ENSEIGNANT_CLASSES = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = 'enseignant_classes'
          AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON enseignant_classes
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

_DROP_POLICY_ENSEIGNANTS = "DROP POLICY IF EXISTS tenant_isolation ON enseignants"
_DROP_POLICY_ENSEIGNANT_MATIERES = (
    "DROP POLICY IF EXISTS tenant_isolation ON enseignant_matieres"
)
_DROP_POLICY_ENSEIGNANT_CLASSES = (
    "DROP POLICY IF EXISTS tenant_isolation ON enseignant_classes"
)

_DISABLE_RLS_ENSEIGNANTS = "ALTER TABLE enseignants DISABLE ROW LEVEL SECURITY"
_DISABLE_RLS_ENSEIGNANT_MATIERES = (
    "ALTER TABLE enseignant_matieres DISABLE ROW LEVEL SECURITY"
)
_DISABLE_RLS_ENSEIGNANT_CLASSES = (
    "ALTER TABLE enseignant_classes DISABLE ROW LEVEL SECURITY"
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "enseignants" in inspector.get_table_names():
        return

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_enseignant') THEN
                CREATE TYPE statut_enseignant AS ENUM ('actif', 'inactif', 'conge');
            END IF;
        END $$;
        """
    )

    op.create_table(
        "enseignants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("nom", sa.String(length=100), nullable=False),
        sa.Column("prenom", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("telephone", sa.String(length=20), nullable=True),
        sa.Column("adresse", sa.String(length=500), nullable=True),
        sa.Column(
            "statut",
            postgresql.ENUM(
                "actif",
                "inactif",
                "conge",
                name="statut_enseignant",
                create_type=False,
            ),
            nullable=False,
            server_default="actif",
        ),
        sa.Column("date_embauche", sa.Date(), nullable=True),
        sa.Column(
            "salaire_base",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "tenant_id",
            "email",
            name="uq_enseignants_tenant_email",
        ),
    )
    op.create_index("ix_enseignants_tenant_id", "enseignants", ["tenant_id"])

    op.create_table(
        "enseignant_matieres",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "enseignant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("enseignants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "matiere_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("matieres.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "classe_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("classes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "tenant_id",
            "enseignant_id",
            "matiere_id",
            "classe_id",
            name="uq_enseignant_matieres_affectation",
        ),
    )
    op.create_index(
        "ix_enseignant_matieres_tenant_id",
        "enseignant_matieres",
        ["tenant_id"],
    )
    op.create_index(
        op.f("ix_enseignant_matieres_enseignant_id"),
        "enseignant_matieres",
        ["enseignant_id"],
    )
    op.create_index(
        op.f("ix_enseignant_matieres_matiere_id"),
        "enseignant_matieres",
        ["matiere_id"],
    )
    op.create_index(
        op.f("ix_enseignant_matieres_classe_id"),
        "enseignant_matieres",
        ["classe_id"],
    )

    op.create_table(
        "enseignant_classes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "enseignant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("enseignants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "classe_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("classes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "annee_scolaire_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("annees_scolaires.id", ondelete="CASCADE"),
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
            "tenant_id",
            "enseignant_id",
            "classe_id",
            "annee_scolaire_id",
            name="uq_enseignant_classes_affectation",
        ),
    )
    op.create_index(
        "ix_enseignant_classes_tenant_id",
        "enseignant_classes",
        ["tenant_id"],
    )
    op.create_index(
        op.f("ix_enseignant_classes_enseignant_id"),
        "enseignant_classes",
        ["enseignant_id"],
    )
    op.create_index(
        op.f("ix_enseignant_classes_classe_id"),
        "enseignant_classes",
        ["classe_id"],
    )
    op.create_index(
        op.f("ix_enseignant_classes_annee_scolaire_id"),
        "enseignant_classes",
        ["annee_scolaire_id"],
    )

    op.execute(_ENABLE_RLS_ENSEIGNANTS)
    op.execute(_RLS_POLICY_ENSEIGNANTS)
    op.execute(_ENABLE_RLS_ENSEIGNANT_MATIERES)
    op.execute(_RLS_POLICY_ENSEIGNANT_MATIERES)
    op.execute(_ENABLE_RLS_ENSEIGNANT_CLASSES)
    op.execute(_RLS_POLICY_ENSEIGNANT_CLASSES)


def downgrade() -> None:
    op.execute(_DROP_POLICY_ENSEIGNANT_CLASSES)
    op.execute(_DISABLE_RLS_ENSEIGNANT_CLASSES)
    op.execute(_DROP_POLICY_ENSEIGNANT_MATIERES)
    op.execute(_DISABLE_RLS_ENSEIGNANT_MATIERES)
    op.execute(_DROP_POLICY_ENSEIGNANTS)
    op.execute(_DISABLE_RLS_ENSEIGNANTS)

    op.drop_index(
        op.f("ix_enseignant_classes_annee_scolaire_id"),
        table_name="enseignant_classes",
    )
    op.drop_index(
        op.f("ix_enseignant_classes_classe_id"),
        table_name="enseignant_classes",
    )
    op.drop_index(
        op.f("ix_enseignant_classes_enseignant_id"),
        table_name="enseignant_classes",
    )
    op.drop_index("ix_enseignant_classes_tenant_id", table_name="enseignant_classes")
    op.drop_table("enseignant_classes")

    op.drop_index(
        op.f("ix_enseignant_matieres_classe_id"),
        table_name="enseignant_matieres",
    )
    op.drop_index(
        op.f("ix_enseignant_matieres_matiere_id"),
        table_name="enseignant_matieres",
    )
    op.drop_index(
        op.f("ix_enseignant_matieres_enseignant_id"),
        table_name="enseignant_matieres",
    )
    op.drop_index("ix_enseignant_matieres_tenant_id", table_name="enseignant_matieres")
    op.drop_table("enseignant_matieres")

    op.drop_index("ix_enseignants_tenant_id", table_name="enseignants")
    op.drop_table("enseignants")

    op.execute(_DROP_STATUT_ENSEIGNANT)
