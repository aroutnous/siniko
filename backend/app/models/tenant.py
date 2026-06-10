"""Modèles plateforme : tenants, abonnements, facturation, notifications."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, TenantScopedModel
from app.models.enums import (
    StatutAbonnement,
    StatutFacture,
    StatutTenant,
    TypeNotification,
    pg_enum,
)


class Tenant(BaseModel):
    __tablename__ = "tenants"

    nom: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    adresse: Mapped[str | None] = mapped_column(Text, nullable=True)
    telephone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    statut: Mapped[StatutTenant] = mapped_column(
        pg_enum(StatutTenant, "statut_tenant"),
        nullable=False,
        default=StatutTenant.ACTIF,
    )

    abonnements: Mapped[list["Abonnement"]] = relationship(back_populates="tenant")
    utilisateurs: Mapped[list["Utilisateur"]] = relationship(back_populates="tenant")  # noqa: F821


class PlanAbonnement(BaseModel):
    __tablename__ = "plans_abonnement"

    nom: Mapped[str] = mapped_column(String(255), nullable=False)
    prix_mensuel: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    modules_inclus: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    limite_eleves: Mapped[int | None] = mapped_column(nullable=True)
    limite_utilisateurs: Mapped[int | None] = mapped_column(nullable=True)
    est_actif: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    abonnements: Mapped[list["Abonnement"]] = relationship(back_populates="plan")


class Abonnement(TenantScopedModel):
    __tablename__ = "abonnements"

    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plans_abonnement.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    date_debut: Mapped[date] = mapped_column(Date, nullable=False)
    date_fin: Mapped[date | None] = mapped_column(Date, nullable=True)
    statut: Mapped[StatutAbonnement] = mapped_column(
        pg_enum(StatutAbonnement, "statut_abonnement"),
        nullable=False,
        default=StatutAbonnement.ACTIF,
    )
    mode_paiement: Mapped[str | None] = mapped_column(String(50), nullable=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="abonnements")
    plan: Mapped["PlanAbonnement"] = relationship(back_populates="abonnements")
    factures: Mapped[list["FactureTenant"]] = relationship(back_populates="abonnement")


class FactureTenant(TenantScopedModel):
    __tablename__ = "factures_tenants"

    abonnement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("abonnements.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    montant: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    periode: Mapped[str] = mapped_column(String(50), nullable=False)
    statut: Mapped[StatutFacture] = mapped_column(
        pg_enum(StatutFacture, "statut_facture"),
        nullable=False,
        default=StatutFacture.IMPAYEE,
    )
    date_echeance: Mapped[date] = mapped_column(Date, nullable=False)
    date_paiement: Mapped[date | None] = mapped_column(Date, nullable=True)

    abonnement: Mapped["Abonnement"] = relationship(back_populates="factures")


class NotificationPlateforme(BaseModel):
    __tablename__ = "notifications_plateforme"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    emetteur_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    titre: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[TypeNotification] = mapped_column(
        pg_enum(TypeNotification, "type_notification"),
        nullable=False,
        default=TypeNotification.INFO,
    )
    lu: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
