"""Schémas Pydantic pour l'authentification M1."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import RoleUtilisateur, StatutUtilisateur


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
