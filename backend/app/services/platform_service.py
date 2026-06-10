"""Logique métier administration plateforme — Platform Owner (M1)."""

import calendar
import logging
import re
import secrets
import string
import unicodedata
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import set_tenant_context
from app.core.security import hash_password
from app.models.auth import AuditLog, ResetToken, Session as UserSession, Utilisateur, UtilisateurPermission
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
    AbonnementChangePlan,
    AbonnementCreate,
    AbonnementDetailResponse,
    AbonnementExpirantItem,
    AbonnementRenouveler,
    AbonnementResponse,
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
    RepartitionPlanItem,
    RevenusMoisItem,
    RevenusParMoisResponse,
    EvolutionInscriptionItem,
    StatistiquesPlateformeResponse,
    TenantCreate,
    TenantCreateResponse,
    TenantResponse,
    TenantSansPaiementItem,
    TenantUpdate,
    TopTenantItem,
    UtilisateurTenantCreate,
    UtilisateurTenantResponse,
    UtilisateurTenantUpdate,
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

    @staticmethod
    def _add_months(start: date, months: int) -> date:
        year = start.year + (start.month - 1 + months) // 12
        month = (start.month - 1 + months) % 12 + 1
        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, min(start.day, last_day))

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

    def _get_plan_by_id(self, plan_id: uuid.UUID) -> PlanAbonnement:
        plan = self.db.query(PlanAbonnement).filter(PlanAbonnement.id == plan_id).first()
        if plan is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plan introuvable",
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

    def _sum_revenus_periode(self, debut: date, fin: date) -> tuple[Decimal, int]:
        total = Decimal("0")
        nb_factures = 0
        for tenant_id in self._iter_tenant_ids():
            set_tenant_context(self.db, tenant_id)
            factures = (
                self.db.query(FactureTenant)
                .filter(
                    FactureTenant.statut == StatutFacture.PAYEE,
                    FactureTenant.date_paiement.isnot(None),
                    FactureTenant.date_paiement >= debut,
                    FactureTenant.date_paiement <= fin,
                )
                .all()
            )
            nb_factures += len(factures)
            total += sum((f.montant for f in factures), Decimal("0"))
        return total, nb_factures

    def _tenants_map(self) -> dict[uuid.UUID, Tenant]:
        return {t.id: t for t in self.db.query(Tenant).all()}

    def _plans_map(self) -> dict[uuid.UUID, PlanAbonnement]:
        return {p.id: p for p in self.db.query(PlanAbonnement).all()}

    def _find_abonnement(self, abonnement_id: uuid.UUID) -> Abonnement:
        for tenant_id in self._iter_tenant_ids():
            set_tenant_context(self.db, tenant_id)
            abonnement = (
                self.db.query(Abonnement)
                .filter(Abonnement.id == abonnement_id)
                .first()
            )
            if abonnement is not None:
                return abonnement
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Abonnement introuvable",
        )

    def get_dashboard_stats(self) -> DashboardStatsResponse:
        today = date.today()
        debut_mois = today.replace(day=1)
        fin_mois_precedent = debut_mois - timedelta(days=1)
        debut_mois_precedent = fin_mois_precedent.replace(day=1)

        nb_tenants_actifs = (
            self.db.query(Tenant)
            .filter(Tenant.statut == StatutTenant.ACTIF)
            .count()
        )
        nb_tenants_suspendus = (
            self.db.query(Tenant)
            .filter(Tenant.statut == StatutTenant.SUSPENDU)
            .count()
        )
        nb_utilisateurs_total = self.db.query(Utilisateur).count()

        nb_eleves_total = 0
        for tenant_id in self._iter_tenant_ids():
            set_tenant_context(self.db, tenant_id)
            nb_eleves_total += self.db.query(Eleve).count()

        revenus_mois_courant, _ = self._sum_revenus_periode(debut_mois, today)
        revenus_mois_precedent, _ = self._sum_revenus_periode(
            debut_mois_precedent, fin_mois_precedent
        )

        nouveaux_tenants_mois = (
            self.db.query(Tenant)
            .filter(Tenant.created_at >= datetime.combine(debut_mois, datetime.min.time(), tzinfo=UTC))
            .count()
        )

        tenants_map = self._tenants_map()
        plans_map = self._plans_map()
        limite_expiration = today + timedelta(days=7)

        abonnements_expirant_7j: list[AbonnementExpirantItem] = []
        for abonnement in self.get_abonnements():
            if abonnement.statut != StatutAbonnement.ACTIF:
                continue
            if abonnement.date_fin is None:
                continue
            if abonnement.date_fin > limite_expiration:
                continue
            tenant = tenants_map.get(abonnement.tenant_id)
            plan = plans_map.get(abonnement.plan_id)
            abonnements_expirant_7j.append(
                AbonnementExpirantItem(
                    abonnement_id=abonnement.id,
                    tenant_id=abonnement.tenant_id,
                    tenant_nom=tenant.nom if tenant else "—",
                    plan_nom=plan.nom if plan else "—",
                    date_fin=abonnement.date_fin,
                )
            )

        seuil_paiement = today - timedelta(days=30)
        tenants_sans_paiement: list[TenantSansPaiementItem] = []
        for tenant in self.db.query(Tenant).filter(Tenant.statut == StatutTenant.ACTIF).all():
            set_tenant_context(self.db, tenant.id)
            derniere = (
                self.db.query(FactureTenant)
                .filter(
                    FactureTenant.statut == StatutFacture.PAYEE,
                    FactureTenant.date_paiement.isnot(None),
                )
                .order_by(FactureTenant.date_paiement.desc())
                .first()
            )
            if derniere is None or derniere.date_paiement < seuil_paiement:
                jours = (
                    (today - derniere.date_paiement).days
                    if derniere and derniere.date_paiement
                    else 999
                )
                tenants_sans_paiement.append(
                    TenantSansPaiementItem(
                        tenant_id=tenant.id,
                        tenant_nom=tenant.nom,
                        jours_sans_paiement=jours,
                    )
                )

        return DashboardStatsResponse(
            nb_tenants_actifs=nb_tenants_actifs,
            nb_tenants_suspendus=nb_tenants_suspendus,
            nb_eleves_total=nb_eleves_total,
            nb_utilisateurs_total=nb_utilisateurs_total,
            revenus_mois_courant=revenus_mois_courant,
            revenus_mois_precedent=revenus_mois_precedent,
            nouveaux_tenants_mois=nouveaux_tenants_mois,
            abonnements_expirant_7j=abonnements_expirant_7j,
            tenants_sans_paiement=tenants_sans_paiement,
        )

    def get_abonnements_detail(self) -> list[AbonnementDetailResponse]:
        tenants_map = self._tenants_map()
        plans_map = self._plans_map()
        details: list[AbonnementDetailResponse] = []
        for abonnement in self.get_abonnements():
            tenant = tenants_map.get(abonnement.tenant_id)
            plan = plans_map.get(abonnement.plan_id)
            details.append(
                AbonnementDetailResponse(
                    id=abonnement.id,
                    tenant_id=abonnement.tenant_id,
                    tenant_nom=tenant.nom if tenant else "—",
                    plan_id=abonnement.plan_id,
                    plan_nom=plan.nom if plan else "—",
                    date_debut=abonnement.date_debut,
                    date_fin=abonnement.date_fin,
                    statut=abonnement.statut,
                    montant=plan.prix_mensuel if plan else Decimal("0"),
                )
            )
        return details

    def creer_abonnement(self, data: AbonnementCreate) -> AbonnementResponse:
        self._get_tenant(data.tenant_id)
        self._get_plan(data.plan_id)
        set_tenant_context(self.db, data.tenant_id)

        actifs = (
            self.db.query(Abonnement)
            .filter(
                Abonnement.tenant_id == data.tenant_id,
                Abonnement.statut == StatutAbonnement.ACTIF,
            )
            .all()
        )
        for ancien in actifs:
            ancien.statut = StatutAbonnement.EXPIRE

        debut = date.today()
        abonnement = Abonnement(
            tenant_id=data.tenant_id,
            plan_id=data.plan_id,
            date_debut=debut,
            date_fin=self._add_months(debut, data.duree_mois),
            statut=StatutAbonnement.ACTIF,
        )
        self.db.add(abonnement)
        self.db.commit()
        self.db.refresh(abonnement)
        self._audit(
            "platform.abonnement.create",
            "abonnements",
            abonnement.id,
            tenant_id=data.tenant_id,
            details={
                "plan_id": str(data.plan_id),
                "duree_mois": data.duree_mois,
            },
        )
        return AbonnementResponse.model_validate(abonnement)

    def renouveler_abonnement(
        self, abonnement_id: uuid.UUID, data: AbonnementRenouveler
    ) -> AbonnementResponse:
        abonnement = self._find_abonnement(abonnement_id)
        set_tenant_context(self.db, abonnement.tenant_id)
        base = (
            abonnement.date_fin
            if abonnement.date_fin and abonnement.date_fin >= date.today()
            else date.today()
        )
        abonnement.date_fin = self._add_months(base, data.duree_mois)
        abonnement.statut = StatutAbonnement.ACTIF
        self.db.commit()
        self.db.refresh(abonnement)
        self._audit(
            "platform.abonnement.renew",
            "abonnements",
            abonnement.id,
            tenant_id=abonnement.tenant_id,
            details={"duree_mois": data.duree_mois},
        )
        return AbonnementResponse.model_validate(abonnement)

    def changer_plan(
        self, abonnement_id: uuid.UUID, data: AbonnementChangePlan
    ) -> AbonnementResponse:
        abonnement = self._find_abonnement(abonnement_id)
        self._get_plan(data.nouveau_plan_id)
        set_tenant_context(self.db, abonnement.tenant_id)
        ancien_plan_id = abonnement.plan_id
        abonnement.plan_id = data.nouveau_plan_id
        self.db.commit()
        self.db.refresh(abonnement)
        self._audit(
            "platform.abonnement.change_plan",
            "abonnements",
            abonnement.id,
            tenant_id=abonnement.tenant_id,
            details={
                "ancien_plan_id": str(ancien_plan_id),
                "nouveau_plan_id": str(data.nouveau_plan_id),
            },
        )
        return AbonnementResponse.model_validate(abonnement)

    def resilier_abonnement(self, abonnement_id: uuid.UUID) -> AbonnementResponse:
        abonnement = self._find_abonnement(abonnement_id)
        set_tenant_context(self.db, abonnement.tenant_id)
        abonnement.statut = StatutAbonnement.RESILIE
        self.db.commit()
        self.db.refresh(abonnement)
        self._audit(
            "platform.abonnement.cancel",
            "abonnements",
            abonnement.id,
            tenant_id=abonnement.tenant_id,
        )
        return AbonnementResponse.model_validate(abonnement)

    def generer_facture(self, data: FactureCreate) -> FactureDetailResponse:
        self._get_tenant(data.tenant_id)
        set_tenant_context(self.db, data.tenant_id)
        abonnement = (
            self.db.query(Abonnement)
            .filter(
                Abonnement.tenant_id == data.tenant_id,
                Abonnement.statut == StatutAbonnement.ACTIF,
            )
            .order_by(Abonnement.date_debut.desc())
            .first()
        )
        if abonnement is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Aucun abonnement actif pour ce tenant",
            )

        facture = FactureTenant(
            tenant_id=data.tenant_id,
            abonnement_id=abonnement.id,
            montant=data.montant,
            periode=data.description,
            statut=StatutFacture.IMPAYEE,
            date_echeance=date.today() + timedelta(days=30),
        )
        self.db.add(facture)
        self.db.commit()
        self.db.refresh(facture)
        self._audit(
            "platform.facture.create",
            "factures_tenants",
            facture.id,
            tenant_id=data.tenant_id,
            details={"montant": str(data.montant), "description": data.description},
        )
        tenant = self._get_tenant(data.tenant_id)
        return FactureDetailResponse(
            id=facture.id,
            tenant_id=facture.tenant_id,
            tenant_nom=tenant.nom,
            abonnement_id=facture.abonnement_id,
            montant=facture.montant,
            description=facture.periode,
            statut=facture.statut,
            date_echeance=facture.date_echeance,
            date_paiement=facture.date_paiement,
            created_at=facture.created_at,
        )

    def marquer_facture_payee(self, facture_id: uuid.UUID) -> FactureDetailResponse:
        facture: FactureTenant | None = None
        for tenant_id in self._iter_tenant_ids():
            set_tenant_context(self.db, tenant_id)
            facture = (
                self.db.query(FactureTenant)
                .filter(FactureTenant.id == facture_id)
                .first()
            )
            if facture is not None:
                break
        if facture is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Facture introuvable",
            )

        set_tenant_context(self.db, facture.tenant_id)
        facture.statut = StatutFacture.PAYEE
        facture.date_paiement = date.today()
        self.db.commit()
        self.db.refresh(facture)
        self._audit(
            "platform.facture.pay",
            "factures_tenants",
            facture.id,
            tenant_id=facture.tenant_id,
            details={"montant": str(facture.montant)},
        )
        tenant = self._get_tenant(facture.tenant_id)
        return FactureDetailResponse(
            id=facture.id,
            tenant_id=facture.tenant_id,
            tenant_nom=tenant.nom,
            abonnement_id=facture.abonnement_id,
            montant=facture.montant,
            description=facture.periode,
            statut=facture.statut,
            date_echeance=facture.date_echeance,
            date_paiement=facture.date_paiement,
            created_at=facture.created_at,
        )

    def get_factures_detail(
        self, tenant_id: uuid.UUID | None = None
    ) -> list[FactureDetailResponse]:
        tenants_map = self._tenants_map()
        factures = self.get_factures(tenant_id)
        return [
            FactureDetailResponse(
                id=facture.id,
                tenant_id=facture.tenant_id,
                tenant_nom=tenants_map[facture.tenant_id].nom
                if facture.tenant_id in tenants_map
                else "—",
                abonnement_id=facture.abonnement_id,
                montant=facture.montant,
                description=facture.periode,
                statut=facture.statut,
                date_echeance=facture.date_echeance,
                date_paiement=facture.date_paiement,
                created_at=facture.created_at,
            )
            for facture in factures
        ]

    def get_revenus_par_mois(self, annee: int) -> RevenusParMoisResponse:
        mois_items: list[RevenusMoisItem] = []
        total_annuel = Decimal("0")
        for mois in range(1, 13):
            dernier_jour = calendar.monthrange(annee, mois)[1]
            debut = date(annee, mois, 1)
            fin = date(annee, mois, dernier_jour)
            revenus, nb_factures = self._sum_revenus_periode(debut, fin)
            total_annuel += revenus
            mois_items.append(
                RevenusMoisItem(mois=mois, revenus=revenus, nb_factures=nb_factures)
            )
        return RevenusParMoisResponse(
            annee=annee,
            mois=mois_items,
            total_annuel=total_annuel,
        )

    def envoyer_notification_tous(self, data: NotificationCreate) -> dict[str, Any]:
        notification = NotificationPlateforme(
            tenant_id=None,
            emetteur_id=self.utilisateur_id,
            titre=data.titre,
            message=data.message,
            type=TypeNotification.INFO,
        )
        self.db.add(notification)
        self.db.commit()
        self.db.refresh(notification)
        self._audit(
            "platform.notification.send_all",
            "notifications_plateforme",
            notification.id,
            details={"titre": data.titre},
        )
        return {"id": str(notification.id), "cible": "tous", "message": "Notification envoyée"}

    def envoyer_notification_tenant(
        self, tenant_id: uuid.UUID, data: NotificationCreate
    ) -> dict[str, Any]:
        self._get_tenant(tenant_id)
        notification = NotificationPlateforme(
            tenant_id=tenant_id,
            emetteur_id=self.utilisateur_id,
            titre=data.titre,
            message=data.message,
            type=TypeNotification.INFO,
        )
        self.db.add(notification)
        self.db.commit()
        self.db.refresh(notification)
        self._audit(
            "platform.notification.send_tenant",
            "notifications_plateforme",
            notification.id,
            tenant_id=tenant_id,
            details={"titre": data.titre},
        )
        return {
            "id": str(notification.id),
            "cible": "tenant",
            "tenant_id": str(tenant_id),
            "message": "Notification envoyée",
        }

    def get_notifications(
        self, tenant_id: uuid.UUID | None = None
    ) -> list[NotificationDetailResponse]:
        query = self.db.query(NotificationPlateforme)
        if tenant_id is not None:
            self._get_tenant(tenant_id)
            query = query.filter(NotificationPlateforme.tenant_id == tenant_id)
        notifications = query.order_by(NotificationPlateforme.created_at.desc()).limit(200).all()

        emetteur_ids = {n.emetteur_id for n in notifications if n.emetteur_id}
        emetteurs: dict[uuid.UUID, Utilisateur] = {}
        if emetteur_ids:
            for utilisateur in (
                self.db.query(Utilisateur)
                .filter(Utilisateur.id.in_(emetteur_ids))
                .all()
            ):
                emetteurs[utilisateur.id] = utilisateur

        tenants_map = self._tenants_map()
        result: list[NotificationDetailResponse] = []
        for notification in notifications:
            emetteur = (
                emetteurs.get(notification.emetteur_id)
                if notification.emetteur_id
                else None
            )
            tenant = (
                tenants_map.get(notification.tenant_id)
                if notification.tenant_id
                else None
            )
            result.append(
                NotificationDetailResponse(
                    id=notification.id,
                    tenant_id=notification.tenant_id,
                    cible="tenant" if notification.tenant_id else "tous",
                    tenant_nom=tenant.nom if tenant else None,
                    titre=notification.titre,
                    message=notification.message,
                    emetteur_id=notification.emetteur_id,
                    emetteur_nom=(
                        f"{emetteur.prenom} {emetteur.nom}" if emetteur else None
                    ),
                    created_at=notification.created_at,
                )
            )
        return result

    def get_statistiques_plateforme(self) -> StatistiquesPlateformeResponse:
        plans_map = self._plans_map()
        repartition: dict[str, int] = {}
        modules_usage: dict[str, int] = {}

        for abonnement in self.get_abonnements():
            if abonnement.statut != StatutAbonnement.ACTIF:
                continue
            plan = plans_map.get(abonnement.plan_id)
            if plan is None:
                continue
            repartition[plan.nom] = repartition.get(plan.nom, 0) + 1
            for module_key, enabled in (plan.modules_inclus or {}).items():
                if enabled:
                    modules_usage[module_key] = modules_usage.get(module_key, 0) + 1

        today = date.today()
        evolution: list[EvolutionInscriptionItem] = []
        for offset in range(11, -1, -1):
            month = today.month - offset
            year = today.year
            while month <= 0:
                month += 12
                year -= 1
            debut = date(year, month, 1)
            dernier = calendar.monthrange(year, month)[1]
            fin = date(year, month, dernier)
            nb = (
                self.db.query(Tenant)
                .filter(
                    Tenant.created_at
                    >= datetime.combine(debut, datetime.min.time(), tzinfo=UTC),
                    Tenant.created_at
                    <= datetime.combine(fin, datetime.max.time(), tzinfo=UTC),
                )
                .count()
            )
            evolution.append(
                EvolutionInscriptionItem(
                    mois=f"{year}-{month:02d}",
                    nb=nb,
                )
            )

        top_tenants: list[TopTenantItem] = []
        for tenant in self.db.query(Tenant).filter(Tenant.statut == StatutTenant.ACTIF).all():
            set_tenant_context(self.db, tenant.id)
            nb_eleves = self.db.query(Eleve).count()
            top_tenants.append(TopTenantItem(tenant=tenant.nom, nb_eleves=nb_eleves))
        top_tenants.sort(key=lambda item: item.nb_eleves, reverse=True)

        return StatistiquesPlateformeResponse(
            repartition_par_plan=[
                RepartitionPlanItem(plan=nom, nb_tenants=count)
                for nom, count in sorted(repartition.items(), key=lambda x: x[1], reverse=True)
            ],
            evolution_inscriptions=evolution,
            top_tenants_actifs=top_tenants[:5],
            taux_utilisation_modules=modules_usage,
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

    def modifier_plan(self, plan_id: uuid.UUID, data: PlanUpdate) -> PlanResponse:
        plan = self._get_plan_by_id(plan_id)
        changes: dict[str, Any] = {}

        if data.nom is not None:
            plan.nom = data.nom
            changes["nom"] = data.nom
        if data.prix_mensuel is not None:
            plan.prix_mensuel = data.prix_mensuel
            changes["prix_mensuel"] = str(data.prix_mensuel)
        if data.max_eleves is not None:
            plan.limite_eleves = data.max_eleves
            changes["max_eleves"] = data.max_eleves
        if data.max_utilisateurs is not None:
            plan.limite_utilisateurs = data.max_utilisateurs
            changes["max_utilisateurs"] = data.max_utilisateurs
        if data.fonctionnalites is not None:
            plan.modules_inclus = data.fonctionnalites
            changes["fonctionnalites"] = data.fonctionnalites

        self.db.commit()
        self.db.refresh(plan)
        self._audit(
            "platform.plan.update",
            "plans_abonnement",
            plan.id,
            details=changes or None,
        )
        return PlanResponse.from_plan(plan)

    def supprimer_plan(self, plan_id: uuid.UUID) -> None:
        plan = self._get_plan_by_id(plan_id)
        abonnements_actifs = 0

        for tenant_id in self._iter_tenant_ids():
            set_tenant_context(self.db, tenant_id)
            abonnements = (
                self.db.query(Abonnement)
                .filter(Abonnement.plan_id == plan_id)
                .all()
            )
            for abonnement in abonnements:
                if abonnement.statut == StatutAbonnement.ACTIF:
                    abonnements_actifs += 1
                self.db.query(FactureTenant).filter(
                    FactureTenant.abonnement_id == abonnement.id
                ).delete(synchronize_session=False)
                self.db.delete(abonnement)

        nom_plan = plan.nom
        self._audit(
            "platform.plan.delete",
            "plans_abonnement",
            plan.id,
            details={
                "nom": nom_plan,
                "abonnements_actifs_supprimes": abonnements_actifs,
            },
        )
        self.db.delete(plan)
        self.db.commit()

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
            emetteur_id=self.utilisateur_id,
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
        utilisateur_id: uuid.UUID | None = filtre.get("utilisateur_id")

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
            if utilisateur_id is not None:
                query = query.filter(AuditLog.utilisateur_id == utilisateur_id)
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

    def modifier_tenant(self, tenant_id: uuid.UUID, data: TenantUpdate) -> TenantResponse:
        tenant = self._get_tenant(tenant_id)
        changes: dict[str, Any] = {}

        if data.nom is not None:
            tenant.nom = data.nom
            changes["nom"] = data.nom
        if data.email_contact is not None:
            tenant.email = str(data.email_contact).lower()
            changes["email"] = tenant.email
        if data.telephone is not None:
            tenant.telephone = data.telephone
            changes["telephone"] = data.telephone
        if data.adresse is not None:
            tenant.adresse = data.adresse
            changes["adresse"] = data.adresse
        if data.logo_url is not None:
            tenant.logo_url = data.logo_url
            changes["logo_url"] = data.logo_url
        if data.slug is not None:
            new_slug = data.slug.strip().lower()
            if not new_slug:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Slug invalide",
                )
            conflict = (
                self.db.query(Tenant)
                .filter(Tenant.slug == new_slug, Tenant.id != tenant_id)
                .first()
            )
            if conflict is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ce slug est déjà utilisé",
                )
            tenant.slug = new_slug
            changes["slug"] = new_slug

        self.db.commit()
        self.db.refresh(tenant)
        self._audit(
            "platform.tenant.update",
            "tenants",
            tenant.id,
            tenant_id=tenant.id,
            details=changes or None,
        )
        return TenantResponse.model_validate(tenant)

    def supprimer_tenant(self, tenant_id: uuid.UUID) -> None:
        tenant = self._get_tenant(tenant_id)
        set_tenant_context(self.db, tenant_id)

        utilisateur_ids = [
            row[0]
            for row in self.db.query(Utilisateur.id)
            .filter(Utilisateur.tenant_id == tenant_id)
            .all()
        ]

        self.db.query(UtilisateurPermission).filter(
            UtilisateurPermission.tenant_id == tenant_id
        ).delete(synchronize_session=False)

        if utilisateur_ids:
            self.db.query(UserSession).filter(
                UserSession.utilisateur_id.in_(utilisateur_ids)
            ).delete(synchronize_session=False)
            self.db.query(ResetToken).filter(
                ResetToken.utilisateur_id.in_(utilisateur_ids)
            ).delete(synchronize_session=False)

        self.db.query(Abonnement).filter(
            Abonnement.tenant_id == tenant_id
        ).delete(synchronize_session=False)

        self.db.query(FactureTenant).filter(
            FactureTenant.tenant_id == tenant_id
        ).delete(synchronize_session=False)

        self.db.query(Utilisateur).filter(
            Utilisateur.tenant_id == tenant_id
        ).delete(synchronize_session=False)

        nom_tenant = tenant.nom
        slug = tenant.slug
        self._audit(
            "platform.tenant.delete",
            "tenants",
            tenant.id,
            tenant_id=tenant.id,
            details={"nom": nom_tenant, "slug": slug},
        )
        self.db.delete(tenant)
        self.db.commit()

    def get_utilisateurs_tenant(
        self, tenant_id: uuid.UUID
    ) -> list[UtilisateurTenantResponse]:
        tenant = self._get_tenant(tenant_id)
        utilisateurs = (
            self.db.query(Utilisateur)
            .filter(
                Utilisateur.tenant_id == tenant.id,
                Utilisateur.role != RoleUtilisateur.PLATFORM_OWNER,
            )
            .order_by(Utilisateur.nom, Utilisateur.prenom)
            .all()
        )
        return [UtilisateurTenantResponse.model_validate(u) for u in utilisateurs]

    def _get_utilisateur_tenant(
        self, tenant_id: uuid.UUID, utilisateur_id: uuid.UUID
    ) -> Utilisateur:
        self._get_tenant(tenant_id)
        utilisateur = (
            self.db.query(Utilisateur)
            .filter(
                Utilisateur.id == utilisateur_id,
                Utilisateur.tenant_id == tenant_id,
            )
            .first()
        )
        if utilisateur is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Utilisateur introuvable",
            )
        return utilisateur

    def _reassign_permissions_accordees(
        self, utilisateur_id: uuid.UUID, nouveau_accordeur: uuid.UUID
    ) -> None:
        self.db.query(UtilisateurPermission).filter(
            UtilisateurPermission.accordee_par == utilisateur_id
        ).update(
            {UtilisateurPermission.accordee_par: nouveau_accordeur},
            synchronize_session=False,
        )

    def _supprimer_utilisateur_rows(self, utilisateur: Utilisateur) -> None:
        self.db.query(UserSession).filter(
            UserSession.utilisateur_id == utilisateur.id
        ).delete(synchronize_session=False)
        self.db.query(ResetToken).filter(
            ResetToken.utilisateur_id == utilisateur.id
        ).delete(synchronize_session=False)
        self.db.query(UtilisateurPermission).filter(
            UtilisateurPermission.utilisateur_id == utilisateur.id
        ).delete(synchronize_session=False)
        self.db.delete(utilisateur)

    def modifier_utilisateur_tenant(
        self,
        tenant_id: uuid.UUID,
        utilisateur_id: uuid.UUID,
        data: UtilisateurTenantUpdate,
    ) -> UtilisateurTenantResponse:
        utilisateur = self._get_utilisateur_tenant(tenant_id, utilisateur_id)
        changes: dict[str, Any] = {}

        if data.nom is not None:
            utilisateur.nom = data.nom
            changes["nom"] = data.nom
        if data.prenom is not None:
            utilisateur.prenom = data.prenom
            changes["prenom"] = data.prenom
        if data.email is not None:
            email = str(data.email).lower()
            conflict = (
                self.db.query(Utilisateur)
                .filter(
                    Utilisateur.tenant_id == tenant_id,
                    Utilisateur.email == email,
                    Utilisateur.id != utilisateur_id,
                )
                .first()
            )
            if conflict is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email déjà utilisé pour ce tenant",
                )
            utilisateur.email = email
            changes["email"] = email
        if data.role is not None:
            if utilisateur.role == RoleUtilisateur.PROMOTEUR:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Le rôle du promoteur principal ne peut pas être modifié",
                )
            utilisateur.role = data.role
            changes["role"] = data.role.value

        self.db.commit()
        self.db.refresh(utilisateur)
        self._audit(
            "platform.user.update",
            "utilisateurs",
            utilisateur.id,
            tenant_id=tenant_id,
            details=changes or None,
        )
        return UtilisateurTenantResponse.model_validate(utilisateur)

    def supprimer_utilisateur(
        self, tenant_id: uuid.UUID, utilisateur_id: uuid.UUID
    ) -> None:
        utilisateur = self._get_utilisateur_tenant(tenant_id, utilisateur_id)

        if utilisateur.role == RoleUtilisateur.PROMOTEUR:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le promoteur principal ne peut pas être supprimé",
            )

        if utilisateur.id == self.utilisateur_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vous ne pouvez pas supprimer votre propre compte",
            )

        self._reassign_permissions_accordees(utilisateur.id, self.utilisateur_id)
        email = utilisateur.email
        self._supprimer_utilisateur_rows(utilisateur)
        self.db.commit()
        self._audit(
            "platform.user.delete",
            "utilisateurs",
            utilisateur_id,
            tenant_id=tenant_id,
            details={"email": email},
        )

    def reset_password_utilisateur(
        self, tenant_id: uuid.UUID, utilisateur_id: uuid.UUID
    ) -> str:
        utilisateur = self._get_utilisateur_tenant(tenant_id, utilisateur_id)
        mot_de_passe = self._generer_mot_de_passe_temporaire()
        utilisateur.mot_de_passe_hash = hash_password(mot_de_passe)
        self.db.query(UserSession).filter(
            UserSession.utilisateur_id == utilisateur.id
        ).delete(synchronize_session=False)
        self.db.commit()
        self._audit(
            "platform.user.reset_password",
            "utilisateurs",
            utilisateur.id,
            tenant_id=tenant_id,
            details={"email": utilisateur.email},
        )
        return mot_de_passe
