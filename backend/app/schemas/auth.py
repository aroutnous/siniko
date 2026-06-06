"""Schémas Pydantic pour l'authentification M1."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.enums import RoleUtilisateur, StatutUtilisateur

ROLES_CREATABLE_PAR_PROMOTEUR: frozenset[RoleUtilisateur] = frozenset(
    {
        RoleUtilisateur.DIRECTEUR,
        RoleUtilisateur.SECRETAIRE,
        RoleUtilisateur.COMPTABLE,
    }
)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    tenant_slug: str = Field(..., min_length=2, max_length=100)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    role: RoleUtilisateur
    tenant_slug: str


class RefreshRequest(BaseModel):
    """Le refresh utilise le header Authorization ; corps optionnel."""


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    role: RoleUtilisateur
    tenant_slug: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    tenant_slug: str = Field(..., min_length=2, max_length=100)


class ResetPasswordResponse(BaseModel):
    """Réponse générique — ne divulgue pas l'existence de l'email."""

    message: str = "Si le compte existe, un email de réinitialisation a été envoyé."


class ResetPasswordConfirm(BaseModel):
    token: str = Field(..., min_length=36, max_length=64)
    new_password: str = Field(..., min_length=8, max_length=128)
    tenant_slug: str = Field(..., min_length=2, max_length=100)


class LogoutResponse(BaseModel):
    message: str = "Déconnexion réussie"


class UserProfile(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    tenant_slug: str
    email: str
    nom: str
    prenom: str
    role: RoleUtilisateur
    statut: StatutUtilisateur
    derniere_connexion: datetime | None

    model_config = {"from_attributes": True}


class UtilisateurListItem(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    nom: str
    prenom: str
    role: RoleUtilisateur
    statut: StatutUtilisateur

    model_config = {"from_attributes": True}


class UtilisateurCreate(BaseModel):
    email: EmailStr
    nom: str = Field(..., min_length=1, max_length=100)
    prenom: str = Field(..., min_length=1, max_length=100)
    role: RoleUtilisateur
    mot_de_passe: str | None = Field(default=None, min_length=8, max_length=128)

    @model_validator(mode="after")
    def role_autorise(self) -> "UtilisateurCreate":
        if self.role not in ROLES_CREATABLE_PAR_PROMOTEUR:
            raise ValueError(
                "Rôle non autorisé. Choisissez directeur, secrétaire ou comptable."
            )
        return self


class UtilisateurCreateResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    nom: str
    prenom: str
    role: RoleUtilisateur
    mot_de_passe_temporaire: str | None = None

    model_config = {"from_attributes": True}


class UtilisateurStatutUpdate(BaseModel):
    statut: StatutUtilisateur


class ChangePasswordRequest(BaseModel):
    ancien_mot_de_passe: str = Field(..., min_length=8, max_length=128)
    nouveau_mot_de_passe: str = Field(..., min_length=8, max_length=128)
    confirmation: str = Field(..., min_length=8, max_length=128)

    @model_validator(mode="after")
    def confirmation_correspond(self) -> "ChangePasswordRequest":
        if self.nouveau_mot_de_passe != self.confirmation:
            raise ValueError("La confirmation ne correspond pas au nouveau mot de passe")
        if self.ancien_mot_de_passe == self.nouveau_mot_de_passe:
            raise ValueError("Le nouveau mot de passe doit être différent de l'ancien")
        return self
