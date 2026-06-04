"""Service d'écriture des journaux d'audit."""

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.auth import AuditLog

logger = logging.getLogger(__name__)


def log_audit(
    db: Session,
    *,
    action: str,
    resultat: str,
    ip_address: str | None = None,
    tenant_id: uuid.UUID | None = None,
    utilisateur_id: uuid.UUID | None = None,
    table_cible: str | None = None,
    enregistrement_id: uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Enregistre une action dans audit_logs (succès ou échec)."""
    entry = AuditLog(
        tenant_id=tenant_id,
        utilisateur_id=utilisateur_id,
        action=action,
        table_cible=table_cible,
        enregistrement_id=enregistrement_id,
        ip_address=ip_address,
        resultat=resultat,
        nouvelles_valeurs=details,
    )
    try:
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Échec écriture audit: %s", action)
