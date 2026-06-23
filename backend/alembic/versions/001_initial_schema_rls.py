"""Schéma initial KALANKO — tables, index tenant_id et politiques RLS.

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

# Placeholder remplacé après validation whitelist (pas de f-string dynamique — Bandit B608)
_TABLE_PLACEHOLDER = "__TABLE__"
_TYPE_PLACEHOLDER = "__TYPE__"

_ALTER_ENABLE_RLS = "ALTER TABLE __TABLE__ ENABLE ROW LEVEL SECURITY"
_CREATE_TENANT_INDEX = (
    "CREATE INDEX IF NOT EXISTS ix___TABLE___tenant_id_rls ON __TABLE__ (tenant_id)"
)
_RLS_POLICY = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = '__TABLE__'
          AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON __TABLE__
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
_DROP_POLICY = "DROP POLICY IF EXISTS tenant_isolation ON __TABLE__"
_DISABLE_RLS = "ALTER TABLE __TABLE__ DISABLE ROW LEVEL SECURITY"
_DROP_TABLE = "DROP TABLE IF EXISTS __TABLE__ CASCADE"
_CREATE_ENUM = "CREATE TYPE __TYPE__ AS ENUM (__VALUES__)"
_DROP_TYPE = "DROP TYPE IF EXISTS __TYPE__"

_RLS_TABLES_SET = frozenset(RLS_TABLES)
_PG_ENUM_NAMES = frozenset(name for name, _ in PG_ENUMS)
_MODEL_TABLE_NAMES = frozenset(
    table.name for table in Base.metadata.sorted_tables
)

# Tables créées par des migrations ultérieures (004, 008) — pas via metadata initiale.
_TABLES_DEFERRED_TO_LATER_MIGRATIONS = frozenset({
    "utilisateur_permissions",
    "valeurs_systeme",
})


def _assert_rls_table(table_name: str) -> None:
    """Vérifie que le nom de table provient du tuple interne RLS_TABLES."""
    if table_name not in _RLS_TABLES_SET:
        raise ValueError(f"Table RLS non autorisee: {table_name!r}")


def _sql_for_rls_table(template: str, table_name: str) -> str:
    _assert_rls_table(table_name)
    return template.replace(_TABLE_PLACEHOLDER, table_name)


def _sql_for_model_table(template: str, table_name: str) -> str:
    if table_name not in _MODEL_TABLE_NAMES:
        raise ValueError(f"Table modele non autorisee: {table_name!r}")
    return template.replace(_TABLE_PLACEHOLDER, table_name)


def _sql_for_enum_type(template: str, enum_name: str, values_sql: str = "") -> str:
    if enum_name not in _PG_ENUM_NAMES:
        raise ValueError(f"Type ENUM non autorise: {enum_name!r}")
    return (
        template.replace(_TYPE_PLACEHOLDER, enum_name).replace("__VALUES__", values_sql)
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
        connection.execute(
            text(_sql_for_enum_type(_CREATE_ENUM, enum_name, values_sql))
        )


def _create_tables(connection) -> None:
    """Crée toutes les tables SQLAlchemy manquantes."""
    for table in Base.metadata.sorted_tables:
        if table.name in _TABLES_DEFERRED_TO_LATER_MIGRATIONS:
            continue
        if not _table_exists(connection, table.name):
            table.create(connection, checkfirst=True)


def _create_tenant_index(connection, table_name: str) -> None:
    connection.execute(text(_sql_for_rls_table(_CREATE_TENANT_INDEX, table_name)))


def _enable_rls(connection, table_name: str) -> None:
    """Active RLS et policy tenant_isolation (idempotent)."""
    connection.execute(text(_sql_for_rls_table(_ALTER_ENABLE_RLS, table_name)))
    connection.execute(text(_sql_for_rls_table(_RLS_POLICY, table_name)))


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
            op.execute(_sql_for_rls_table(_DROP_POLICY, table_name))
            op.execute(_sql_for_rls_table(_DISABLE_RLS, table_name))

    for table in reversed(Base.metadata.sorted_tables):
        if _table_exists(connection, table.name):
            op.execute(_sql_for_model_table(_DROP_TABLE, table.name))

    for enum_name, _ in reversed(PG_ENUMS):
        op.execute(_sql_for_enum_type(_DROP_TYPE, enum_name))
