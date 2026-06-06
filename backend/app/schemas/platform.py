"""Schémas Pydantic — administration plateforme (M1 Platform Owner)."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.enums import (
    RoleUtilisateur,
    StatutAbonnement,
    StatutFacture,
    StatutTenant,
    TypeNotification,
)


class TenantCreate(BaseModel):
    nom: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    plan_id: uuid.UUID
    telephone: str | None = Field(default=None, max_length=50)
    adresse: str | None = None
    promoteur_email: EmailStr
    promoteur_nom: str = Field(..., min_length=1, max_length=100)
    promoteur_prenom: str = Field(..., min_length=1, max_length=100)


class TenantUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=2, max_length=255)
    email: EmailStr | None = None
    telephone: str | None = Field(default=None, max_length=50)
    adresse: str | None = None
    logo_url: str | None = Field(default=None, max_length=512)


class TenantResponse(BaseModel):
    id: uuid.UUID
    nom: str
    slug: str
    email: str | None
    telephone: str | None
    adresse: str | None
    logo_url: str | None
    statut: StatutTenant
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class TenantCreateResponse(BaseModel):
    tenant: TenantResponse
    promoteur_email: str
    mot_de_passe_temporaire: str


class PlanCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=255)
    prix_mensuel: Decimal = Field(..., gt=0)
    max_eleves: int | None = Field(default=None, ge=1)
    max_utilisateurs: int | None = Field(default=None, ge=1)
    fonctionnalites: dict[str, Any] = Field(default_factory=dict)


class PlanResponse(BaseModel):
    id: uuid.UUID
    nom: str
    prix_mensuel: Decimal
    max_eleves: int | None
    max_utilisateurs: int | None
    fonctionnalites: dict[str, Any]
    est_actif: bool
    created_at: datetime
    updated_at: datetime | None

    @classmethod
    def from_plan(cls, plan: Any) -> "PlanResponse":
        return cls(
            id=plan.id,
            nom=plan.nom,
            prix_mensuel=plan.prix_mensuel,
            max_eleves=plan.limite_eleves,
            max_utilisateurs=plan.limite_utilisateurs,
            fonctionnalites=plan.modules_inclus or {},
            est_actif=plan.est_actif,
            created_at=plan.created_at,
            updated_at=plan.updated_at,
        )


class AbonnementResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    plan_id: uuid.UUID
    date_debut: date
    date_fin: date | None
    statut: StatutAbonnement
    mode_paiement: str | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class FactureResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    abonnement_id: uuid.UUID
    montant: Decimal
    periode: str
    statut: StatutFacture
    date_echeance: date
    date_paiement: date | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class NotificationPlateformeCreate(BaseModel):
    titre: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    cible: Literal["all", "tenant"]
    tenant_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def tenant_required_for_cible_tenant(self) -> "NotificationPlateformeCreate":
        if self.cible == "tenant" and self.tenant_id is None:
            raise ValueError("tenant_id requis lorsque cible=tenant")
        return self


class NotificationPlateformeResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID | None
    titre: str
    message: str
    type: TypeNotification
    lu: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PlatformStatsResponse(BaseModel):
    nb_tenants: int
    nb_eleves_total: int
    nb_utilisateurs_total: int
    revenus_mois: Decimal


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID | None
    utilisateur_id: uuid.UUID | None
    action: str
    table_cible: str | None
    enregistrement_id: uuid.UUID | None
    ip_address: str | None
    resultat: str | None
    nouvelles_valeurs: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UtilisateurTenantCreate(BaseModel):
    email: EmailStr
    nom: str = Field(..., min_length=1, max_length=100)
    prenom: str = Field(..., min_length=1, max_length=100)
    role: RoleUtilisateur
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @model_validator(mode="after")
    def role_not_platform_owner(self) -> "UtilisateurTenantCreate":
        if self.role == RoleUtilisateur.PLATFORM_OWNER:
            raise ValueError("Impossible de créer un platform_owner via ce endpoint")
        return self


class UtilisateurTenantResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    nom: str
    prenom: str
    role: RoleUtilisateur
    mot_de_passe_temporaire: str | None = None

    model_config = {"from_attributes": True}
