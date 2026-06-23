"""Modèles enseignants et affectations matières / classes."""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TenantScopedModel
from app.models.enums import StatutEnseignant, pg_enum


class Enseignant(TenantScopedModel):
    """Profil enseignant par tenant."""

    __tablename__ = "enseignants"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_enseignants_tenant_email"),
    )

    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    prenom: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    telephone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    adresse: Mapped[str | None] = mapped_column(String(500), nullable=True)
    statut: Mapped[StatutEnseignant] = mapped_column(
        pg_enum(StatutEnseignant, "statut_enseignant"),
        nullable=False,
        default=StatutEnseignant.ACTIF,
    )
    date_embauche: Mapped[date | None] = mapped_column(Date, nullable=True)
    salaire_base: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    matieres: Mapped[list["EnseignantMatiere"]] = relationship(
        back_populates="enseignant",
        cascade="all, delete-orphan",
    )
    classes: Mapped[list["EnseignantClasse"]] = relationship(
        back_populates="enseignant",
        cascade="all, delete-orphan",
    )


class EnseignantMatiere(TenantScopedModel):
    """Affectation enseignant → matière (optionnellement pour une classe)."""

    __tablename__ = "enseignant_matieres"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "enseignant_id",
            "matiere_id",
            "classe_id",
            name="uq_enseignant_matieres_affectation",
        ),
    )

    enseignant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("enseignants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    matiere_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matieres.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    classe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("salles.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    enseignant: Mapped["Enseignant"] = relationship(back_populates="matieres")


class EnseignantClasse(TenantScopedModel):
    """Affectation enseignant → classe pour une année scolaire."""

    __tablename__ = "enseignant_classes"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "enseignant_id",
            "classe_id",
            "annee_scolaire_id",
            name="uq_enseignant_classes_affectation",
        ),
    )

    enseignant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("enseignants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    classe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("salles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    annee_scolaire_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("annees_scolaires.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    enseignant: Mapped["Enseignant"] = relationship(back_populates="classes")
