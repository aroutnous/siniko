"""Tests des modèles ORM auth (métadonnées, enum)."""

from app.db.base import Base
from app.models import Role, RoleName, User, user_roles_table


def test_role_name_values() -> None:
    """Les valeurs enum correspondent aux noms métier attendus."""
    assert RoleName.ADMIN.value == "admin"
    assert RoleName.DIRECTEUR.value == "directeur"
    assert RoleName.SECRETARIAT.value == "secretariat"
    assert RoleName.COMPTABILITE.value == "comptabilite"


def test_auth_tables_registered() -> None:
    """Les tables users, roles et user_roles sont déclarées pour Alembic."""
    table_names = {table.name for table in Base.metadata.sorted_tables}
    assert {"users", "roles", "user_roles"}.issubset(table_names)


def test_user_roles_association_columns() -> None:
    """La table d'association lie user_id et role_id."""
    column_names = {column.name for column in user_roles_table.columns}
    assert column_names == {"user_id", "role_id"}


def test_user_and_role_tablenames() -> None:
    """Noms de tables SQL alignés avec la convention du projet."""
    assert User.__tablename__ == "users"
    assert Role.__tablename__ == "roles"
