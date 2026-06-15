"""Schémas Pydantic — module M3 Gestion des élèves."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import (
    SexeEleve,
    StatutEleve,
    StatutInscription,
    TypeAbsence,
)


class EleveCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=100)
    prenom: str = Field(..., min_length=1, max_length=100)
    date_naissance: date | None = None
    lieu_naissance: str | None = Field(default=None, max_length=150)
    sexe: SexeEleve | None = None
    photo_url: str | None = Field(default=None, max_length=512)
    nom_parent: str | None = Field(default=None, max_length=200)
    telephone_parent: str | None = Field(default=None, max_length=50)
    adresse: str | None = None


class EleveInscrireCreate(EleveCreate):
    """Inscription complète : élève + affectation classe/année."""

    classe_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    date_inscription: date | None = None


class EleveUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    prenom: str | None = Field(default=None, min_length=1, max_length=100)
    date_naissance: date | None = None
    lieu_naissance: str | None = Field(default=None, max_length=150)
    sexe: SexeEleve | None = None
    photo_url: str | None = Field(default=None, max_length=512)
    nom_parent: str | None = Field(default=None, max_length=200)
    telephone_parent: str | None = Field(default=None, max_length=50)
    adresse: str | None = None
    statut: StatutEleve | None = None


class EleveResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    matricule: str
    nom: str
    prenom: str
    date_naissance: date | None
    lieu_naissance: str | None
    sexe: SexeEleve | None
    photo_url: str | None
    nom_parent: str | None
    telephone_parent: str | None
    adresse: str | None
    statut: StatutEleve
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class EleveListResponse(EleveResponse):
    """Élève avec libellé de salle pour les listes."""

    salle_nom: str | None = None
    salle_id: uuid.UUID | None = None


class EleveInscrireResponse(BaseModel):
    eleve: EleveResponse
    inscription: "InscriptionResponse"


class InscriptionCreate(BaseModel):
    eleve_id: uuid.UUID
    classe_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    date_inscription: date | None = None


class InscriptionResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    eleve_id: uuid.UUID
    classe_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    date_inscription: date
    statut: StatutInscription
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class SalleInscriptionBrief(BaseModel):
    """Données salle pour l'affichage dans le dossier élève."""

    id: uuid.UUID
    nom: str
    nom_salle: str | None
    niveau_nom: str | None = None


class InscriptionDossierResponse(InscriptionResponse):
    """Inscription enrichie avec le libellé complet de la salle."""

    salle_nom: str | None = None
    salle: SalleInscriptionBrief | None = None


class AbsenceCreate(BaseModel):
    classe_id: uuid.UUID
    date_absence: date
    type: TypeAbsence
    justifiee: bool = False
    motif: str | None = None


class AbsenceJustifierRequest(BaseModel):
    motif: str = Field(..., min_length=1, max_length=2000)


class AbsenceResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    eleve_id: uuid.UUID
    classe_id: uuid.UUID
    date_absence: date
    type: TypeAbsence
    justifiee: bool
    motif: str | None
    saisi_par: uuid.UUID | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class TransfertRequest(BaseModel):
    classe_id: uuid.UUID
    annee_scolaire_id: uuid.UUID | None = None


class DossierEleveResponse(BaseModel):
    eleve: EleveResponse
    inscriptions: list[InscriptionDossierResponse]
    absences: list[AbsenceResponse]
    salle_active_nom: str | None = None


class AbsenceStatistiquesResponse(BaseModel):
    classe_id: uuid.UUID
    total: int
    absences: int
    retards: int
    justifiees: int
    non_justifiees: int


class ClasseAbsencesResponse(BaseModel):
    absences: list[AbsenceResponse]
    statistiques: AbsenceStatistiquesResponse


EleveInscrireResponse.model_rebuild()
