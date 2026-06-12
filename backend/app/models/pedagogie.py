"""Modèles notes, bulletins et lignes de bulletin."""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TenantScopedModel
from app.models.enums import StatutBulletin, pg_enum


class Note(TenantScopedModel):
    __tablename__ = "notes"

    eleve_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("eleves.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    matiere_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matieres.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    periode_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("periodes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    sequence_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sequences_evaluation.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    classe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("salles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    valeur: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    valeur_qualitative: Mapped[str | None] = mapped_column(String(30), nullable=True)
    appreciation: Mapped[str | None] = mapped_column(Text, nullable=True)
    saisi_par: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="SET NULL"),
        nullable=True,
    )

    sequence: Mapped["SequenceEvaluation | None"] = relationship(  # noqa: F821
        "SequenceEvaluation",
    )


class Bulletin(TenantScopedModel):
    __tablename__ = "bulletins"

    eleve_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("eleves.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    classe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("salles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    periode_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("periodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    moyenne_generale: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    rang: Mapped[int | None] = mapped_column(Integer, nullable=True)
    effectif_classe: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mention: Mapped[str | None] = mapped_column(String(50), nullable=True)
    appreciation_generale: Mapped[str | None] = mapped_column(Text, nullable=True)
    type_bulletin: Mapped[str] = mapped_column(
        String(20), nullable=False, default="chiffre"
    )
    statut: Mapped[StatutBulletin] = mapped_column(
        pg_enum(StatutBulletin, "statut_bulletin"),
        nullable=False,
        default=StatutBulletin.BROUILLON,
    )
    valide_par: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("utilisateurs.id", ondelete="SET NULL"),
        nullable=True,
    )
    date_validation: Mapped[date | None] = mapped_column(Date, nullable=True)

    lignes: Mapped[list["BulletinLigne"]] = relationship(back_populates="bulletin")


class BulletinLigne(Base):
    """Ligne de bulletin — isolée via la FK bulletin (pas de tenant_id direct)."""

    __tablename__ = "bulletin_lignes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    bulletin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bulletins.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    matiere_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matieres.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    note: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    moyenne_classe: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    coefficient: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True, default=1)
    statut_competence: Mapped[str | None] = mapped_column(String(30), nullable=True)
    appreciation: Mapped[str | None] = mapped_column(Text, nullable=True)

    bulletin: Mapped["Bulletin"] = relationship(back_populates="lignes")
