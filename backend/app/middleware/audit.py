"""Middleware d'audit : enregistre chaque requête HTTP dans audit_logs."""

import logging
import uuid
from collections.abc import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.database import SessionLocal
from app.models.auth import AuditLog

logger = logging.getLogger(__name__)

# Ne pas auditer le health check (bruit opérationnel)
SKIP_AUDIT_PATHS: frozenset[str] = frozenset({"/health"})


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _resultat_from_status(status_code: int) -> str:
    if status_code < 400:
        return "success"
    if status_code < 500:
        return "client_error"
    return "server_error"


class AuditMiddleware(BaseHTTPMiddleware):
    """
    Journalise user_id, action, IP, timestamp et résultat après chaque requête.

    Utilise une session DB dédiée pour ne pas interférer avec la session métier.
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Response]
    ) -> Response:
        path = request.url.path.rstrip("/") or "/"
        response = await call_next(request)

        if path in SKIP_AUDIT_PATHS:
            return response

        action = f"{request.method} {request.url.path}"
        user_id_raw = getattr(request.state, "user_id", None)
        tenant_id: uuid.UUID | None = getattr(request.state, "tenant_id", None)
        resultat = _resultat_from_status(response.status_code)

        utilisateur_id: uuid.UUID | None = None
        if user_id_raw:
            try:
                utilisateur_id = uuid.UUID(str(user_id_raw))
            except ValueError:
                utilisateur_id = None

        # Sans tenant_id (ex. login public échoué) : log applicatif uniquement
        if tenant_id is None:
            logger.info(
                "audit sans tenant action=%s resultat=%s ip=%s",
                action,
                resultat,
                _client_ip(request),
            )
            return response

        db = SessionLocal()
        try:
            log_entry = AuditLog(
                tenant_id=tenant_id,
                utilisateur_id=utilisateur_id,
                action=action,
                table_cible=None,
                ip_address=_client_ip(request),
                resultat=resultat,
                nouvelles_valeurs={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                },
            )
            db.add(log_entry)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Échec écriture audit_logs pour %s", action)
        finally:
            db.close()

        return response
