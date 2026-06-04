"""Modèles finance : frais, paiements, dépenses, salaires, caisse."""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TenantScopedModel
from app.models.enums import ModePaiement, StatutSalaire, pg_enum


class FraisScolaire(TenantScopedModel):
    __tablename__ = "frais_scolaires"

    niveau_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("niveaux.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    annee_scolaire_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("annees_scolaires.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    libelle: Mapped[str] = mapped_column(String(255), nullable=False)
    montant: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    est_obligatoire: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    niveau: Mapped["Niveau"] = relationship(back_populates="frais_scolaires")  # noqa: F821
    paiements: Mapped[list["Paiement"]] = relationship(back_populates="frais")


class Paiement(TenantScopedModel):
    """Paiements immutables — pas de UPDATE/DELETE métier."""

    __tablename__ = "paiements"

    eleve_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("eleves.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    frais_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("frais_scolaires.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    annee_scolaire_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("annees_scolaires.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    montant_paye: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    mode_paiement: Mapped[ModePaiement] = mapped_column(
        pg_enum(ModePaiement, "mode_paiement"),
        nullable=False,
    )
    reference_transaction: Mapped[str | None] = mapped_column(String(100), nullable=True)
    encaisse_par: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="SET NULL"),
        nullable=True,
    )
    date_paiement: Mapped[date] = mapped_column(Date, nullable=False)

    frais: Mapped["FraisScolaire"] = relationship(back_populates="paiements")


class Depense(TenantScopedModel):
    __tablename__ = "depenses"

    categorie: Mapped[str] = mapped_column(String(100), nullable=False)
    libelle: Mapped[str] = mapped_column(Text, nullable=False)
    montant: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    date_depense: Mapped[date] = mapped_column(Date, nullable=False)
    saisi_par: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="SET NULL"),
        nullable=True,
    )
    justificatif_url: Mapped[str | None] = mapped_column(String(512), nullable=True)


class Salaire(TenantScopedModel):
    __tablename__ = "salaires"

    employe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    mois: Mapped[date] = mapped_column(Date, nullable=False)
    montant_brut: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    montant_net: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    statut: Mapped[StatutSalaire] = mapped_column(
        pg_enum(StatutSalaire, "statut_salaire"),
        nullable=False,
        default=StatutSalaire.EN_ATTENTE,
    )
    date_paiement: Mapped[date | None] = mapped_column(Date, nullable=True)
    valide_par: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="SET NULL"),
        nullable=True,
    )


class CaisseJournaliere(TenantScopedModel):
    __tablename__ = "caisse_journaliere"

    date: Mapped[date] = mapped_column(Date, nullable=False)
    solde_ouverture: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total_entrees: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total_sorties: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    solde_cloture: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    cloture_par: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="SET NULL"),
        nullable=True,
    )
