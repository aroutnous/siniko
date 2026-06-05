"""Schémas Pydantic — module M6 Reporting & Documents."""

import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import RoleUtilisateur


class FormatExport(str, Enum):
    PDF = "pdf"
    EXCEL = "excel"


class ExportRequest(BaseModel):
    format: FormatExport
    filtre: dict[str, Any] | None = None


class TableauBordResponse(BaseModel):
    tenant_id: uuid.UUID
    role: RoleUtilisateur
    generated_at: datetime
    donnees: dict[str, Any]


class StatsEleves(BaseModel):
    total_eleves: int
    par_classe: list[dict[str, Any]]
    par_niveau: list[dict[str, Any]]
    par_cycle: list[dict[str, Any]]


class StatsResultats(BaseModel):
    par_periode: list[dict[str, Any]]
    taux_reussite_moyen: Decimal


class StatsFinancieres(BaseModel):
    total_recettes: Decimal
    total_depenses: Decimal
    taux_recouvrement: Decimal


class StatistiquesGlobalesResponse(BaseModel):
    tenant_id: uuid.UUID
    annee_scolaire_id: uuid.UUID
    generated_at: datetime
    eleves: StatsEleves
    resultats: StatsResultats
    financieres: StatsFinancieres
    taux_paiement: Decimal


class HistoriqueItem(BaseModel):
    id: uuid.UUID
    action: str
    resultat: str | None
    table_cible: str | None
    enregistrement_id: uuid.UUID | None
    created_at: datetime
    details: dict[str, Any] | None = None

    model_config = {"from_attributes": True}
