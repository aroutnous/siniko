"""Routes administration plateforme — Platform Owner (M1)."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.core.database import DbSession
from app.core.security import require_permission
from app.models.auth import Utilisateur
from app.models.enums import Permission, StatutTenant
from app.schemas.platform import (
    AbonnementChangePlan,
    AbonnementCreate,
    AbonnementDetailResponse,
    AbonnementRenouveler,
    AbonnementResponse,
    AuditLogResponse,
    DashboardStatsResponse,
    FactureCreate,
    FactureDetailResponse,
    NotificationCreate,
    NotificationDetailResponse,
    NotificationPlateformeCreate,
    PlanCreate,
    PlanResponse,
    PlanUpdate,
    PlatformStatsResponse,
    ResetPasswordResponse,
    RevenusParMoisResponse,
    StatistiquesPlateformeResponse,
    TenantCreate,
    TenantCreateResponse,
    TenantResponse,
    TenantUpdate,
    UtilisateurTenantCreate,
    UtilisateurTenantResponse,
    UtilisateurTenantUpdate,
)
from app.services.platform_service import PlatformService

router = APIRouter(prefix="/platform", tags=["platform"])

PlatformAdmin = Annotated[
    Utilisateur, Depends(require_permission(Permission.PLATFORM_ADMIN.value))
]


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _service(db: DbSession, user: Utilisateur, request: Request) -> PlatformService:
    return PlatformService(
        db=db,
        utilisateur_id=user.id,
        ip_address=_client_ip(request),
    )


@router.get("/stats", response_model=PlatformStatsResponse)
def get_stats_plateforme(
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> PlatformStatsResponse:
    return _service(db, user, request).get_stats_plateforme()


@router.get("/dashboard", response_model=DashboardStatsResponse)
def get_dashboard(
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> DashboardStatsResponse:
    return _service(db, user, request).get_dashboard_stats()


@router.get("/statistiques", response_model=StatistiquesPlateformeResponse)
def get_statistiques(
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> StatistiquesPlateformeResponse:
    return _service(db, user, request).get_statistiques_plateforme()


@router.get("/tenants", response_model=list[TenantResponse])
def list_tenants(
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
    statut: StatutTenant | None = Query(default=None),
) -> list[TenantResponse]:
    return _service(db, user, request).get_tous_tenants(statut)


@router.post(
    "/tenants",
    response_model=TenantCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def creer_tenant(
    body: TenantCreate,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> TenantCreateResponse:
    return _service(db, user, request).creer_tenant(body)


@router.put("/tenants/{tenant_id}", response_model=TenantResponse)
def modifier_tenant(
    tenant_id: uuid.UUID,
    body: TenantUpdate,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> TenantResponse:
    return _service(db, user, request).modifier_tenant(tenant_id, body)


@router.delete("/tenants/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def supprimer_tenant(
    tenant_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> None:
    _service(db, user, request).supprimer_tenant(tenant_id)


@router.put("/tenants/{tenant_id}/suspendre", response_model=TenantResponse)
def suspendre_tenant(
    tenant_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> TenantResponse:
    return _service(db, user, request).suspendre_tenant(tenant_id)


@router.put("/tenants/{tenant_id}/activer", response_model=TenantResponse)
def activer_tenant(
    tenant_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> TenantResponse:
    return _service(db, user, request).activer_tenant(tenant_id)


@router.get("/plans", response_model=list[PlanResponse])
def list_plans(
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> list[PlanResponse]:
    return _service(db, user, request).get_plans()


@router.post(
    "/plans",
    response_model=PlanResponse,
    status_code=status.HTTP_201_CREATED,
)
def creer_plan(
    body: PlanCreate,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> PlanResponse:
    return _service(db, user, request).creer_plan(body)


@router.put("/plans/{plan_id}", response_model=PlanResponse)
def modifier_plan(
    plan_id: uuid.UUID,
    body: PlanUpdate,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> PlanResponse:
    return _service(db, user, request).modifier_plan(plan_id, body)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def supprimer_plan(
    plan_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> None:
    _service(db, user, request).supprimer_plan(plan_id)


@router.get("/abonnements", response_model=list[AbonnementDetailResponse])
def list_abonnements_detail(
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> list[AbonnementDetailResponse]:
    return _service(db, user, request).get_abonnements_detail()


@router.post(
    "/abonnements",
    response_model=AbonnementResponse,
    status_code=status.HTTP_201_CREATED,
)
def creer_abonnement(
    body: AbonnementCreate,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> AbonnementResponse:
    return _service(db, user, request).creer_abonnement(body)


@router.put("/abonnements/{abonnement_id}/renouveler", response_model=AbonnementResponse)
def renouveler_abonnement(
    abonnement_id: uuid.UUID,
    body: AbonnementRenouveler,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> AbonnementResponse:
    return _service(db, user, request).renouveler_abonnement(abonnement_id, body)


@router.put(
    "/abonnements/{abonnement_id}/changer-plan",
    response_model=AbonnementResponse,
)
def changer_plan_abonnement(
    abonnement_id: uuid.UUID,
    body: AbonnementChangePlan,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> AbonnementResponse:
    return _service(db, user, request).changer_plan(abonnement_id, body)


@router.put("/abonnements/{abonnement_id}/resilier", response_model=AbonnementResponse)
def resilier_abonnement(
    abonnement_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> AbonnementResponse:
    return _service(db, user, request).resilier_abonnement(abonnement_id)


@router.get("/factures/revenus", response_model=RevenusParMoisResponse)
def get_revenus_par_mois(
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
    annee: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
) -> RevenusParMoisResponse:
    return _service(db, user, request).get_revenus_par_mois(annee)


@router.get("/factures", response_model=list[FactureDetailResponse])
def list_factures_detail(
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
    tenant_id: uuid.UUID | None = Query(default=None),
) -> list[FactureDetailResponse]:
    return _service(db, user, request).get_factures_detail(tenant_id)


@router.post(
    "/factures",
    response_model=FactureDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def generer_facture(
    body: FactureCreate,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> FactureDetailResponse:
    return _service(db, user, request).generer_facture(body)


@router.put("/factures/{facture_id}/payer", response_model=FactureDetailResponse)
def marquer_facture_payee(
    facture_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> FactureDetailResponse:
    return _service(db, user, request).marquer_facture_payee(facture_id)


@router.post("/notifications/tous", status_code=status.HTTP_201_CREATED)
def envoyer_notification_tous(
    body: NotificationCreate,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> dict[str, str]:
    return _service(db, user, request).envoyer_notification_tous(body)


@router.post(
    "/notifications/tenant/{tenant_id}",
    status_code=status.HTTP_201_CREATED,
)
def envoyer_notification_tenant(
    tenant_id: uuid.UUID,
    body: NotificationCreate,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> dict[str, str]:
    return _service(db, user, request).envoyer_notification_tenant(tenant_id, body)


@router.get("/notifications", response_model=list[NotificationDetailResponse])
def list_notifications(
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
    tenant_id: uuid.UUID | None = Query(default=None),
) -> list[NotificationDetailResponse]:
    return _service(db, user, request).get_notifications(tenant_id)


@router.post("/notifications", status_code=status.HTTP_201_CREATED)
def envoyer_notification(
    body: NotificationPlateformeCreate,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> dict[str, str]:
    return _service(db, user, request).envoyer_notification(body)


@router.get("/audit-logs", response_model=list[AuditLogResponse])
def get_audit_logs_global(
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
    date_debut: date | None = Query(default=None),
    date_fin: date | None = Query(default=None),
    action: str | None = Query(default=None),
    tenant_id: uuid.UUID | None = Query(default=None),
    utilisateur_id: uuid.UUID | None = Query(default=None),
) -> list[AuditLogResponse]:
    filtre = {
        "date_debut": date_debut,
        "date_fin": date_fin,
        "action": action,
        "tenant_id": tenant_id,
        "utilisateur_id": utilisateur_id,
    }
    logs = _service(db, user, request).get_audit_logs_global(filtre)
    return [AuditLogResponse.model_validate(log) for log in logs]


@router.get(
    "/tenants/{tenant_id}/utilisateurs",
    response_model=list[UtilisateurTenantResponse],
)
def list_utilisateurs_tenant(
    tenant_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> list[UtilisateurTenantResponse]:
    return _service(db, user, request).get_utilisateurs_tenant(tenant_id)


@router.post(
    "/tenants/{tenant_id}/utilisateurs",
    response_model=UtilisateurTenantResponse,
    status_code=status.HTTP_201_CREATED,
)
def creer_utilisateur_tenant(
    tenant_id: uuid.UUID,
    body: UtilisateurTenantCreate,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> UtilisateurTenantResponse:
    return _service(db, user, request).creer_utilisateur_tenant(tenant_id, body)


@router.put(
    "/tenants/{tenant_id}/utilisateurs/{user_id}",
    response_model=UtilisateurTenantResponse,
)
def modifier_utilisateur_tenant(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    body: UtilisateurTenantUpdate,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> UtilisateurTenantResponse:
    return _service(db, user, request).modifier_utilisateur_tenant(
        tenant_id, user_id, body
    )


@router.delete(
    "/tenants/{tenant_id}/utilisateurs/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def supprimer_utilisateur_tenant(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> None:
    _service(db, user, request).supprimer_utilisateur(tenant_id, user_id)


@router.post(
    "/tenants/{tenant_id}/utilisateurs/{user_id}/reset-password",
    response_model=ResetPasswordResponse,
)
def reset_password_utilisateur_tenant(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PlatformAdmin,
) -> ResetPasswordResponse:
    mot_de_passe = _service(db, user, request).reset_password_utilisateur(
        tenant_id, user_id
    )
    return ResetPasswordResponse(mot_de_passe_temporaire=mot_de_passe)
