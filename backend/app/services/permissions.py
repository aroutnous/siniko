"""Matrice des permissions par rôle (M1 — Authentification & Accès)."""

from app.models.enums import RoleUtilisateur

# Permissions nommées : module.action (ex. auth.login, users.read)
ROLE_PERMISSIONS: dict[RoleUtilisateur, frozenset[str]] = {
    RoleUtilisateur.PLATFORM_OWNER: frozenset({"*", "platform.admin"}),
    RoleUtilisateur.PROMOTEUR: frozenset(
        {
            "tenant.read",
            "tenant.update",
            "users.manage",
            "establishment.manage",
            "students.manage",
            "pedagogy.manage",
            "finance.manage",
            "paiements.read",
            "reports.read",
        }
    ),
    RoleUtilisateur.DIRECTEUR: frozenset(
        {
            "establishment.read",
            "establishment.manage",
            "students.read",
            "students.update",
            "pedagogy.manage",
            "reports.read",
        }
    ),
    RoleUtilisateur.SECRETAIRE: frozenset(
        {
            "establishment.read",
            "students.manage",
            "pedagogy.notes",
            "pedagogy.generate",
            "pedagogy.read",
            "finance.payments",
            "paiements.read",
            "reports.impressions",
        }
    ),
    RoleUtilisateur.COMPTABLE: frozenset(
        {
            "establishment.read",
            "finance.manage",
            "finance.read",
            "paiements.read",
            "reports.read",
        }
    ),
}


def role_has_permission(role: RoleUtilisateur, permission: str) -> bool:
    """Vérifie si un rôle dispose de la permission demandée."""
    permissions = ROLE_PERMISSIONS.get(role, frozenset())
    return "*" in permissions or permission in permissions
