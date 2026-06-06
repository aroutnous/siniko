"""Routes M5 — Comptabilité & Finance."""

import uuid
from datetime import date
from typing import Annotated, Callable

import json

from fastapi import APIRouter, Depends, Query, Request, status

from app.core.database import DbSession, set_tenant_context
from app.core.security import CurrentUser, require_permission
from app.models.auth import Utilisateur
from app.schemas.finance import (
    CaisseJourResponse,
    DepenseCreate,
    DepenseResponse,
    FraisScolaireCreate,
    FraisScolaireResponse,
    ImpayeResponse,
    PaiementCreate,
    PaiementResponse,
    SalaireCreate,
    SalaireResponse,
    SituationEleveResponse,
    SituationFinanciereResponse,
)
from app.services.finance_service import FinanceService
from app.services.permissions import role_has_permission

router = APIRouter(prefix="/finance", tags=["finance"])


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def require_finance_read() -> Callable[..., Utilisateur]:
    """Lecture : finance.read, finance.manage ou finance.payments."""

    async def checker(current_user: CurrentUser) -> Utilisateur:
        if not (
            role_has_permission(current_user.role, "finance.read")
            or role_has_permission(current_user.role, "finance.manage")
            or role_has_permission(current_user.role, "finance.payments")
        ):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


def require_finance_payments() -> Callable[..., Utilisateur]:
    """Enregistrement paiement : finance.payments ou finance.manage."""

    async def checker(current_user: CurrentUser) -> Utilisateur:
        if not (
            role_has_permission(current_user.role, "finance.payments")
            or role_has_permission(current_user.role, "finance.manage")
        ):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


def require_finance_manage() -> Callable[..., Utilisateur]:
    """Opérations comptables : finance.manage (Comptable, Promoteur)."""

    async def checker(current_user: CurrentUser) -> Utilisateur:
        if not role_has_permission(current_user.role, "finance.manage"):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


FinanceReader = Annotated[Utilisateur, Depends(require_finance_read())]
FinancePayments = Annotated[Utilisateur, Depends(require_finance_payments())]
FinanceManager = Annotated[Utilisateur, Depends(require_finance_manage())]
PaiementsReader = Annotated[Utilisateur, Depends(require_permission("paiements.read"))]


def _service(db: DbSession, user: Utilisateur, request: Request) -> FinanceService:
    return FinanceService(
        db=db,
        tenant_id=user.tenant_id,
        utilisateur_id=user.id,
        ip_address=_client_ip(request),
    )


@router.post(
    "/frais",
    response_model=FraisScolaireResponse,
    status_code=status.HTTP_201_CREATED,
)
def creer_frais(
    body: FraisScolaireCreate,
    request: Request,
    db: DbSession,
    user: FinanceManager,
) -> FraisScolaireResponse:
    return _service(db, user, request).creer_frais(body)


@router.get("/frais", response_model=list[FraisScolaireResponse])
def list_frais(
    request: Request,
    db: DbSession,
    user: FinanceReader,
    niveau_id: uuid.UUID | None = Query(default=None),
    annee_id: uuid.UUID | None = Query(default=None),
) -> list[FraisScolaireResponse]:
    return _service(db, user, request).list_frais(niveau_id, annee_id)


@router.get("/paiements", response_model=list[PaiementResponse])
def list_paiements_jour(
    request: Request,
    db: DbSession,
    user: PaiementsReader,
) -> list[PaiementResponse]:
    return _service(db, user, request).list_paiements_jour()


@router.post(
    "/paiements",
    response_model=PaiementResponse,
    status_code=status.HTTP_201_CREATED,
)
def enregistrer_paiement(
    body: PaiementCreate,
    request: Request,
    db: DbSession,
    user: FinancePayments,
) -> PaiementResponse:
    return _service(db, user, request).enregistrer_paiement(body, user.id)


@router.put("/paiements/{paiement_id}/valider", response_model=PaiementResponse)
def valider_paiement(
    paiement_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: FinanceManager,
) -> PaiementResponse:
    return _service(db, user, request).valider_paiement(paiement_id, user.id)


@router.get("/eleves/{eleve_id}/situation", response_model=SituationEleveResponse)
def get_situation_eleve(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: FinanceReader,
    annee_id: uuid.UUID = Query(...),
) -> SituationEleveResponse:
    return _service(db, user, request).get_situation_eleve(eleve_id, annee_id)


@router.get("/eleves/{eleve_id}/recus", response_model=list[PaiementResponse])
def get_recus_eleve(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: FinanceReader,
) -> list[PaiementResponse]:
    return _service(db, user, request).get_recus_eleve(eleve_id)


@router.post(
    "/depenses",
    response_model=DepenseResponse,
    status_code=status.HTTP_201_CREATED,
)
def enregistrer_depense(
    body: DepenseCreate,
    request: Request,
    db: DbSession,
    user: FinanceManager,
) -> DepenseResponse:
    return _service(db, user, request).enregistrer_depense(body, user.id)


@router.get("/depenses", response_model=list[DepenseResponse])
def list_depenses(
    request: Request,
    db: DbSession,
    user: FinanceReader,
    date_debut: date | None = Query(default=None),
    date_fin: date | None = Query(default=None),
) -> list[DepenseResponse]:
    return _service(db, user, request).list_depenses(date_debut, date_fin)


@router.post(
    "/salaires",
    response_model=SalaireResponse,
    status_code=status.HTTP_201_CREATED,
)
def payer_salaire(
    body: SalaireCreate,
    request: Request,
    db: DbSession,
    user: FinanceManager,
) -> SalaireResponse:
    return _service(db, user, request).payer_salaire(body)


@router.get("/caisse", response_model=CaisseJourResponse)
def get_caisse_jour(
    request: Request,
    db: DbSession,
    user: FinanceManager,
    target_date: date | None = Query(default=None, alias="date"),
    cloturer: bool = Query(default=False),
) -> CaisseJourResponse:
    return _service(db, user, request).get_caisse_jour(
        target_date or date.today(),
        cloturer=cloturer,
    )


@router.get("/situation", response_model=SituationFinanciereResponse)
def get_situation_financiere(
    request: Request,
    db: DbSession,
    user: FinanceReader,
    annee_id: uuid.UUID = Query(...),
) -> SituationFinanciereResponse:
    return _service(db, user, request).get_situation_financiere(annee_id)


@router.get("/impayes", response_model=list[ImpayeResponse])
def get_liste_impayes(
    request: Request,
    db: DbSession,
    user: Annotated[Utilisateur, Depends(require_permission("finance.read"))],
    annee_id: uuid.UUID = Query(...),
) -> list[ImpayeResponse]:
    rows = _service(db, user, request).get_liste_impayes(annee_id)
    return [ImpayeResponse.model_validate(row) for row in rows]


@router.get("/transactions", response_model=list[PaiementResponse])
def get_historique_transactions(
    request: Request,
    db: DbSession,
    user: Annotated[Utilisateur, Depends(require_permission("finance.read"))],
    date_debut: date | None = Query(default=None),
    date_fin: date | None = Query(default=None),
) -> list[PaiementResponse]:
    paiements = _service(db, user, request).get_historique_transactions(
        date_debut, date_fin
    )
    return [PaiementResponse.model_validate(p) for p in paiements]


@router.post("/webhook/mobile-money", status_code=status.HTTP_201_CREATED)
async def webhook_mobile_money(
    request: Request,
    db: DbSession,
) -> dict[str, object]:
    raw_body = await request.body()
    signature = request.headers.get("X-Webhook-Signature")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Corps JSON invalide",
        ) from exc

    tenant_id_raw = payload.get("tenant_id")
    if not tenant_id_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tenant_id requis",
        )
    tenant_id = uuid.UUID(str(tenant_id_raw))
    set_tenant_context(db, tenant_id)

    return FinanceService(
        db=db,
        tenant_id=tenant_id,
        ip_address=_client_ip(request),
    ).webhook_mobile_money(raw_body, signature, payload)
