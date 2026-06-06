"""Schémas Pydantic — module M5 Comptabilité & Finance."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import ModePaiement, StatutPaiement, StatutSalaire


class FraisScolaireCreate(BaseModel):
    niveau_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    libelle: str = Field(..., min_length=1, max_length=255)
    montant: Decimal = Field(..., gt=0)
    est_obligatoire: bool = True


class FraisScolaireResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    niveau_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    libelle: str
    montant: Decimal
    est_obligatoire: bool
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class PaiementCreate(BaseModel):
    eleve_id: uuid.UUID
    frais_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    montant_paye: Decimal = Field(..., gt=0)
    mode_paiement: ModePaiement
    date_paiement: date | None = None


class PaiementResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    eleve_id: uuid.UUID
    frais_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    montant_paye: Decimal
    mode_paiement: ModePaiement
    reference_transaction: str | None
    encaisse_par: uuid.UUID | None
    date_paiement: date
    statut: StatutPaiement
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class DepenseCreate(BaseModel):
    categorie: str = Field(..., min_length=1, max_length=100)
    libelle: str = Field(..., min_length=1)
    montant: Decimal = Field(..., gt=0)
    date_depense: date
    justificatif_url: str | None = Field(default=None, max_length=512)


class DepenseResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    categorie: str
    libelle: str
    montant: Decimal
    date_depense: date
    saisi_par: uuid.UUID | None
    justificatif_url: str | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class SalaireCreate(BaseModel):
    employe_id: uuid.UUID
    mois: date
    montant_brut: Decimal = Field(..., gt=0)
    montant_net: Decimal = Field(..., gt=0)


class SalaireResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    employe_id: uuid.UUID
    mois: date
    montant_brut: Decimal
    montant_net: Decimal
    statut: StatutSalaire
    date_paiement: date | None
    valide_par: uuid.UUID | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class CaisseResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    date: date
    solde_ouverture: Decimal
    total_entrees: Decimal
    total_sorties: Decimal
    solde_cloture: Decimal
    cloture_par: uuid.UUID | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class CaisseJourResponse(BaseModel):
    """Vue caisse du jour avec solde calculé."""

    caisse: CaisseResponse
    solde_actuel: Decimal


class FraisEleveItem(BaseModel):
    frais_id: uuid.UUID
    libelle: str
    montant: Decimal
    montant_paye: Decimal
    reste: Decimal


class SituationEleveResponse(BaseModel):
    eleve_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    total_du: Decimal
    total_paye: Decimal
    reste_a_payer: Decimal
    frais: list[FraisEleveItem]


class SituationFinanciereResponse(BaseModel):
    annee_scolaire_id: uuid.UUID
    total_recettes: Decimal
    total_depenses: Decimal
    total_salaires: Decimal
    solde: Decimal


class ImpayeResponse(BaseModel):
    eleve_id: uuid.UUID
    matricule: str
    nom: str
    prenom: str
    total_du: Decimal
    total_paye: Decimal
    montant_restant: Decimal


class MobileMoneyWebhookPayload(BaseModel):
    tenant_id: uuid.UUID
    eleve_id: uuid.UUID
    frais_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    montant_paye: Decimal = Field(..., gt=0)
    reference_externe: str = Field(..., min_length=1, max_length=100)
