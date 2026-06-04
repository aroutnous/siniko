"""Middleware d'isolation tenant : extrait tenant_id du JWT et active le RLS."""

import logging
import uuid
from collections.abc import Callable

from fastapi import Request, Response
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import settings

logger = logging.getLogger(__name__)

# Chemins publics sans contexte tenant (pas de JWT requis)
PUBLIC_PATHS: frozenset[str] = frozenset({
    "/health",
    "/auth/login",
    "/auth/reset-password/request",
    "/auth/reset-password/confirm",
})


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Extrait tenant_id du JWT et le place dans request.state.

    Le RLS PostgreSQL est activé dans get_db() via set_tenant_context().
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Response]
    ) -> Response:
        path = request.url.path.rstrip("/") or "/"

        if path in PUBLIC_PATHS or request.method == "OPTIONS":
            return await call_next(request)

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.lower().startswith("bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Token d'authentification manquant"},
            )

        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm],
            )
        except JWTError:
            logger.warning("JWT invalide pour %s %s", request.method, path)
            return JSONResponse(
                status_code=401,
                content={"detail": "Token invalide ou expiré"},
            )

        tenant_id_raw = payload.get("tenant_id")
        if not tenant_id_raw:
            return JSONResponse(
                status_code=401,
                content={"detail": "Contexte tenant absent du token"},
            )

        try:
            tenant_id = uuid.UUID(str(tenant_id_raw))
        except ValueError:
            return JSONResponse(
                status_code=401,
                content={"detail": "tenant_id invalide"},
            )

        # Contexte propagé à get_db() pour SET app.current_tenant (RLS)
        request.state.tenant_id = tenant_id
        request.state.user_id = payload.get("sub")

        return await call_next(request)
