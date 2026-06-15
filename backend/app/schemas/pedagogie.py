"""Schémas Pydantic — module M4 Gestion pédagogique."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_serializer, model_validator

from app.models.enums import StatutBulletin

StatutCompetence = Literal["acquis", "en_cours_acquisition", "non_acquis"]
TypeBulletin = Literal["chiffre", "competences"]


class NoteCreate(BaseModel):
    eleve_id: uuid.UUID
    matiere_id: uuid.UUID
    periode_id: uuid.UUID | None = None
    sequence_id: uuid.UUID | None = None
    classe_id: uuid.UUID
    valeur: Decimal | None = Field(default=None, ge=0, le=20)
    valeur_qualitative: StatutCompetence | None = None
    appreciation: str | None = None

    @model_validator(mode="after")
    def validate_periode_ou_sequence(self) -> "NoteCreate":
        if self.periode_id is None and self.sequence_id is None:
            raise ValueError("periode_id ou sequence_id requis")
        return self

    @model_validator(mode="after")
    def validate_valeur_xor(self) -> "NoteCreate":
        has_valeur = self.valeur is not None
        has_qualitative = self.valeur_qualitative is not None
        if has_valeur == has_qualitative:
            raise ValueError(
                "Fournir soit valeur (chiffrée) soit valeur_qualitative, pas les deux"
            )
        return self


class NoteUpdate(BaseModel):
    valeur: Decimal | None = Field(default=None, ge=0, le=20)
    valeur_qualitative: StatutCompetence | None = None
    appreciation: str | None = None

    @model_validator(mode="after")
    def validate_valeur_xor(self) -> "NoteUpdate":
        if self.valeur is None and self.valeur_qualitative is None:
            return self
        has_valeur = self.valeur is not None
        has_qualitative = self.valeur_qualitative is not None
        if has_valeur and has_qualitative:
            raise ValueError(
                "Fournir soit valeur (chiffrée) soit valeur_qualitative, pas les deux"
            )
        return self


class NoteResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    eleve_id: uuid.UUID
    matiere_id: uuid.UUID | None
    periode_id: uuid.UUID | None
    sequence_id: uuid.UUID | None
    classe_id: uuid.UUID
    valeur: Decimal | None
    valeur_qualitative: str | None
    appreciation: str | None
    saisi_par: uuid.UUID | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class NoteBatchCreate(BaseModel):
    """Saisie groupée de notes pour une classe."""

    notes: list[NoteCreate] = Field(..., min_length=1)


class BulletinGenererRequest(BaseModel):
    classe_id: uuid.UUID
    periode_id: uuid.UUID


class BulletinLigneResponse(BaseModel):
    id: uuid.UUID
    bulletin_id: uuid.UUID
    matiere_id: uuid.UUID
    note: Decimal | None
    moyenne_classe: Decimal | None
    coefficient: Decimal | None
    statut_competence: str | None
    appreciation: str | None

    model_config = {"from_attributes": True}


class BulletinResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    eleve_id: uuid.UUID
    classe_id: uuid.UUID
    periode_id: uuid.UUID
    moyenne_generale: Decimal | None
    rang: int | None
    effectif_classe: int | None
    mention: str | None
    appreciation_generale: str | None
    type_bulletin: str
    statut: StatutBulletin
    valide_par: uuid.UUID | None
    date_validation: date | None
    created_at: datetime
    updated_at: datetime | None
    lignes: list[BulletinLigneResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}

    @field_serializer("moyenne_generale")
    def serialize_moyenne_generale(self, value: Decimal | None) -> float | None:
        return float(value) if value is not None else None


class ClassementEleve(BaseModel):
    eleve_id: uuid.UUID
    moyenne_generale: Decimal | None
    rang: int | None
    mention: str | None


class MoyenneMatiere(BaseModel):
    matiere_id: uuid.UUID
    moyenne: Decimal


class ResultatsClasseResponse(BaseModel):
    classe_id: uuid.UUID
    periode_id: uuid.UUID
    effectif: int
    type_evaluation: str
    moyennes_par_matiere: list[MoyenneMatiere]
    classement: list[ClassementEleve]
    taux_reussite: Decimal
