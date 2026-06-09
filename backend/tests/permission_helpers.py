"""Permissions par défaut pour les tests (nouveau référentiel)."""

import uuid

from sqlalchemy.orm import Session

from app.core.database import set_tenant_context
from app.models.auth import Utilisateur, UtilisateurPermission
from app.models.enums import Permission, RoleUtilisateur

ROLE_DEFAULT_PERMISSIONS: dict[RoleUtilisateur, list[str]] = {
    RoleUtilisateur.DIRECTEUR: [
        Permission.ETABLISSEMENT_ACCEDER.value,
        Permission.ETABLISSEMENT_CONFIGURER.value,
        Permission.CLASSES_CONSULTER.value,
        Permission.CLASSES_GERER.value,
        Permission.ELEVES_CONSULTER.value,
        Permission.ELEVES_INSCRIRE.value,
        Permission.ELEVES_DOSSIERS.value,
        Permission.ENSEIGNANTS_CONSULTER.value,
        Permission.ENSEIGNANTS_GERER.value,
        Permission.ABSENCES_CONSULTER.value,
        Permission.ABSENCES_GERER.value,
        Permission.NOTES_CONSULTER.value,
        Permission.NOTES_SAISIR.value,
        Permission.BULLETINS_GENERER.value,
        Permission.BULLETINS_VALIDER.value,
        Permission.BULLETINS_PUBLIER.value,
        Permission.RESULTATS_CONSULTER.value,
        Permission.RAPPORTS_FINANCIERS.value,
        Permission.STATISTIQUES_PEDAGOGIE.value,
        Permission.UTILISATEURS_CONSULTER.value,
        Permission.UTILISATEURS_GERER.value,
    ],
    RoleUtilisateur.SECRETAIRE: [
        Permission.CLASSES_CONSULTER.value,
        Permission.ELEVES_CONSULTER.value,
        Permission.ELEVES_INSCRIRE.value,
        Permission.ELEVES_DOSSIERS.value,
        Permission.ABSENCES_CONSULTER.value,
        Permission.ABSENCES_GERER.value,
        Permission.PAIEMENTS_CONSULTER.value,
        Permission.PAIEMENTS_ENREGISTRER.value,
        Permission.DOCUMENTS_RECUS.value,
        Permission.RAPPORTS_FINANCIERS.value,
        Permission.RAPPORTS_IMPRIMER.value,
    ],
    RoleUtilisateur.COMPTABLE: [
        Permission.CLASSES_CONSULTER.value,
        Permission.PAIEMENTS_CONSULTER.value,
        Permission.PAIEMENTS_ENREGISTRER.value,
        Permission.PAIEMENTS_VALIDER.value,
        Permission.PAIEMENTS_HISTORIQUE.value,
        Permission.PAIEMENTS_SUIVRE_RETARD.value,
        Permission.DOCUMENTS_RECUS.value,
        Permission.FRAIS_CONSULTER.value,
        Permission.FRAIS_GERER.value,
        Permission.SALAIRES_CONSULTER.value,
        Permission.SALAIRES_GERER.value,
        Permission.DEPENSES_CONSULTER.value,
        Permission.DEPENSES_GERER.value,
        Permission.CAISSE_CONSULTER.value,
        Permission.CAISSE_GERER.value,
        Permission.RAPPORTS_FINANCIERS.value,
        Permission.STATISTIQUES_FINANCE.value,
    ],
}


def grant_role_permissions(
    db: Session,
    user: Utilisateur,
    *,
    accordee_par_id: uuid.UUID | None = None,
) -> None:
    """Accorde les permissions par défaut du rôle (sauf rôles privilégiés)."""
    if user.role in (RoleUtilisateur.PROMOTEUR, RoleUtilisateur.PLATFORM_OWNER):
        return

    permissions = ROLE_DEFAULT_PERMISSIONS.get(user.role, [])
    if not permissions:
        return

    grantor_id = accordee_par_id or user.id
    set_tenant_context(db, user.tenant_id)
    for permission in permissions:
        exists = (
            db.query(UtilisateurPermission)
            .filter(
                UtilisateurPermission.utilisateur_id == user.id,
                UtilisateurPermission.tenant_id == user.tenant_id,
                UtilisateurPermission.permission == permission,
            )
            .first()
        )
        if exists is None:
            db.add(
                UtilisateurPermission(
                    tenant_id=user.tenant_id,
                    utilisateur_id=user.id,
                    permission=permission,
                    accordee_par=grantor_id,
                )
            )
    db.flush()
