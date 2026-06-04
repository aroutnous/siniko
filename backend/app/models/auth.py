"""Modèles authentification, sessions et audit."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModel, TenantScopedModel
from app.models.enums import (
    RoleUtilisateur,
    StatutUtilisateur,
    pg_enum,
)


class Utilisateur(BaseModel):
    """
    Compte utilisateur par tenant.

    Pas de RLS : accès géré au niveau application (platform_owner multi-tenant).
    """

    __tablename__ = "utilisateurs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_utilisateurs_tenant_email"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    prenom: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    mot_de_passe_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[RoleUtilisateur] = mapped_column(
        pg_enum(RoleUtilisateur, "role_utilisateur"),
        nullable=False,
    )
    statut: Mapped[StatutUtilisateur] = mapped_column(
        pg_enum(StatutUtilisateur, "statut_utilisateur"),
        nullable=False,
        default=StatutUtilisateur.ACTIF,
    )
    derniere_connexion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="utilisateurs")  # noqa: F821
    sessions: Mapped[list["Session"]] = relationship(back_populates="utilisateur")
    reset_tokens: Mapped[list["ResetToken"]] = relationship(back_populates="utilisateur")


class Session(BaseModel):
    __tablename__ = "sessions"

    utilisateur_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    expire_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    utilisateur: Mapped["Utilisateur"] = relationship(back_populates="sessions")


class AuditLog(TenantScopedModel):
    __tablename__ = "audit_logs"

    utilisateur_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    table_cible: Mapped[str | None] = mapped_column(String(100), nullable=True)
    enregistrement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    anciennes_valeurs: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    nouvelles_valeurs: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    resultat: Mapped[str | None] = mapped_column(String(50), nullable=True)


class ResetToken(BaseModel):
    __tablename__ = "reset_tokens"

    utilisateur_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expire_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    utilisateur: Mapped["Utilisateur"] = relationship(back_populates="reset_tokens")
