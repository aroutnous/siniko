"""Logique métier M6 — Reporting & statistiques."""

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models.auth import AuditLog
from app.models.eleve import Absence, Eleve, Inscription
from app.models.enums import (
    RoleUtilisateur,
    StatutBulletin,
    StatutInscription,
    StatutPaiement,
)
from app.models.etablissement import (
    AnneeScolaire,
    Classe,
    Cycle,
    Niveau,
    Periode,
)
from app.models.finance import CaisseJournaliere, Depense, FraisScolaire, Paiement
from app.models.pedagogie import Bulletin
from app.schemas.reporting import (
    HistoriqueItem,
    StatistiquesGlobalesResponse,
    StatsEleves,
    StatsFinancieres,
    StatsResultats,
    TableauBordResponse,
)
from app.services.finance_service import FinanceService


class ReportingService:
    """Tableaux de bord, statistiques et historique."""

    def __init__(self, db: Session, tenant_id: uuid.UUID) -> None:
        self.db = db
        self.tenant_id = tenant_id

    def get_tableau_bord(self, role: RoleUtilisateur) -> TableauBordResponse:
        """KPIs adaptés au rôle de l'utilisateur."""
        donnees: dict[str, Any]

        if role == RoleUtilisateur.PROMOTEUR:
            donnees = self._kpis_promoteur()
        elif role == RoleUtilisateur.DIRECTEUR:
            donnees = self._kpis_directeur()
        elif role == RoleUtilisateur.SECRETAIRE:
            donnees = self._kpis_secretaire()
        elif role == RoleUtilisateur.COMPTABLE:
            donnees = self._kpis_comptable()
        else:
            donnees = {"message": "Aucun tableau de bord pour ce rôle"}

        return TableauBordResponse(
            tenant_id=self.tenant_id,
            role=role,
            generated_at=datetime.now(UTC),
            donnees=donnees,
        )

    def get_statistiques(self, annee_id: uuid.UUID) -> StatistiquesGlobalesResponse:
        annee = self._get_annee(annee_id)
        eleves = self.get_stats_eleves()
        resultats = self.get_stats_resultats(annee_id)
        financieres = self.get_stats_financieres(annee_id)
        taux_paiement = Decimal(str(self.get_taux_paiement(annee_id)))

        return StatistiquesGlobalesResponse(
            tenant_id=self.tenant_id,
            annee_scolaire_id=annee_id,
            generated_at=datetime.now(UTC),
            eleves=eleves,
            resultats=resultats,
            financieres=financieres,
            taux_paiement=taux_paiement,
        )

    def get_stats_eleves(self) -> StatsEleves:
        eleves = (
            self.db.query(Eleve)
            .filter(Eleve.tenant_id == self.tenant_id)
            .all()
        )
        inscriptions = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .all()
        )

        par_classe: dict[str, dict[str, Any]] = {}
        par_niveau: dict[str, dict[str, Any]] = {}
        par_cycle: dict[str, dict[str, Any]] = {}

        for ins in inscriptions:
            classe = (
                self.db.query(Classe)
                .filter(Classe.id == ins.classe_id, Classe.tenant_id == self.tenant_id)
                .first()
            )
            if classe is None:
                continue
            cid = str(classe.id)
            par_classe.setdefault(cid, {"classe_id": cid, "nom": classe.nom, "effectif": 0})
            par_classe[cid]["effectif"] += 1

            niveau = (
                self.db.query(Niveau)
                .filter(Niveau.id == classe.niveau_id, Niveau.tenant_id == self.tenant_id)
                .first()
            )
            if niveau:
                nid = str(niveau.id)
                par_niveau.setdefault(nid, {"niveau_id": nid, "nom": niveau.nom, "effectif": 0})
                par_niveau[nid]["effectif"] += 1

                cycle = (
                    self.db.query(Cycle)
                    .filter(Cycle.id == niveau.cycle_id, Cycle.tenant_id == self.tenant_id)
                    .first()
                )
                if cycle:
                    cyid = str(cycle.id)
                    par_cycle.setdefault(cyid, {"cycle_id": cyid, "nom": cycle.nom, "effectif": 0})
                    par_cycle[cyid]["effectif"] += 1

        return StatsEleves(
            total_eleves=len(eleves),
            par_classe=list(par_classe.values()),
            par_niveau=list(par_niveau.values()),
            par_cycle=list(par_cycle.values()),
        )

    def get_stats_resultats(self, annee_id: uuid.UUID) -> StatsResultats:
        periodes = (
            self.db.query(Periode)
            .filter(
                Periode.tenant_id == self.tenant_id,
                Periode.annee_scolaire_id == annee_id,
            )
            .order_by(Periode.ordre)
            .all()
        )

        par_periode: list[dict[str, Any]] = []
        taux_list: list[float] = []

        for periode in periodes:
            classes = (
                self.db.query(Classe)
                .filter(
                    Classe.tenant_id == self.tenant_id,
                    Classe.annee_scolaire_id == annee_id,
                )
                .all()
            )
            taux_periode: list[float] = []
            for classe in classes:
                taux = self.get_taux_reussite(classe.id, periode.id)
                taux_periode.append(taux)

            moyenne_taux = (
                sum(taux_periode) / len(taux_periode) if taux_periode else 0.0
            )
            taux_list.append(moyenne_taux)
            par_periode.append(
                {
                    "periode_id": str(periode.id),
                    "nom": periode.nom,
                    "taux_reussite_moyen": round(moyenne_taux, 2),
                }
            )

        taux_moyen = sum(taux_list) / len(taux_list) if taux_list else 0.0
        return StatsResultats(
            par_periode=par_periode,
            taux_reussite_moyen=Decimal(str(round(taux_moyen, 2))),
        )

    def get_stats_financieres(self, annee_id: uuid.UUID) -> StatsFinancieres:
        finance = FinanceService(
            db=self.db,
            tenant_id=self.tenant_id,
            utilisateur_id=self.tenant_id,
        )
        situation = finance.get_situation_financiere(annee_id)
        taux = self.get_taux_paiement(annee_id)
        return StatsFinancieres(
            total_recettes=situation.total_recettes,
            total_depenses=situation.total_depenses,
            taux_recouvrement=Decimal(str(round(taux, 2))),
        )

    def get_taux_reussite(self, classe_id: uuid.UUID, periode_id: uuid.UUID) -> float:
        bulletins = (
            self.db.query(Bulletin)
            .filter(
                Bulletin.tenant_id == self.tenant_id,
                Bulletin.classe_id == classe_id,
                Bulletin.periode_id == periode_id,
            )
            .all()
        )
        if not bulletins:
            return 0.0
        reussis = sum(
            1
            for b in bulletins
            if b.moyenne_generale is not None and float(b.moyenne_generale) >= 10
        )
        return round(reussis / len(bulletins) * 100, 2)

    def get_taux_paiement(self, annee_id: uuid.UUID) -> float:
        frais = (
            self.db.query(FraisScolaire)
            .filter(
                FraisScolaire.tenant_id == self.tenant_id,
                FraisScolaire.annee_scolaire_id == annee_id,
            )
            .all()
        )
        total_du = sum((f.montant for f in frais), Decimal("0"))

        inscriptions = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .count()
        )
        total_attendu = total_du * inscriptions if inscriptions else Decimal("0")

        paiements = (
            self.db.query(Paiement)
            .filter(
                Paiement.tenant_id == self.tenant_id,
                Paiement.annee_scolaire_id == annee_id,
                Paiement.statut == StatutPaiement.VALIDE,
            )
            .all()
        )
        total_paye = sum((p.montant_paye for p in paiements), Decimal("0"))

        if total_attendu == 0:
            return 0.0
        return round(float(total_paye / total_attendu * 100), 2)

    def get_historique(self, filtre: dict[str, Any] | None = None) -> list[HistoriqueItem]:
        q = self.db.query(AuditLog).filter(AuditLog.tenant_id == self.tenant_id)
        if filtre:
            if action := filtre.get("action"):
                q = q.filter(AuditLog.action.ilike(f"%{action}%"))
            if table := filtre.get("table_cible"):
                q = q.filter(AuditLog.table_cible == table)
        logs = q.order_by(AuditLog.created_at.desc()).limit(100).all()
        return [
            HistoriqueItem(
                id=log.id,
                action=log.action,
                resultat=log.resultat,
                table_cible=log.table_cible,
                enregistrement_id=log.enregistrement_id,
                created_at=log.created_at,
                details=log.nouvelles_valeurs,
            )
            for log in logs
        ]

    # ── KPIs par rôle ───────────────────────────────────────────────────────

    def _kpis_promoteur(self) -> dict[str, Any]:
        today = date.today()
        debut_mois = today.replace(day=1)

        nb_eleves = (
            self.db.query(Eleve).filter(Eleve.tenant_id == self.tenant_id).count()
        )
        nb_classes = (
            self.db.query(Classe).filter(Classe.tenant_id == self.tenant_id).count()
        )

        annee = (
            self.db.query(AnneeScolaire)
            .filter(
                AnneeScolaire.tenant_id == self.tenant_id,
                AnneeScolaire.est_active.is_(True),
            )
            .first()
        )
        taux_paiement = self.get_taux_paiement(annee.id) if annee else 0.0

        ca_mois = (
            self.db.query(Paiement)
            .filter(
                Paiement.tenant_id == self.tenant_id,
                Paiement.statut == StatutPaiement.VALIDE,
                Paiement.date_paiement >= debut_mois,
                Paiement.date_paiement <= today,
            )
            .all()
        )
        ca = sum((p.montant_paye for p in ca_mois), Decimal("0"))

        return {
            "nb_eleves": nb_eleves,
            "nb_classes": nb_classes,
            "taux_paiement": taux_paiement,
            "ca_mois": float(ca),
        }

    def _kpis_directeur(self) -> dict[str, Any]:
        annee = (
            self.db.query(AnneeScolaire)
            .filter(
                AnneeScolaire.tenant_id == self.tenant_id,
                AnneeScolaire.est_active.is_(True),
            )
            .first()
        )
        taux_reussite = 0.0
        if annee:
            periodes = (
                self.db.query(Periode)
                .filter(
                    Periode.tenant_id == self.tenant_id,
                    Periode.annee_scolaire_id == annee.id,
                )
                .all()
            )
            if periodes:
                stats = self.get_stats_resultats(annee.id)
                taux_reussite = float(stats.taux_reussite_moyen)

        nb_bulletins_valides = (
            self.db.query(Bulletin)
            .filter(
                Bulletin.tenant_id == self.tenant_id,
                Bulletin.statut.in_([StatutBulletin.VALIDE, StatutBulletin.PUBLIE]),
            )
            .count()
        )
        nb_absences = (
            self.db.query(Absence).filter(Absence.tenant_id == self.tenant_id).count()
        )

        return {
            "taux_reussite": taux_reussite,
            "nb_bulletins_valides": nb_bulletins_valides,
            "nb_absences": nb_absences,
        }

    def _kpis_secretaire(self) -> dict[str, Any]:
        today = date.today()
        inscriptions_jour = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.date_inscription == today,
            )
            .count()
        )
        paiements_jour = (
            self.db.query(Paiement)
            .filter(
                Paiement.tenant_id == self.tenant_id,
                Paiement.date_paiement == today,
            )
            .count()
        )
        return {
            "inscriptions_jour": inscriptions_jour,
            "paiements_jour": paiements_jour,
        }

    def _kpis_comptable(self) -> dict[str, Any]:
        today = date.today()
        debut_semaine = today - timedelta(days=today.weekday())

        recettes = (
            self.db.query(Paiement)
            .filter(
                Paiement.tenant_id == self.tenant_id,
                Paiement.statut == StatutPaiement.VALIDE,
                Paiement.date_paiement >= debut_semaine,
                Paiement.date_paiement <= today,
            )
            .all()
        )
        depenses = (
            self.db.query(Depense)
            .filter(
                Depense.tenant_id == self.tenant_id,
                Depense.date_depense >= debut_semaine,
                Depense.date_depense <= today,
            )
            .all()
        )
        total_recettes = sum((p.montant_paye for p in recettes), Decimal("0"))
        total_depenses = sum((d.montant for d in depenses), Decimal("0"))

        caisse = (
            self.db.query(CaisseJournaliere)
            .filter(
                CaisseJournaliere.tenant_id == self.tenant_id,
                CaisseJournaliere.date == today,
            )
            .first()
        )
        solde_caisse = float(
            caisse.solde_ouverture + caisse.total_entrees - caisse.total_sorties
        ) if caisse else 0.0

        return {
            "recettes_semaine": float(total_recettes),
            "depenses_semaine": float(total_depenses),
            "solde_caisse": solde_caisse,
        }

    def _get_annee(self, annee_id: uuid.UUID) -> AnneeScolaire:
        from fastapi import HTTPException, status

        annee = (
            self.db.query(AnneeScolaire)
            .filter(
                AnneeScolaire.id == annee_id,
                AnneeScolaire.tenant_id == self.tenant_id,
            )
            .first()
        )
        if annee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Année scolaire introuvable",
            )
        return annee
