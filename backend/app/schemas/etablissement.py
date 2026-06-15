"""Schémas Pydantic — module M2 Gestion établissement."""

import uuid
from datetime import date
from decimal import Decimal

from typing import Literal

from pydantic import BaseModel, Field, model_validator

TypeEvaluation = Literal["chiffree", "qualitative"]
VALEURS_QUALITATIVES = ("acquis", "en_cours_acquisition", "non_acquis")


class CycleCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    ordre: int = Field(default=0, ge=0)
    type_evaluation: TypeEvaluation = "chiffree"
    note_max: Decimal | None = Field(default=Decimal("20.00"), gt=0)
    note_passage: Decimal | None = Field(default=Decimal("10.00"), ge=0)
    arrondi: int | None = Field(default=2, ge=0, le=4)
    valeur_systeme_ref: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_notation(self) -> "CycleCreate":
        if self.type_evaluation == "qualitative":
            object.__setattr__(self, "note_max", None)
            object.__setattr__(self, "note_passage", None)
            object.__setattr__(self, "arrondi", None)
        elif self.note_passage is not None and self.note_max is not None:
            if self.note_passage > self.note_max:
                raise ValueError("note_passage ne peut pas dépasser note_max")
        return self


class CycleUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    ordre: int | None = Field(default=None, ge=0)
    type_evaluation: TypeEvaluation | None = None
    note_max: Decimal | None = Field(default=None, gt=0)
    note_passage: Decimal | None = Field(default=None, ge=0)
    arrondi: int | None = Field(default=None, ge=0, le=4)
    valeur_systeme_ref: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_notation(self) -> "CycleUpdate":
        if self.type_evaluation == "qualitative":
            object.__setattr__(self, "note_max", None)
            object.__setattr__(self, "note_passage", None)
            object.__setattr__(self, "arrondi", None)
        elif (
            self.note_passage is not None
            and self.note_max is not None
            and self.note_passage > self.note_max
        ):
            raise ValueError("note_passage ne peut pas dépasser note_max")
        return self


class CycleResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    nom: str
    description: str | None
    ordre: int
    type_evaluation: str
    note_max: Decimal | None
    note_passage: Decimal | None
    arrondi: int | None
    valeur_systeme_ref: str | None

    model_config = {"from_attributes": True}


class ClasseCreate(BaseModel):
    cycle_id: uuid.UUID
    nom: str = Field(..., min_length=1, max_length=100)
    ordre: int = Field(default=0, ge=0)
    valeur_systeme_ref: str | None = Field(default=None, max_length=255)


class ClasseUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    ordre: int | None = Field(default=None, ge=0)
    valeur_systeme_ref: str | None = Field(default=None, max_length=255)


class ClasseResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    cycle_id: uuid.UUID
    nom: str
    ordre: int
    valeur_systeme_ref: str | None

    model_config = {"from_attributes": True}


class SalleCreate(BaseModel):
    classe_id: uuid.UUID | None = None
    annee_scolaire_id: uuid.UUID
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    nom_salle: str | None = Field(default=None, min_length=1, max_length=100)
    capacite: int | None = Field(default=None, ge=1)
    niveau_id: uuid.UUID | None = Field(default=None, exclude=True)
    capacite_max: int | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def resolve_legacy_fields(self) -> "SalleCreate":
        if self.niveau_id is not None and self.classe_id is None:
            object.__setattr__(self, "classe_id", self.niveau_id)
        if self.classe_id is None:
            raise ValueError("classe_id requis")
        if not self.nom_salle and self.nom:
            object.__setattr__(self, "nom_salle", self.nom)
        if not self.nom and self.nom_salle:
            object.__setattr__(self, "nom", self.nom_salle)
        if not self.nom and not self.nom_salle:
            raise ValueError("nom_salle ou nom requis")
        return self


class SalleUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    nom_salle: str | None = Field(default=None, min_length=1, max_length=100)
    capacite: int | None = Field(default=None, ge=1)
    capacite_max: int | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def resolve_capacite(self) -> "SalleUpdate":
        if self.capacite_max is not None and self.capacite is None:
            object.__setattr__(self, "capacite", self.capacite_max)
        return self


class SalleResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    classe_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    nom: str
    nom_salle: str | None
    capacite: int | None

    model_config = {"from_attributes": True}

    @classmethod
    def from_salle(cls, salle: object) -> "SalleResponse":
        data = SalleResponse.model_validate(salle)
        return data


class SalleEffectifResponse(BaseModel):
    salle_id: uuid.UUID
    effectif: int
    capacite: int | None
    est_complete: bool


# Alias rétrocompatibilité API
NiveauCreate = ClasseCreate
NiveauUpdate = ClasseUpdate
NiveauResponse = ClasseResponse
ClasseEffectifResponse = SalleEffectifResponse


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


class SequenceEvaluationCreate(BaseModel):
    cycle_id: uuid.UUID
    periode_id: uuid.UUID
    nom: str = Field(..., min_length=1, max_length=100)
    date_debut: date | None = None
    date_fin: date | None = None
    ordre: int = Field(default=0, ge=0)


class SequenceEvaluationUpdate(BaseModel):
    cycle_id: uuid.UUID | None = None
    periode_id: uuid.UUID | None = None
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    date_debut: date | None = None
    date_fin: date | None = None
    ordre: int | None = Field(default=None, ge=0)


class SequenceEvaluationResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    cycle_id: uuid.UUID
    periode_id: uuid.UUID
    nom: str
    date_debut: date | None
    date_fin: date | None
    ordre: int

    model_config = {"from_attributes": True}


class MatiereCreate(BaseModel):
    classe_id: uuid.UUID | None = None
    nom: str = Field(..., min_length=1, max_length=100)
    coefficient: Decimal = Field(default=Decimal("1.00"), gt=0)
    note_max: Decimal | None = Field(default=None, gt=0)
    est_obligatoire: bool = True
    est_domaine_competence: bool = False
    ordre: int = Field(default=0, ge=0)
    est_active: bool = True
    enseignant_principal_id: uuid.UUID | None = None
    enseignant_assistant_id: uuid.UUID | None = None
    niveau_id: uuid.UUID | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def resolve_niveau_id(self) -> "MatiereCreate":
        if self.niveau_id is not None and self.classe_id is None:
            object.__setattr__(self, "classe_id", self.niveau_id)
        if self.classe_id is None:
            raise ValueError("classe_id requis")
        return self


class MatiereUpdate(BaseModel):
    classe_id: uuid.UUID | None = None
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    coefficient: Decimal | None = Field(default=None, gt=0)
    note_max: Decimal | None = Field(default=None, gt=0)
    est_obligatoire: bool | None = None
    est_domaine_competence: bool | None = None
    ordre: int | None = Field(default=None, ge=0)
    est_active: bool | None = None
    enseignant_principal_id: uuid.UUID | None = None
    enseignant_assistant_id: uuid.UUID | None = None


class MatiereResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    classe_id: uuid.UUID
    nom: str
    coefficient: Decimal
    note_max: Decimal | None
    note_max_effective: Decimal | None = None
    est_obligatoire: bool
    est_domaine_competence: bool
    ordre: int
    est_active: bool
    enseignant_principal_id: uuid.UUID | None
    enseignant_assistant_id: uuid.UUID | None
    cycle_id: uuid.UUID | None = None
    cycle_nom: str | None = None
    classe_nom: str | None = None
    enseignant_principal_nom: str | None = None
    enseignant_assistant_nom: str | None = None

    model_config = {"from_attributes": True}


class ClasseStructureResponse(ClasseResponse):
    salles: list[SalleResponse] = Field(default_factory=list)
    matieres: list[MatiereResponse] = Field(default_factory=list)


class CycleStructureResponse(CycleResponse):
    classes: list[ClasseStructureResponse] = Field(default_factory=list)


# Alias structure
NiveauStructureResponse = ClasseStructureResponse


class EtablissementStructure(BaseModel):
    cycles: list[CycleStructureResponse] = Field(default_factory=list)
    annees_scolaires: list[AnneeScolaireResponse] = Field(default_factory=list)
    annee_active: AnneeScolaireResponse | None = None


class DupliquerStructureResponse(BaseModel):
    salles_copiees: int
    matieres_copiees: int
    message: str
    classes_copiees: int | None = None


class WizardPeriodeItem(BaseModel):
    periode: str
    date_debut: date
    date_fin: date


class WizardClasseItem(BaseModel):
    classe: str
    cycle: str


class WizardSalleItem(BaseModel):
    classe: str
    nom_salle: str
    capacite: int = Field(..., ge=1)


class WizardMatiereItem(BaseModel):
    classe: str
    nom: str
    coefficient: Decimal = Field(default=Decimal("1.00"), gt=0)
    est_domaine_competence: bool = False


class WizardEtablissementData(BaseModel):
    annee_scolaire: str
    periodes: list[WizardPeriodeItem]
    cycles_selectionnes: list[str]
    classes_selectionnees: list[WizardClasseItem]
    salles: list[WizardSalleItem]
    matieres: list[WizardMatiereItem]


class WizardEtablissementResponse(BaseModel):
    annee_scolaire_id: uuid.UUID
    periodes_creees: int
    classes_creees: int
    salles_creees: int
    matieres_creees: int
    message: str
