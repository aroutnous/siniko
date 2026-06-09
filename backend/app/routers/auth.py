"""Routes d'authentification M1 — login multi-tenant."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import DbSession
from app.core.security import CurrentUser, _extract_bearer_token, bearer_scheme, require_permission
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RefreshResponse,
    ResetPasswordConfirm,
    ResetPasswordRequest,
    ResetPasswordResponse,
    UtilisateurCreate,
    UtilisateurCreateResponse,
    UtilisateurListItem,
    UtilisateurPermissionsResponse,
    UtilisateurPermissionsUpdate,
    UtilisateurStatutUpdate,
    UserProfile,
)
from app.models.auth import Utilisateur
from app.models.enums import Permission
from app.services.auth_service import AuthService
from app.services.permissions import PermissionService

UsersManager = Annotated[
    Utilisateur, Depends(require_permission(Permission.UTILISATEURS_GERER.value))
]
UsersPermissionsRead = Annotated[
    Utilisateur, Depends(require_permission(Permission.UTILISATEURS_CONSULTER.value))
]
UsersPermissionsWrite = Annotated[
    Utilisateur, Depends(require_permission(Permission.UTILISATEURS_GERER.value))
]

router = APIRouter(prefix="/auth", tags=["auth"])


def _rate_limit_key(request: Request) -> str:
    """Clé rate limit par IP réelle (supporte X-Forwarded-For derrière proxy)."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_rate_limit_key)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _get_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    return _extract_bearer_token(credentials)


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/10minutes")
def login(
    request: Request,
    body: LoginRequest,
    db: DbSession,
) -> LoginResponse:
    """
    Authentification multi-tenant : email, mot de passe, slug établissement.

    Rate limit : 5 tentatives / 10 minutes par IP (Redis via slowapi).
    """
    service = AuthService(db)
    return service.login(
        email=body.email,
        password=body.password,
        tenant_slug=body.tenant_slug,
        ip_address=_client_ip(request),
    )


@router.post("/logout", response_model=LogoutResponse)
def logout(
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
    token: str = Depends(_get_token),
) -> LogoutResponse:
    """Invalide la session courante (suppression du hash en base)."""
    AuthService(db).logout(token, current_user, _client_ip(request))
    return LogoutResponse()


@router.post("/refresh", response_model=RefreshResponse)
def refresh_token(
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
    token: str = Depends(_get_token),
) -> RefreshResponse:
    """Renouvelle le JWT et met à jour la session."""
    result = AuthService(db).refresh(token, current_user, _client_ip(request))
    return RefreshResponse(**result.model_dump())


@router.post(
    "/reset-password/request",
    response_model=ResetPasswordResponse,
    status_code=200,
)
def reset_password_request(
    request: Request,
    body: ResetPasswordRequest,
    db: DbSession,
) -> ResetPasswordResponse:
    """Demande de reset — réponse identique que l'email existe ou non."""
    return AuthService(db).request_reset(
        email=body.email,
        tenant_slug=body.tenant_slug,
        ip_address=_client_ip(request),
    )


@router.post("/reset-password/confirm", status_code=204)
def reset_password_confirm(
    request: Request,
    body: ResetPasswordConfirm,
    db: DbSession,
) -> None:
    """Confirme le nouveau mot de passe et révoque toutes les sessions."""
    AuthService(db).confirm_reset(
        token=body.token,
        new_password=body.new_password,
        tenant_slug=body.tenant_slug,
        ip_address=_client_ip(request),
    )


@router.get("/me", response_model=UserProfile)
def get_me(
    current_user: CurrentUser,
    db: DbSession,
) -> UserProfile:
    """Profil de l'utilisateur authentifié."""
    return AuthService(db).get_current_user_profile(current_user)


@router.get("/me/permissions", response_model=UtilisateurPermissionsResponse)
def get_my_permissions(
    current_user: CurrentUser,
    db: DbSession,
) -> UtilisateurPermissionsResponse:
    """Permissions de l'utilisateur connecté (sans exiger utilisateurs.read)."""
    permissions = PermissionService(db).get_permissions(
        current_user.id,
        current_user.tenant_id,
    )
    return UtilisateurPermissionsResponse(
        utilisateur_id=current_user.id,
        permissions=permissions,
    )


@router.get("/utilisateurs", response_model=list[UtilisateurListItem])
def list_utilisateurs(
    current_user: UsersManager,
    db: DbSession,
) -> list[UtilisateurListItem]:
    """Liste les utilisateurs du tenant courant."""
    return AuthService(db).list_tenant_users(current_user)


@router.post(
    "/utilisateurs",
    response_model=UtilisateurCreateResponse,
    status_code=201,
)
def create_utilisateur(
    request: Request,
    body: UtilisateurCreate,
    current_user: UsersManager,
    db: DbSession,
) -> UtilisateurCreateResponse:
    """Crée un utilisateur dans le tenant courant (promoteur)."""
    return AuthService(db).create_tenant_user(
        current_user,
        body,
        ip_address=_client_ip(request),
    )


@router.put("/utilisateurs/{user_id}/statut", response_model=UtilisateurListItem)
def update_utilisateur_statut(
    request: Request,
    user_id: uuid.UUID,
    body: UtilisateurStatutUpdate,
    current_user: UsersManager,
    db: DbSession,
) -> UtilisateurListItem:
    """Active ou désactive un utilisateur du tenant."""
    return AuthService(db).update_user_statut(
        current_user,
        user_id,
        body.statut,
        ip_address=_client_ip(request),
    )


@router.get(
    "/utilisateurs/{user_id}/permissions",
    response_model=UtilisateurPermissionsResponse,
)
def get_utilisateur_permissions(
    user_id: uuid.UUID,
    current_user: UsersPermissionsRead,
    db: DbSession,
) -> UtilisateurPermissionsResponse:
    """Liste les permissions dynamiques d'un utilisateur du tenant."""
    permissions = PermissionService(db).get_permissions(
        user_id, current_user.tenant_id
    )
    return UtilisateurPermissionsResponse(
        utilisateur_id=user_id,
        permissions=permissions,
    )


@router.put(
    "/utilisateurs/{user_id}/permissions",
    response_model=UtilisateurPermissionsResponse,
)
def set_utilisateur_permissions(
    request: Request,
    user_id: uuid.UUID,
    body: UtilisateurPermissionsUpdate,
    current_user: UsersPermissionsWrite,
    db: DbSession,
) -> UtilisateurPermissionsResponse:
    """Remplace toutes les permissions d'un utilisateur."""
    PermissionService(db).set_permissions(
        user_id,
        body.permissions,
        current_user.id,
        current_user.tenant_id,
        ip_address=_client_ip(request),
    )
    permissions = PermissionService(db).get_permissions(
        user_id, current_user.tenant_id
    )
    return UtilisateurPermissionsResponse(
        utilisateur_id=user_id,
        permissions=permissions,
    )


@router.post("/change-password", status_code=204)
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: CurrentUser,
    db: DbSession,
    token: str = Depends(_get_token),
) -> None:
    """Change le mot de passe de l'utilisateur connecté."""
    AuthService(db).change_password(
        current_user,
        body,
        current_token=token,
        ip_address=_client_ip(request),
    )
