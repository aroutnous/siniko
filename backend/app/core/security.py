"""JWT, hachage bcrypt et contrôle d'accès par permission."""

import hashlib
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from functools import wraps
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import DbSession
from app.models.enums import StatutUtilisateur
from app.models.auth import Utilisateur
from app.services.permissions import role_has_permission

# cost=12 conforme aux règles projet (bcrypt)
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
)

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash un mot de passe avec bcrypt (cost=12)."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Compare un mot de passe en clair avec son hash bcrypt."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_token(token: str) -> str:
    """Hash SHA-256 du JWT pour stockage en session (jamais le token brut)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    """Crée un JWT signé avec expiration configurable."""
    to_encode = data.copy()
    expire = datetime.now(UTC) + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.jwt_expire_minutes)
    )
    # JWT exige un timestamp Unix pour exp
    to_encode["exp"] = int(expire.timestamp())
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    """
    Décode et valide un JWT.

    Lève HTTPException 401 si le token est invalide ou expiré.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def _extract_bearer_token(
    credentials: HTTPAuthorizationCredentials | None,
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification requise",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ],
    db: DbSession,
) -> Utilisateur:
    """
    Dependency FastAPI : utilisateur courant depuis le JWT.

    Filtre par tenant_id et statut ACTIF.
    """
    token = _extract_bearer_token(credentials)
    payload = decode_token(token)

    user_id_raw = payload.get("sub")
    tenant_id_raw = payload.get("tenant_id")
    if not user_id_raw or not tenant_id_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token incomplet",
        )

    try:
        user_id = uuid.UUID(str(user_id_raw))
        tenant_id = uuid.UUID(str(tenant_id_raw))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants token invalides",
        ) from exc

    user = (
        db.query(Utilisateur)
        .filter(
            Utilisateur.id == user_id,
            Utilisateur.tenant_id == tenant_id,
            Utilisateur.statut == StatutUtilisateur.ACTIF,
        )
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur introuvable ou inactif",
        )
    return user


CurrentUser = Annotated[Utilisateur, Depends(get_current_user)]


def require_permission(permission: str) -> Callable[..., Any]:
    """
    Factory de dependency : refuse l'accès si le rôle n'a pas la permission.

    Usage sur une route :
        @router.get("/...", dependencies=[Depends(require_permission("users.read"))])
    ou :
        def endpoint(user: Utilisateur = Depends(require_permission("users.read"))): ...
    """

    async def permission_checker(
        current_user: CurrentUser,
    ) -> Utilisateur:
        if not role_has_permission(current_user.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return permission_checker


def require_permission_decorator(permission: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """
    Décorateur pour les fonctions de route (wrapper autour de Depends).

    Préférer Depends(require_permission(...)) pour les routes FastAPI.
    """

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            current_user: Utilisateur | None = kwargs.get("current_user")
            if current_user is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Utilisateur non authentifié",
                )
            if not role_has_permission(current_user.role, permission):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Permission insuffisante",
                )
            return await func(*args, **kwargs)

        return wrapper

    return decorator
