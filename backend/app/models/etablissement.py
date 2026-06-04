"""Modèles structure établissement scolaire."""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TenantScopedModel

class Cycle(TenantScopedModel):
    __tablename__ = "cycles"

    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ordre: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    niveaux: Mapped[list["Niveau"]] = relationship(back_populates="cycle")


class Niveau(TenantScopedModel):
    __tablename__ = "niveaux"

    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cycles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    ordre: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    cycle: Mapped["Cycle"] = relationship(back_populates="niveaux")
    matieres: Mapped[list["Matiere"]] = relationship(back_populates="niveau")
    classes: Mapped[list["Classe"]] = relationship(back_populates="niveau")
    frais_scolaires: Mapped[list["FraisScolaire"]] = relationship(back_populates="niveau")  # noqa: F821


class AnneeScolaire(TenantScopedModel):
    __tablename__ = "annees_scolaires"

    libelle: Mapped[str] = mapped_column(String(50), nullable=False)
    date_debut: Mapped[date] = mapped_column(Date, nullable=False)
    date_fin: Mapped[date] = mapped_column(Date, nullable=False)
    est_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    periodes: Mapped[list["Periode"]] = relationship(back_populates="annee_scolaire")
    classes: Mapped[list["Classe"]] = relationship(back_populates="annee_scolaire")


class Periode(TenantScopedModel):
    __tablename__ = "periodes"

    annee_scolaire_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("annees_scolaires.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    date_debut: Mapped[date] = mapped_column(Date, nullable=False)
    date_fin: Mapped[date] = mapped_column(Date, nullable=False)
    ordre: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    annee_scolaire: Mapped["AnneeScolaire"] = relationship(back_populates="periodes")


class Classe(TenantScopedModel):
    __tablename__ = "classes"

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
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    capacite_max: Mapped[int | None] = mapped_column(Integer, nullable=True)

    niveau: Mapped["Niveau"] = relationship(back_populates="classes")
    annee_scolaire: Mapped["AnneeScolaire"] = relationship(back_populates="classes")


class Matiere(TenantScopedModel):
    __tablename__ = "matieres"

    niveau_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("niveaux.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    coefficient: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=1)
    est_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    niveau: Mapped["Niveau"] = relationship(back_populates="matieres")


class ConfigNotation(TenantScopedModel):
    __tablename__ = "config_notation"

    note_max: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=20)
    note_passage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=10)
    arrondi: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
