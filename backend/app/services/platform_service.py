"""Logique métier administration plateforme — Platform Owner (M1)."""

import logging
import re
import secrets
import string
import unicodedata
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import set_tenant_context
from app.core.security import hash_password
from app.models.auth import AuditLog, Utilisateur
from app.models.eleve import Eleve
from app.models.enums import (
    RoleUtilisateur,
    StatutAbonnement,
    StatutFacture,
    StatutTenant,
    StatutUtilisateur,
    TypeNotification,
)
from app.models.etablissement import ConfigNotation
from app.models.tenant import (
    Abonnement,
    FactureTenant,
    NotificationPlateforme,
    PlanAbonnement,
    Tenant,
)
from app.schemas.platform import (
    NotificationPlateformeCreate,
    PlanCreate,
    PlanResponse,
    PlatformStatsResponse,
    TenantCreate,
    TenantCreateResponse,
    TenantResponse,
    UtilisateurTenantCreate,
    UtilisateurTenantResponse,
)
from app.services.audit_service import log_audit

logger = logging.getLogger(__name__)


class PlatformService:
    """Opérations cross-tenant réservées au Platform Owner."""

    def __init__(
        self,
        db: Session,
        utilisateur_id: uuid.UUID,
        ip_address: str | None = None,
    ) -> None:
        self.db = db
        self.utilisateur_id = utilisateur_id
        self.ip_address = ip_address

    def _audit(
        self,
        action: str,
        table: str,
        record_id: uuid.UUID | None,
        tenant_id: uuid.UUID | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        log_audit(
            self.db,
            action=action,
            resultat="success",
            tenant_id=tenant_id,
            utilisateur_id=self.utilisateur_id,
            ip_address=self.ip_address,
            table_cible=table,
            enregistrement_id=record_id,
            details=details,
        )

    @staticmethod
    def _generer_slug(nom: str) -> str:
        normalized = unicodedata.normalize("NFKD", nom)
        ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
        slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
        return slug[:80] or "tenant"

    @staticmethod
    def _generer_mot_de_passe_temporaire() -> str:
        alphabet = string.ascii_letters + string.digits + "!@#$%"
        return "".join(secrets.choice(alphabet) for _ in range(12))

    def _slug_disponible(self, base_slug: str) -> str:
        slug = base_slug
        suffix = 1
        while self.db.query(Tenant).filter(Tenant.slug == slug).first() is not None:
            slug = f"{base_slug}-{suffix}"
            suffix += 1
        return slug

    def _get_tenant(self, tenant_id: uuid.UUID) -> Tenant:
        tenant = self.db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if tenant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant introuvable",
            )
        return tenant

    def _get_plan(self, plan_id: uuid.UUID) -> PlanAbonnement:
        plan = (
            self.db.query(PlanAbonnement)
            .filter(PlanAbonnement.id == plan_id, PlanAbonnement.est_actif.is_(True))
            .first()
        )
        if plan is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plan introuvable ou inactif",
            )
        return plan

    def _iter_tenant_ids(self) -> list[uuid.UUID]:
        return [row[0] for row in self.db.query(Tenant.id).all()]

    def _query_rls_table_all_tenants(self, model: type[Any], extra_filter: Any = None) -> list[Any]:
        """Interroge une table soumise au RLS sur tous les tenants."""
        results: list[Any] = []
        for tenant_id in self._iter_tenant_ids():
            set_tenant_context(self.db, tenant_id)
            query = self.db.query(model)
            if extra_filter is not None:
                query = extra_filter(query)
            results.extend(query.all())
        return results

    def creer_tenant(self, data: TenantCreate) -> TenantCreateResponse:
        base_slug = self._generer_slug(data.nom)
        slug = self._slug_disponible(base_slug)
        plan = self._get_plan(data.plan_id)

        tenant = Tenant(
            nom=data.nom,
            slug=slug,
            email=str(data.email).lower(),
            telephone=data.telephone,
            adresse=data.adresse,
            statut=StatutTenant.ACTIF,
        )
        self.db.add(tenant)
        self.db.flush()

        abonnement = Abonnement(
            tenant_id=tenant.id,
            plan_id=plan.id,
            date_debut=date.today(),
            statut=StatutAbonnement.ACTIF,
        )
        self.db.add(abonnement)

        set_tenant_context(self.db, tenant.id)
        self.db.add(
            ConfigNotation(
                tenant_id=tenant.id,
                note_max=Decimal("20.00"),
                note_passage=Decimal("10.00"),
                arrondi=2,
            )
        )

        mot_de_passe = self._generer_mot_de_passe_temporaire()
        promoteur = Utilisateur(
            tenant_id=tenant.id,
            nom=data.promoteur_nom,
            prenom=data.promoteur_prenom,
            email=str(data.promoteur_email).lower(),
            mot_de_passe_hash=hash_password(mot_de_passe),
            role=RoleUtilisateur.PROMOTEUR,
            statut=StatutUtilisateur.ACTIF,
        )
        self.db.add(promoteur)
        self.db.commit()
        self.db.refresh(tenant)

        self._audit(
            "platform.tenant.create",
            "tenants",
            tenant.id,
            tenant_id=tenant.id,
            details={"slug": slug, "plan_id": str(plan.id)},
        )

        logger.info("Tenant créé: %s (%s)", tenant.nom, tenant.slug)
        return TenantCreateResponse(
            tenant=TenantResponse.model_validate(tenant),
            promoteur_email=promoteur.email,
            mot_de_passe_temporaire=mot_de_passe,
        )

    def suspendre_tenant(self, tenant_id: uuid.UUID) -> TenantResponse:
        tenant = self._get_tenant(tenant_id)
        if tenant.statut == StatutTenant.SUSPENDU:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tenant déjà suspendu",
            )
        tenant.statut = StatutTenant.SUSPENDU
        self.db.commit()
        self.db.refresh(tenant)
        self._audit(
            "platform.tenant.suspend",
            "tenants",
            tenant.id,
            tenant_id=tenant.id,
        )
        return TenantResponse.model_validate(tenant)

    def activer_tenant(self, tenant_id: uuid.UUID) -> TenantResponse:
        tenant = self._get_tenant(tenant_id)
        if tenant.statut == StatutTenant.ACTIF:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tenant déjà actif",
            )
        tenant.statut = StatutTenant.ACTIF
        self.db.commit()
        self.db.refresh(tenant)
        self._audit(
            "platform.tenant.activate",
            "tenants",
            tenant.id,
            tenant_id=tenant.id,
        )
        return TenantResponse.model_validate(tenant)

    def get_tous_tenants(self, statut: StatutTenant | None = None) -> list[TenantResponse]:
        query = self.db.query(Tenant)
        if statut is not None:
            query = query.filter(Tenant.statut == statut)
        tenants = query.order_by(Tenant.nom).all()
        return [TenantResponse.model_validate(t) for t in tenants]

    def get_stats_plateforme(self) -> PlatformStatsResponse:
        nb_tenants = (
            self.db.query(Tenant)
            .filter(Tenant.statut == StatutTenant.ACTIF)
            .count()
        )
        nb_utilisateurs_total = self.db.query(Utilisateur).count()

        nb_eleves_total = 0
        for tenant_id in self._iter_tenant_ids():
            set_tenant_context(self.db, tenant_id)
            nb_eleves_total += self.db.query(Eleve).count()

        today = date.today()
        debut_mois = today.replace(day=1)
        revenus_mois = Decimal("0")
        for tenant_id in self._iter_tenant_ids():
            set_tenant_context(self.db, tenant_id)
            factures = (
                self.db.query(FactureTenant)
                .filter(
                    FactureTenant.statut == StatutFacture.PAYEE,
                    FactureTenant.date_paiement.isnot(None),
                    FactureTenant.date_paiement >= debut_mois,
                    FactureTenant.date_paiement <= today,
                )
                .all()
            )
            revenus_mois += sum((f.montant for f in factures), Decimal("0"))

        return PlatformStatsResponse(
            nb_tenants=nb_tenants,
            nb_eleves_total=nb_eleves_total,
            nb_utilisateurs_total=nb_utilisateurs_total,
            revenus_mois=revenus_mois,
        )

    def creer_plan(self, data: PlanCreate) -> PlanResponse:
        plan = PlanAbonnement(
            nom=data.nom,
            prix_mensuel=data.prix_mensuel,
            limite_eleves=data.max_eleves,
            limite_utilisateurs=data.max_utilisateurs,
            modules_inclus=data.fonctionnalites,
            est_actif=True,
        )
        self.db.add(plan)
        self.db.commit()
        self.db.refresh(plan)
        self._audit("platform.plan.create", "plans_abonnement", plan.id)
        return PlanResponse.from_plan(plan)

    def get_plans(self) -> list[PlanResponse]:
        plans = (
            self.db.query(PlanAbonnement)
            .order_by(PlanAbonnement.prix_mensuel)
            .all()
        )
        return [PlanResponse.from_plan(p) for p in plans]

    def get_abonnements(
        self, tenant_id: uuid.UUID | None = None
    ) -> list[Abonnement]:
        if tenant_id is not None:
            self._get_tenant(tenant_id)
            set_tenant_context(self.db, tenant_id)
            return (
                self.db.query(Abonnement)
                .filter(Abonnement.tenant_id == tenant_id)
                .order_by(Abonnement.date_debut.desc())
                .all()
            )
        return self._query_rls_table_all_tenants(
            Abonnement,
            lambda q: q.order_by(Abonnement.date_debut.desc()),
        )

    def get_factures(
        self, tenant_id: uuid.UUID | None = None
    ) -> list[FactureTenant]:
        if tenant_id is not None:
            self._get_tenant(tenant_id)
            set_tenant_context(self.db, tenant_id)
            return (
                self.db.query(FactureTenant)
                .filter(FactureTenant.tenant_id == tenant_id)
                .order_by(FactureTenant.date_echeance.desc())
                .all()
            )
        return self._query_rls_table_all_tenants(
            FactureTenant,
            lambda q: q.order_by(FactureTenant.date_echeance.desc()),
        )

    def envoyer_notification(
        self, data: NotificationPlateformeCreate
    ) -> dict[str, Any]:
        tenant_id: uuid.UUID | None = None
        if data.cible == "tenant":
            if data.tenant_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="tenant_id requis pour cible=tenant",
                )
            self._get_tenant(data.tenant_id)
            tenant_id = data.tenant_id

        notification = NotificationPlateforme(
            tenant_id=tenant_id,
            titre=data.titre,
            message=data.message,
            type=TypeNotification.INFO,
        )
        self.db.add(notification)
        self.db.commit()
        self.db.refresh(notification)

        self._audit(
            "platform.notification.send",
            "notifications_plateforme",
            notification.id,
            tenant_id=tenant_id,
            details={"cible": data.cible},
        )

        return {
            "id": str(notification.id),
            "cible": data.cible,
            "message": "Notification enregistrée",
        }

    def get_audit_logs_global(self, filtre: dict[str, Any]) -> list[AuditLog]:
        date_debut: date | None = filtre.get("date_debut")
        date_fin: date | None = filtre.get("date_fin")
        action: str | None = filtre.get("action")
        tenant_id: uuid.UUID | None = filtre.get("tenant_id")

        def apply_filters(query: Any) -> Any:
            if date_debut is not None:
                query = query.filter(
                    AuditLog.created_at >= datetime.combine(date_debut, datetime.min.time(), tzinfo=UTC)
                )
            if date_fin is not None:
                query = query.filter(
                    AuditLog.created_at
                    <= datetime.combine(date_fin, datetime.max.time(), tzinfo=UTC)
                )
            if action:
                query = query.filter(AuditLog.action.ilike(f"%{action}%"))
            return query.order_by(AuditLog.created_at.desc())

        if tenant_id is not None:
            self._get_tenant(tenant_id)
            set_tenant_context(self.db, tenant_id)
            return apply_filters(self.db.query(AuditLog)).limit(500).all()

        logs = self._query_rls_table_all_tenants(AuditLog, apply_filters)
        logs.sort(key=lambda log: log.created_at, reverse=True)
        return logs[:500]

    def creer_utilisateur_tenant(
        self,
        tenant_id: uuid.UUID,
        data: UtilisateurTenantCreate,
    ) -> UtilisateurTenantResponse:
        tenant = self._get_tenant(tenant_id)
        email = str(data.email).lower()

        existing = (
            self.db.query(Utilisateur)
            .filter(
                Utilisateur.tenant_id == tenant.id,
                Utilisateur.email == email,
            )
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email déjà utilisé pour ce tenant",
            )

        mot_de_passe = data.password or self._generer_mot_de_passe_temporaire()
        utilisateur = Utilisateur(
            tenant_id=tenant.id,
            nom=data.nom,
            prenom=data.prenom,
            email=email,
            mot_de_passe_hash=hash_password(mot_de_passe),
            role=data.role,
            statut=StatutUtilisateur.ACTIF,
        )
        self.db.add(utilisateur)
        self.db.commit()
        self.db.refresh(utilisateur)

        self._audit(
            "platform.user.create",
            "utilisateurs",
            utilisateur.id,
            tenant_id=tenant.id,
            details={"email": email, "role": data.role.value},
        )

        return UtilisateurTenantResponse(
            id=utilisateur.id,
            tenant_id=utilisateur.tenant_id,
            email=utilisateur.email,
            nom=utilisateur.nom,
            prenom=utilisateur.prenom,
            role=utilisateur.role,
            mot_de_passe_temporaire=None if data.password else mot_de_passe,
        )
