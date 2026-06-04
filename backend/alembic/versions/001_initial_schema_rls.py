"""Schéma initial SINIKO — tables, index tenant_id et politiques RLS.

Revision ID: 001_initial
Revises:
Create Date: 2026-06-04

"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import inspect, text

import app.models  # noqa: F401
from app.core.database import Base

revision: str = "001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tables métier avec tenant_id — RLS (hors tenants, plans_abonnement, utilisateurs)
RLS_TABLES: tuple[str, ...] = (
    "abonnements",
    "factures_tenants",
    "notifications_plateforme",
    "audit_logs",
    "cycles",
    "niveaux",
    "annees_scolaires",
    "periodes",
    "classes",
    "matieres",
    "config_notation",
    "eleves",
    "inscriptions",
    "absences",
    "notes",
    "bulletins",
    "frais_scolaires",
    "paiements",
    "depenses",
    "salaires",
    "caisse_journaliere",
)

PG_ENUMS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("statut_tenant", ("actif", "suspendu")),
    ("statut_utilisateur", ("actif", "inactif")),
    ("role_utilisateur", (
        "platform_owner",
        "promoteur",
        "directeur",
        "secretaire",
        "comptable",
    )),
    ("statut_abonnement", ("actif", "suspendu", "expire")),
    ("statut_facture", ("payee", "impayee", "annulee")),
    ("type_notification", ("info", "alerte", "maintenance")),
    ("sexe_eleve", ("M", "F")),
    ("statut_eleve", ("actif", "transfere", "exclu")),
    ("statut_inscription", ("inscrit", "transfere", "abandonne")),
    ("type_absence", ("absence", "retard")),
    ("statut_bulletin", ("brouillon", "valide", "publie")),
    ("mode_paiement", ("especes", "mobile_money", "virement")),
    ("statut_salaire", ("en_attente", "paye")),
)


def _table_exists(connection, table_name: str) -> bool:
    return table_name in inspect(connection).get_table_names()


def _enum_exists(connection, enum_name: str) -> bool:
    row = connection.execute(
        text("SELECT 1 FROM pg_type WHERE typname = :name"),
        {"name": enum_name},
    ).first()
    return row is not None


def _create_pg_enums(connection) -> None:
    """Crée les types ENUM PostgreSQL de façon idempotente."""
    for enum_name, values in PG_ENUMS:
        if _enum_exists(connection, enum_name):
            continue
        values_sql = ", ".join(f"'{v}'" for v in values)
        connection.execute(text(f"CREATE TYPE {enum_name} AS ENUM ({values_sql})"))


def _create_tables(connection) -> None:
    """Crée toutes les tables SQLAlchemy manquantes."""
    for table in Base.metadata.sorted_tables:
        if not _table_exists(connection, table.name):
            table.create(connection, checkfirst=True)


def _create_tenant_index(connection, table_name: str) -> None:
    index_name = f"ix_{table_name}_tenant_id_rls"
    connection.execute(
        text(
            f"CREATE INDEX IF NOT EXISTS {index_name} "
            f"ON {table_name} (tenant_id)"
        )
    )


def _enable_rls(connection, table_name: str) -> None:
    """Active RLS et policy tenant_isolation (idempotent)."""
    connection.execute(
        text(f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY")
    )
    connection.execute(
        text(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_policies
                    WHERE schemaname = current_schema()
                      AND tablename = '{table_name}'
                      AND policyname = 'tenant_isolation'
                ) THEN
                    CREATE POLICY tenant_isolation ON {table_name}
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
        )
    )


def upgrade() -> None:
    connection = op.get_bind()

    _create_pg_enums(connection)
    _create_tables(connection)

    for table_name in RLS_TABLES:
        if _table_exists(connection, table_name):
            _create_tenant_index(connection, table_name)
            _enable_rls(connection, table_name)


def downgrade() -> None:
    connection = op.get_bind()

    for table_name in RLS_TABLES:
        if _table_exists(connection, table_name):
            op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table_name}")
            op.execute(f"ALTER TABLE {table_name} DISABLE ROW LEVEL SECURITY")

    for table in reversed(Base.metadata.sorted_tables):
        if _table_exists(connection, table.name):
            op.execute(f"DROP TABLE IF EXISTS {table.name} CASCADE")

    for enum_name, _ in reversed(PG_ENUMS):
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
