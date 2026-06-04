"""Routes d'authentification M1."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import settings
from app.core.database import DbSession
from app.core.security import create_access_token, hash_token, verify_password
from app.models.auth import Session as UserSession, Utilisateur
from app.models.enums import StatutTenant, StatutUtilisateur
from app.models.tenant import Tenant
from app.schemas.auth import LoginRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    request: Request,
    db: DbSession,
) -> TokenResponse:
    """
    Authentification par email, mot de passe et slug tenant.

    Crée un JWT (15 min) et une session avec hash du token.
    """
    tenant = (
        db.query(Tenant)
        .filter(Tenant.slug == body.tenant_slug, Tenant.statut == StatutTenant.ACTIF)
        .first()
    )
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants invalides",
        )

    user = (
        db.query(Utilisateur)
        .filter(
            Utilisateur.tenant_id == tenant.id,
            Utilisateur.email == body.email.lower(),
            Utilisateur.statut == StatutUtilisateur.ACTIF,
        )
        .first()
    )
    if user is None or not verify_password(body.password, user.mot_de_passe_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants invalides",
        )

    expires_delta = timedelta(minutes=settings.jwt_expire_minutes)
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "tenant_id": str(tenant.id),
            "role": user.role.value,
            "email": user.email,
        },
        expires_delta=expires_delta,
    )

    expire_at = datetime.now(UTC) + expires_delta
    session = UserSession(
        utilisateur_id=user.id,
        token_hash=hash_token(access_token),
        ip_address=_client_ip(request),
        expire_at=expire_at,
    )
    user.derniere_connexion = datetime.now(UTC)
    db.add(session)
    db.commit()

    # Contexte pour middlewares sur la même requête (si besoin en aval)
    request.state.tenant_id = tenant.id
    request.state.user_id = str(user.id)

    return TokenResponse(
        access_token=access_token,
        expires_in=int(expires_delta.total_seconds()),
    )
