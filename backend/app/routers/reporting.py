"""Routes M6 — Reporting & Documents."""

import uuid
from typing import Annotated, Callable

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse

from app.core.database import DbSession
from app.core.security import CurrentUser
from app.models.auth import Utilisateur
from app.schemas.reporting import (
    FormatExport,
    StatistiquesGlobalesResponse,
    TableauBordResponse,
)
from app.services.export_service import ExportService
from app.services.impression_service import ImpressionService
from app.services.reporting_service import ReportingService
from app.models.enums import Permission
from app.services.permissions import user_has_any_permission, user_has_permission

router = APIRouter(prefix="/reporting", tags=["reporting"])

PDF_MEDIA = "application/pdf"
EXCEL_MEDIA = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


def require_reports_read() -> Callable[..., Utilisateur]:
    """Stats et exports : reports.read (Directeur, Comptable, Promoteur)."""

    async def checker(current_user: CurrentUser, db: DbSession) -> Utilisateur:
        if not user_has_any_permission(
            db,
            current_user,
            Permission.RAPPORTS_FINANCIERS.value,
            Permission.STATISTIQUES_PEDAGOGIE.value,
            Permission.STATISTIQUES_FINANCE.value,
        ):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


def require_reports_impressions() -> Callable[..., Utilisateur]:
    """Impressions : reports.impressions ou reports.read."""

    async def checker(current_user: CurrentUser, db: DbSession) -> Utilisateur:
        if not user_has_any_permission(
            db,
            current_user,
            Permission.RAPPORTS_IMPRIMER.value,
            Permission.RAPPORTS_FINANCIERS.value,
            Permission.DOCUMENTS_RAPPORTS.value,
        ):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


def require_reports_dashboard() -> Callable[..., Utilisateur]:
    """Tableau de bord : rapports.read ou rapports.imprimer (Secrétaire inclus)."""

    async def checker(current_user: CurrentUser, db: DbSession) -> Utilisateur:
        if not user_has_any_permission(
            db,
            current_user,
            Permission.RAPPORTS_FINANCIERS.value,
            Permission.RAPPORTS_IMPRIMER.value,
            Permission.STATISTIQUES_PEDAGOGIE.value,
            Permission.STATISTIQUES_FINANCE.value,
        ):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


ReportsReader = Annotated[Utilisateur, Depends(require_reports_read())]
ReportsDashboard = Annotated[Utilisateur, Depends(require_reports_dashboard())]
ReportsImpressions = Annotated[Utilisateur, Depends(require_reports_impressions())]


def _reporting(db: DbSession, user: Utilisateur) -> ReportingService:
    return ReportingService(db=db, tenant_id=user.tenant_id)


def _export() -> ExportService:
    return ExportService()


def _impression(db: DbSession, user: Utilisateur) -> ImpressionService:
    return ImpressionService(db=db, tenant_id=user.tenant_id)


def _stream_bytes(data: bytes, media_type: str, filename: str) -> StreamingResponse:
    return StreamingResponse(
        iter([data]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/tableau-bord", response_model=TableauBordResponse)
def get_tableau_bord(
    db: DbSession,
    user: ReportsDashboard,
) -> TableauBordResponse:
    return _reporting(db, user).get_tableau_bord(user.role)


@router.get("/statistiques", response_model=StatistiquesGlobalesResponse)
def get_statistiques(
    db: DbSession,
    user: ReportsReader,
    annee_id: uuid.UUID = Query(...),
) -> StatistiquesGlobalesResponse:
    return _reporting(db, user).get_statistiques(annee_id)


@router.get("/exports/rapport-financier")
def export_rapport_financier(
    db: DbSession,
    user: ReportsReader,
    annee_id: uuid.UUID = Query(...),
    format: FormatExport = Query(default=FormatExport.PDF),
) -> StreamingResponse:
    data = _export().exporter_rapport_financier(
        db, user.tenant_id, annee_id, format
    )
    if format == FormatExport.PDF:
        return _stream_bytes(data, PDF_MEDIA, "rapport-financier.pdf")
    return _stream_bytes(data, EXCEL_MEDIA, "rapport-financier.xlsx")


@router.get("/exports/resultats-classe")
def export_resultats_classe(
    db: DbSession,
    user: ReportsReader,
    classe_id: uuid.UUID = Query(...),
    periode_id: uuid.UUID = Query(...),
    format: FormatExport = Query(default=FormatExport.EXCEL),
) -> StreamingResponse:
    data = _export().exporter_resultats_classe(
        db, user.tenant_id, classe_id, periode_id, format
    )
    if format == FormatExport.PDF:
        return _stream_bytes(data, PDF_MEDIA, "resultats-classe.pdf")
    return _stream_bytes(data, EXCEL_MEDIA, "resultats-classe.xlsx")


@router.get("/impressions/bulletin/{bulletin_id}")
def imprimer_bulletin(
    bulletin_id: uuid.UUID,
    db: DbSession,
    user: ReportsImpressions,
) -> StreamingResponse:
    data = _impression(db, user).imprimer_bulletin(bulletin_id)
    return _stream_bytes(data, PDF_MEDIA, f"bulletin-{bulletin_id}.pdf")


@router.get("/impressions/recu/{paiement_id}")
def imprimer_recu(
    paiement_id: uuid.UUID,
    db: DbSession,
    user: ReportsImpressions,
) -> StreamingResponse:
    data = _impression(db, user).imprimer_recu(paiement_id)
    return _stream_bytes(data, PDF_MEDIA, f"recu-{paiement_id}.pdf")


@router.get("/impressions/liste-classe/{classe_id}")
def imprimer_liste_classe(
    classe_id: uuid.UUID,
    db: DbSession,
    user: ReportsImpressions,
) -> StreamingResponse:
    data = _impression(db, user).imprimer_liste_classe(classe_id)
    return _stream_bytes(data, PDF_MEDIA, f"liste-classe-{classe_id}.pdf")


@router.get("/impressions/attestation/{eleve_id}")
def imprimer_attestation(
    eleve_id: uuid.UUID,
    db: DbSession,
    user: ReportsImpressions,
) -> StreamingResponse:
    data = _impression(db, user).imprimer_attestation(eleve_id)
    return _stream_bytes(data, PDF_MEDIA, f"attestation-{eleve_id}.pdf")
