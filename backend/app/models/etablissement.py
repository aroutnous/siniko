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
    type_evaluation: Mapped[str] = mapped_column(
        String(20), nullable=False, default="chiffree"
    )
    note_max: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    note_passage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    arrondi: Mapped[int | None] = mapped_column(Integer, nullable=True, default=2)
    valeur_systeme_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)

    classes: Mapped[list["Classe"]] = relationship(back_populates="cycle")


class Classe(TenantScopedModel):
    """Niveau scolaire (ex-niveaux) — ex. 6eme Annee."""

    __tablename__ = "classes"

    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cycles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    ordre: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    valeur_systeme_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)

    cycle: Mapped["Cycle"] = relationship(back_populates="classes")
    matieres: Mapped[list["Matiere"]] = relationship(back_populates="classe")
    salles: Mapped[list["Salle"]] = relationship(back_populates="classe")
    frais_scolaires: Mapped[list["FraisScolaire"]] = relationship(back_populates="classe")  # noqa: F821


class AnneeScolaire(TenantScopedModel):
    __tablename__ = "annees_scolaires"

    libelle: Mapped[str] = mapped_column(String(50), nullable=False)
    date_debut: Mapped[date] = mapped_column(Date, nullable=False)
    date_fin: Mapped[date] = mapped_column(Date, nullable=False)
    est_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    periodes: Mapped[list["Periode"]] = relationship(back_populates="annee_scolaire")
    salles: Mapped[list["Salle"]] = relationship(back_populates="annee_scolaire")


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


class Salle(TenantScopedModel):
    """Division physique (ex-classes) — ex. 6eme A."""

    __tablename__ = "salles"

    classe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("classes.id", ondelete="CASCADE"),
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
    nom_salle: Mapped[str | None] = mapped_column(String(100), nullable=True)
    capacite: Mapped[int | None] = mapped_column(Integer, nullable=True)

    classe: Mapped["Classe"] = relationship(back_populates="salles")
    annee_scolaire: Mapped["AnneeScolaire"] = relationship(back_populates="salles")


class Matiere(TenantScopedModel):
    __tablename__ = "matieres"

    classe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("classes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    coefficient: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=1)
    note_max: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    est_obligatoire: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    est_domaine_competence: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    ordre: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    est_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    enseignant_principal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("enseignants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    enseignant_assistant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("enseignants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    classe: Mapped["Classe"] = relationship(back_populates="matieres")
    enseignant_principal: Mapped["Enseignant | None"] = relationship(  # noqa: F821
        "Enseignant",
        foreign_keys=[enseignant_principal_id],
    )
    enseignant_assistant: Mapped["Enseignant | None"] = relationship(  # noqa: F821
        "Enseignant",
        foreign_keys=[enseignant_assistant_id],
    )
