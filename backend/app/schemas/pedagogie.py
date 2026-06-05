"""Schémas Pydantic — module M4 Gestion pédagogique."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import StatutBulletin


class NoteCreate(BaseModel):
    eleve_id: uuid.UUID
    matiere_id: uuid.UUID
    periode_id: uuid.UUID
    classe_id: uuid.UUID
    valeur: Decimal = Field(..., ge=0, le=20)
    appreciation: str | None = None


class NoteUpdate(BaseModel):
    valeur: Decimal | None = Field(default=None, ge=0, le=20)
    appreciation: str | None = None


class NoteResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    eleve_id: uuid.UUID
    matiere_id: uuid.UUID
    periode_id: uuid.UUID
    classe_id: uuid.UUID
    valeur: Decimal
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
    note: Decimal
    moyenne_classe: Decimal | None
    coefficient: Decimal
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
    statut: StatutBulletin
    valide_par: uuid.UUID | None
    date_validation: date | None
    created_at: datetime
    updated_at: datetime | None
    lignes: list[BulletinLigneResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


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
    moyennes_par_matiere: list[MoyenneMatiere]
    classement: list[ClassementEleve]
    taux_reussite: Decimal
