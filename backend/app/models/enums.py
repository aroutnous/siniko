"""Énumérations métier — alignées PostgreSQL et Python."""

import enum


class StatutTenant(str, enum.Enum):
    ACTIF = "actif"
    SUSPENDU = "suspendu"


class StatutUtilisateur(str, enum.Enum):
    ACTIF = "actif"
    INACTIF = "inactif"


class RoleUtilisateur(str, enum.Enum):
    PLATFORM_OWNER = "platform_owner"
    PROMOTEUR = "promoteur"
    DIRECTEUR = "directeur"
    SECRETAIRE = "secretaire"
    COMPTABLE = "comptable"


class Permission(str, enum.Enum):
    # Établissement
    ETABLISSEMENT_ACCEDER = "etablissement.acceder"
    ETABLISSEMENT_CONFIGURER = "etablissement.configurer"

    # Élèves
    ELEVES_INSCRIRE = "eleves.inscrire"
    ELEVES_DOSSIERS = "eleves.dossiers"
    ELEVES_CONSULTER = "eleves.consulter"

    # Enseignants
    ENSEIGNANTS_CONSULTER = "enseignants.consulter"
    ENSEIGNANTS_GERER = "enseignants.gerer"

    # Classes
    CLASSES_CONSULTER = "classes.consulter"
    CLASSES_GERER = "classes.gerer"

    # Absences
    ABSENCES_CONSULTER = "absences.consulter"
    ABSENCES_GERER = "absences.gerer"

    # Pédagogie
    NOTES_SAISIR = "notes.saisir"
    NOTES_CONSULTER = "notes.consulter"
    BULLETINS_GENERER = "bulletins.generer"
    BULLETINS_VALIDER = "bulletins.valider"
    BULLETINS_PUBLIER = "bulletins.publier"
    RESULTATS_CONSULTER = "resultats.consulter"

    # Paiements
    PAIEMENTS_ENREGISTRER = "paiements.enregistrer"
    PAIEMENTS_CONSULTER = "paiements.consulter"
    PAIEMENTS_VALIDER = "paiements.valider"
    PAIEMENTS_SUIVRE_RETARD = "paiements.suivre_retard"
    PAIEMENTS_HISTORIQUE = "paiements.historique"

    # Finance
    FRAIS_CONSULTER = "frais.consulter"
    FRAIS_GERER = "frais.gerer"
    SALAIRES_CONSULTER = "salaires.consulter"
    SALAIRES_GERER = "salaires.gerer"
    DEPENSES_CONSULTER = "depenses.consulter"
    DEPENSES_GERER = "depenses.gerer"
    CAISSE_CONSULTER = "caisse.consulter"
    CAISSE_GERER = "caisse.gerer"

    # Hub Documentaire
    DOCUMENTS_BULLETINS = "documents.bulletins"
    DOCUMENTS_RECUS = "documents.recus"
    DOCUMENTS_CARTES_SCOLAIRES = "documents.cartes_scolaires"
    DOCUMENTS_ATTESTATIONS = "documents.attestations"
    DOCUMENTS_CERTIFICATS = "documents.certificats"
    DOCUMENTS_LISTES_CLASSE = "documents.listes_classe"
    DOCUMENTS_RAPPORTS = "documents.rapports"

    # Rapports & Statistiques
    STATISTIQUES_PEDAGOGIE = "statistiques.pedagogie"
    STATISTIQUES_FINANCE = "statistiques.finance"
    RAPPORTS_FINANCIERS = "rapports.financiers"
    RAPPORTS_IMPRIMER = "rapports.imprimer"

    # Utilisateurs
    UTILISATEURS_CONSULTER = "utilisateurs.consulter"
    UTILISATEURS_GERER = "utilisateurs.gerer"

    # Platform Owner
    PLATFORM_ADMIN = "platform.admin"


class StatutAbonnement(str, enum.Enum):
    ACTIF = "actif"
    SUSPENDU = "suspendu"
    EXPIRE = "expire"
    RESILIE = "resilie"


class StatutFacture(str, enum.Enum):
    PAYEE = "payee"
    IMPAYEE = "impayee"
    ANNULEE = "annulee"


class TypeNotification(str, enum.Enum):
    INFO = "info"
    ALERTE = "alerte"
    MAINTENANCE = "maintenance"


class SexeEleve(str, enum.Enum):
    M = "M"
    F = "F"


class StatutEleve(str, enum.Enum):
    ACTIF = "actif"
    TRANSFERE = "transfere"
    EXCLU = "exclu"


class StatutEnseignant(str, enum.Enum):
    ACTIF = "actif"
    INACTIF = "inactif"
    CONGE = "conge"


class StatutInscription(str, enum.Enum):
    INSCRIT = "inscrit"
    TRANSFERE = "transfere"
    ABANDONNE = "abandonne"


class TypeAbsence(str, enum.Enum):
    ABSENCE = "absence"
    RETARD = "retard"


class StatutBulletin(str, enum.Enum):
    BROUILLON = "brouillon"
    VALIDE = "valide"
    PUBLIE = "publie"


class ModePaiement(str, enum.Enum):
    ESPECES = "especes"
    MOBILE_MONEY = "mobile_money"
    VIREMENT = "virement"
    CHEQUE = "cheque"


class StatutPaiement(str, enum.Enum):
    EN_ATTENTE = "en_attente"
    VALIDE = "valide"
    ANNULE = "annule"


class StatutSalaire(str, enum.Enum):
    EN_ATTENTE = "en_attente"
    PAYE = "paye"


def enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Valeurs string pour SQLAlchemy Enum PostgreSQL."""
    return [member.value for member in enum_cls]


def pg_enum(enum_cls: type[enum.Enum], name: str):
    """
    Enum PostgreSQL lié à un type existant.

    create_type=False : les types sont créés par la migration Alembic (idempotent).
    """
    from sqlalchemy import Enum as SAEnum

    return SAEnum(
        enum_cls,
        name=name,
        values_callable=enum_values,
        create_type=False,
    )
