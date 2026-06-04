"""Modèles élèves, inscriptions et absences."""

import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TenantScopedModel
from app.models.enums import (
    SexeEleve,
    StatutEleve,
    StatutInscription,
    TypeAbsence,
    pg_enum,
)


class Eleve(TenantScopedModel):
    __tablename__ = "eleves"
    __table_args__ = (
        UniqueConstraint("tenant_id", "matricule", name="uq_eleves_tenant_matricule"),
    )

    matricule: Mapped[str] = mapped_column(String(50), nullable=False)
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    prenom: Mapped[str] = mapped_column(String(100), nullable=False)
    date_naissance: Mapped[date | None] = mapped_column(Date, nullable=True)
    lieu_naissance: Mapped[str | None] = mapped_column(String(150), nullable=True)
    sexe: Mapped[SexeEleve | None] = mapped_column(
        pg_enum(SexeEleve, "sexe_eleve"),
        nullable=True,
    )
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    nom_parent: Mapped[str | None] = mapped_column(String(200), nullable=True)
    telephone_parent: Mapped[str | None] = mapped_column(String(50), nullable=True)
    adresse: Mapped[str | None] = mapped_column(Text, nullable=True)
    statut: Mapped[StatutEleve] = mapped_column(
        pg_enum(StatutEleve, "statut_eleve"),
        nullable=False,
        default=StatutEleve.ACTIF,
    )

    inscriptions: Mapped[list["Inscription"]] = relationship(back_populates="eleve")
    absences: Mapped[list["Absence"]] = relationship(back_populates="eleve")


class Inscription(TenantScopedModel):
    __tablename__ = "inscriptions"

    eleve_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("eleves.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
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
    date_inscription: Mapped[date] = mapped_column(Date, nullable=False)
    statut: Mapped[StatutInscription] = mapped_column(
        pg_enum(StatutInscription, "statut_inscription"),
        nullable=False,
        default=StatutInscription.INSCRIT,
    )

    eleve: Mapped["Eleve"] = relationship(back_populates="inscriptions")


class Absence(TenantScopedModel):
    __tablename__ = "absences"

    eleve_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("eleves.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    classe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("classes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date_absence: Mapped[date] = mapped_column(Date, nullable=False)
    type: Mapped[TypeAbsence] = mapped_column(
        pg_enum(TypeAbsence, "type_absence"),
        nullable=False,
    )
    justifiee: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    motif: Mapped[str | None] = mapped_column(Text, nullable=True)
    saisi_par: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="SET NULL"),
        nullable=True,
    )

    eleve: Mapped["Eleve"] = relationship(back_populates="absences")
