"""Schémas Pydantic — module M2 Gestion établissement."""

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class CycleCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    ordre: int = Field(default=0, ge=0)


class CycleUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    ordre: int | None = Field(default=None, ge=0)


class CycleResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    nom: str
    description: str | None
    ordre: int

    model_config = {"from_attributes": True}


class NiveauCreate(BaseModel):
    cycle_id: uuid.UUID
    nom: str = Field(..., min_length=1, max_length=100)
    ordre: int = Field(default=0, ge=0)


class NiveauUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    ordre: int | None = Field(default=None, ge=0)


class NiveauResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    cycle_id: uuid.UUID
    nom: str
    ordre: int

    model_config = {"from_attributes": True}


class AnneeScolaireCreate(BaseModel):
    libelle: str = Field(..., min_length=1, max_length=50)
    date_debut: date
    date_fin: date
    est_active: bool = False


class AnneeScolaireUpdate(BaseModel):
    libelle: str | None = Field(default=None, min_length=1, max_length=50)
    date_debut: date | None = None
    date_fin: date | None = None
    est_active: bool | None = None


class AnneeScolaireResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    libelle: str
    date_debut: date
    date_fin: date
    est_active: bool

    model_config = {"from_attributes": True}


class PeriodeCreate(BaseModel):
    annee_scolaire_id: uuid.UUID
    nom: str = Field(..., min_length=1, max_length=100)
    date_debut: date
    date_fin: date
    ordre: int = Field(default=0, ge=0)


class PeriodeUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    date_debut: date | None = None
    date_fin: date | None = None
    ordre: int | None = Field(default=None, ge=0)


class PeriodeResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    nom: str
    date_debut: date
    date_fin: date
    ordre: int

    model_config = {"from_attributes": True}


class ClasseCreate(BaseModel):
    niveau_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    nom: str = Field(..., min_length=1, max_length=100)
    capacite_max: int | None = Field(default=None, ge=1)


class ClasseUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    capacite_max: int | None = Field(default=None, ge=1)


class ClasseResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    niveau_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    nom: str
    capacite_max: int | None

    model_config = {"from_attributes": True}


class ClasseEffectifResponse(BaseModel):
    classe_id: uuid.UUID
    effectif: int
    capacite_max: int | None
    est_complete: bool


class MatiereCreate(BaseModel):
    niveau_id: uuid.UUID
    nom: str = Field(..., min_length=1, max_length=100)
    coefficient: Decimal = Field(default=Decimal("1.00"), gt=0)
    est_active: bool = True


class MatiereUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    coefficient: Decimal | None = Field(default=None, gt=0)
    est_active: bool | None = None


class MatiereResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    niveau_id: uuid.UUID
    nom: str
    coefficient: Decimal
    est_active: bool

    model_config = {"from_attributes": True}


class ConfigNotationCreate(BaseModel):
    note_max: Decimal = Field(default=Decimal("20.00"), gt=0)
    note_passage: Decimal = Field(default=Decimal("10.00"), ge=0)
    arrondi: int = Field(default=2, ge=0, le=4)


class ConfigNotationUpdate(BaseModel):
    note_max: Decimal | None = Field(default=None, gt=0)
    note_passage: Decimal | None = Field(default=None, ge=0)
    arrondi: int | None = Field(default=None, ge=0, le=4)


class ConfigNotationResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    note_max: Decimal
    note_passage: Decimal
    arrondi: int

    model_config = {"from_attributes": True}


class NiveauStructureResponse(NiveauResponse):
    classes: list[ClasseResponse] = Field(default_factory=list)
    matieres: list[MatiereResponse] = Field(default_factory=list)


class CycleStructureResponse(CycleResponse):
    niveaux: list[NiveauStructureResponse] = Field(default_factory=list)


class EtablissementStructure(BaseModel):
    cycles: list[CycleStructureResponse] = Field(default_factory=list)
    annees_scolaires: list[AnneeScolaireResponse] = Field(default_factory=list)
    annee_active: AnneeScolaireResponse | None = None


class EtablissementConfig(BaseModel):
    structure: EtablissementStructure
    config_notation: ConfigNotationResponse


class DupliquerStructureResponse(BaseModel):
    classes_copiees: int
    matieres_copiees: int
    message: str
