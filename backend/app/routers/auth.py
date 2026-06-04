"""Routes d'authentification M1 — login multi-tenant."""

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import DbSession
from app.core.security import CurrentUser, _extract_bearer_token, bearer_scheme
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RefreshResponse,
    ResetPasswordConfirm,
    ResetPasswordRequest,
    ResetPasswordResponse,
    UserProfile,
)
from app.services.auth_service import AuthService

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
