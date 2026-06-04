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


class StatutAbonnement(str, enum.Enum):
    ACTIF = "actif"
    SUSPENDU = "suspendu"
    EXPIRE = "expire"


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
