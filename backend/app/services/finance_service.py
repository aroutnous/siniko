"""Logique métier M5 — Comptabilité & Finance."""

import hashlib
import hmac
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings

from app.models.eleve import Eleve, Inscription
from app.models.enums import (
    ModePaiement,
    StatutInscription,
    StatutPaiement,
    StatutSalaire,
)
from app.models.etablissement import AnneeScolaire, Classe, Niveau
from app.models.finance import CaisseJournaliere, Depense, FraisScolaire, Paiement, Salaire
from app.models.auth import Utilisateur
from app.schemas.finance import (
    CaisseJourResponse,
    CaisseResponse,
    DepenseCreate,
    DepenseResponse,
    FraisEleveItem,
    FraisScolaireCreate,
    FraisScolaireResponse,
    PaiementCreate,
    PaiementResponse,
    SalaireCreate,
    SalaireResponse,
    SituationEleveResponse,
    SituationFinanciereResponse,
)
from app.services.audit_service import log_audit

# Modes nécessitant une validation comptable avant mise à jour caisse
_MODES_VALIDATION_REQUISE = frozenset(
    {ModePaiement.MOBILE_MONEY, ModePaiement.VIREMENT, ModePaiement.CHEQUE}
)


class FinanceService:
    """Frais, paiements immutables, dépenses, salaires et caisse."""

    def __init__(
        self,
        db: Session,
        tenant_id: uuid.UUID,
        utilisateur_id: uuid.UUID | None = None,
        ip_address: str | None = None,
    ) -> None:
        self.db = db
        self.tenant_id = tenant_id
        self.utilisateur_id = utilisateur_id
        self.ip_address = ip_address

    def _audit(
        self,
        action: str,
        table: str,
        record_id: uuid.UUID | None,
        resultat: str = "success",
        details: dict[str, Any] | None = None,
    ) -> None:
        log_audit(
            self.db,
            action=action,
            resultat=resultat,
            tenant_id=self.tenant_id,
            utilisateur_id=self.utilisateur_id,
            ip_address=self.ip_address,
            table_cible=table,
            enregistrement_id=record_id,
            details=details,
        )

    def generer_reference(self) -> str:
        """Format PAY-YYYYMMDD-XXXX, unique par tenant."""
        today = datetime.now(UTC).date()
        prefix = f"PAY-{today.strftime('%Y%m%d')}-"
        existing = (
            self.db.query(Paiement)
            .filter(
                Paiement.tenant_id == self.tenant_id,
                Paiement.reference_transaction.like(f"{prefix}%"),
            )
            .count()
        )
        return f"{prefix}{existing + 1:04d}"

    def creer_frais(self, data: FraisScolaireCreate) -> FraisScolaireResponse:
        self._get_niveau(data.niveau_id)
        self._get_annee(data.annee_scolaire_id)

        frais = FraisScolaire(
            tenant_id=self.tenant_id,
            niveau_id=data.niveau_id,
            annee_scolaire_id=data.annee_scolaire_id,
            libelle=data.libelle,
            montant=data.montant,
            est_obligatoire=data.est_obligatoire,
        )
        self.db.add(frais)
        self.db.commit()
        self.db.refresh(frais)
        return FraisScolaireResponse.model_validate(frais)

    def list_frais(
        self,
        niveau_id: uuid.UUID | None = None,
        annee_id: uuid.UUID | None = None,
    ) -> list[FraisScolaireResponse]:
        q = self.db.query(FraisScolaire).filter(
            FraisScolaire.tenant_id == self.tenant_id
        )
        if niveau_id is not None:
            self._get_niveau(niveau_id)
            q = q.filter(FraisScolaire.niveau_id == niveau_id)
        if annee_id is not None:
            self._get_annee(annee_id)
            q = q.filter(FraisScolaire.annee_scolaire_id == annee_id)
        frais = q.order_by(FraisScolaire.libelle).all()
        return [FraisScolaireResponse.model_validate(f) for f in frais]

    def enregistrer_paiement(
        self,
        data: PaiementCreate,
        saisi_par: uuid.UUID,
    ) -> PaiementResponse:
        """Crée un paiement immuable avec référence auto."""
        eleve = self._get_eleve(data.eleve_id)
        frais = self._get_frais(data.frais_id)
        self._get_annee(data.annee_scolaire_id)

        if frais.annee_scolaire_id != data.annee_scolaire_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le frais ne correspond pas à l'année scolaire",
            )

        statut_initial = (
            StatutPaiement.EN_ATTENTE
            if data.mode_paiement in _MODES_VALIDATION_REQUISE
            else StatutPaiement.VALIDE
        )

        paiement = Paiement(
            tenant_id=self.tenant_id,
            eleve_id=eleve.id,
            frais_id=frais.id,
            annee_scolaire_id=data.annee_scolaire_id,
            montant_paye=data.montant_paye,
            mode_paiement=data.mode_paiement,
            reference_transaction=self.generer_reference(),
            encaisse_par=saisi_par,
            date_paiement=data.date_paiement or date.today(),
            statut=statut_initial,
        )
        self.db.add(paiement)
        self.db.commit()
        self.db.refresh(paiement)

        if statut_initial == StatutPaiement.VALIDE:
            self._ajouter_entree_caisse(paiement.date_paiement, paiement.montant_paye)

        return PaiementResponse.model_validate(paiement)

    def list_paiements_jour(self) -> list[PaiementResponse]:
        """Paiements créés aujourd'hui pour le tenant courant."""
        today = date.today()
        paiements = (
            self.db.query(Paiement)
            .filter(
                Paiement.tenant_id == self.tenant_id,
                func.date(Paiement.created_at) == today,
            )
            .order_by(Paiement.created_at.desc())
            .all()
        )
        return [PaiementResponse.model_validate(p) for p in paiements]

    def valider_paiement(
        self,
        paiement_id: uuid.UUID,
        valideur_id: uuid.UUID,
    ) -> PaiementResponse:
        """Transition EN_ATTENTE → VALIDE (seule modification autorisée)."""
        paiement = self._get_paiement(paiement_id)

        if paiement.statut == StatutPaiement.VALIDE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ce paiement est déjà validé",
            )
        if paiement.statut == StatutPaiement.ANNULE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ce paiement est annulé",
            )
        if paiement.statut != StatutPaiement.EN_ATTENTE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Seuls les paiements en attente peuvent être validés",
            )

        paiement.statut = StatutPaiement.VALIDE
        self.db.commit()
        self.db.refresh(paiement)

        self._ajouter_entree_caisse(paiement.date_paiement, paiement.montant_paye)
        self._audit("finance.paiement.validate", "paiements", paiement.id)

        return PaiementResponse.model_validate(paiement)

    def get_situation_eleve(
        self,
        eleve_id: uuid.UUID,
        annee_id: uuid.UUID,
    ) -> SituationEleveResponse:
        eleve = self._get_eleve(eleve_id)
        self._get_annee(annee_id)

        niveau_id = self._get_niveau_eleve(eleve.id)
        frais_list = (
            self.db.query(FraisScolaire)
            .filter(
                FraisScolaire.tenant_id == self.tenant_id,
                FraisScolaire.niveau_id == niveau_id,
                FraisScolaire.annee_scolaire_id == annee_id,
            )
            .all()
        )

        paiements = (
            self.db.query(Paiement)
            .filter(
                Paiement.tenant_id == self.tenant_id,
                Paiement.eleve_id == eleve.id,
                Paiement.annee_scolaire_id == annee_id,
                Paiement.statut == StatutPaiement.VALIDE,
            )
            .all()
        )

        paye_par_frais: dict[uuid.UUID, Decimal] = {}
        for p in paiements:
            paye_par_frais[p.frais_id] = paye_par_frais.get(p.frais_id, Decimal("0")) + p.montant_paye

        frais_items: list[FraisEleveItem] = []
        total_du = Decimal("0")
        total_paye = Decimal("0")

        for frais in frais_list:
            montant_paye = paye_par_frais.get(frais.id, Decimal("0"))
            reste = max(frais.montant - montant_paye, Decimal("0"))
            frais_items.append(
                FraisEleveItem(
                    frais_id=frais.id,
                    libelle=frais.libelle,
                    montant=frais.montant,
                    montant_paye=montant_paye,
                    reste=reste,
                )
            )
            total_du += frais.montant
            total_paye += montant_paye

        return SituationEleveResponse(
            eleve_id=eleve.id,
            annee_scolaire_id=annee_id,
            total_du=total_du,
            total_paye=total_paye,
            reste_a_payer=max(total_du - total_paye, Decimal("0")),
            frais=frais_items,
        )

    def get_recus_eleve(self, eleve_id: uuid.UUID) -> list[PaiementResponse]:
        self._get_eleve(eleve_id)
        paiements = (
            self.db.query(Paiement)
            .filter(
                Paiement.tenant_id == self.tenant_id,
                Paiement.eleve_id == eleve_id,
                Paiement.statut == StatutPaiement.VALIDE,
            )
            .order_by(Paiement.date_paiement.desc())
            .all()
        )
        return [PaiementResponse.model_validate(p) for p in paiements]

    def list_depenses(
        self,
        date_debut: date | None = None,
        date_fin: date | None = None,
    ) -> list[DepenseResponse]:
        q = self.db.query(Depense).filter(Depense.tenant_id == self.tenant_id)
        if date_debut is not None:
            q = q.filter(Depense.date_depense >= date_debut)
        if date_fin is not None:
            q = q.filter(Depense.date_depense <= date_fin)
        depenses = q.order_by(Depense.date_depense.desc()).all()
        return [DepenseResponse.model_validate(d) for d in depenses]

    def enregistrer_depense(
        self,
        data: DepenseCreate,
        saisi_par: uuid.UUID,
    ) -> DepenseResponse:
        depense = Depense(
            tenant_id=self.tenant_id,
            categorie=data.categorie,
            libelle=data.libelle,
            montant=data.montant,
            date_depense=data.date_depense,
            saisi_par=saisi_par,
            justificatif_url=data.justificatif_url,
        )
        self.db.add(depense)
        self.db.commit()
        self.db.refresh(depense)

        self._ajouter_sortie_caisse(data.date_depense, data.montant)
        return DepenseResponse.model_validate(depense)

    def payer_salaire(self, data: SalaireCreate) -> SalaireResponse:
        self._get_employe(data.employe_id)

        salaire = Salaire(
            tenant_id=self.tenant_id,
            employe_id=data.employe_id,
            mois=data.mois,
            montant_brut=data.montant_brut,
            montant_net=data.montant_net,
            statut=StatutSalaire.PAYE,
            date_paiement=date.today(),
            valide_par=self.utilisateur_id,
        )
        self.db.add(salaire)
        self.db.commit()
        self.db.refresh(salaire)

        self._ajouter_sortie_caisse(date.today(), data.montant_net)
        self._audit("finance.salaire.pay", "salaires", salaire.id)
        return SalaireResponse.model_validate(salaire)

    def get_caisse_jour(
        self,
        target_date: date,
        *,
        cloturer: bool = False,
    ) -> CaisseJourResponse:
        caisse = self._get_or_create_caisse(target_date)

        if cloturer and caisse.cloture_par is None:
            caisse.solde_cloture = (
                caisse.solde_ouverture + caisse.total_entrees - caisse.total_sorties
            )
            caisse.cloture_par = self.utilisateur_id
            self.db.commit()
            self.db.refresh(caisse)
            self._audit("finance.caisse.close", "caisse_journaliere", caisse.id)

        solde_actuel = (
            caisse.solde_ouverture + caisse.total_entrees - caisse.total_sorties
        )
        return CaisseJourResponse(
            caisse=CaisseResponse.model_validate(caisse),
            solde_actuel=solde_actuel,
        )

    def get_situation_financiere(
        self,
        annee_id: uuid.UUID,
    ) -> SituationFinanciereResponse:
        annee = self._get_annee(annee_id)

        recettes = (
            self.db.query(Paiement)
            .filter(
                Paiement.tenant_id == self.tenant_id,
                Paiement.annee_scolaire_id == annee_id,
                Paiement.statut == StatutPaiement.VALIDE,
            )
            .all()
        )
        total_recettes = sum((p.montant_paye for p in recettes), Decimal("0"))

        depenses = (
            self.db.query(Depense)
            .filter(
                Depense.tenant_id == self.tenant_id,
                Depense.date_depense >= annee.date_debut,
                Depense.date_depense <= annee.date_fin,
            )
            .all()
        )
        total_depenses = sum((d.montant for d in depenses), Decimal("0"))

        salaires = (
            self.db.query(Salaire)
            .filter(
                Salaire.tenant_id == self.tenant_id,
                Salaire.statut == StatutSalaire.PAYE,
                Salaire.mois >= annee.date_debut,
                Salaire.mois <= annee.date_fin,
            )
            .all()
        )
        total_salaires = sum((s.montant_net for s in salaires), Decimal("0"))

        solde = total_recettes - total_depenses - total_salaires

        return SituationFinanciereResponse(
            annee_scolaire_id=annee_id,
            total_recettes=total_recettes,
            total_depenses=total_depenses,
            total_salaires=total_salaires,
            solde=solde,
        )

    def get_liste_impayes(self, annee_id: uuid.UUID) -> list[dict[str, Any]]:
        """Élèves avec frais dus supérieurs aux paiements validés."""
        self._get_annee(annee_id)
        inscriptions = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.annee_scolaire_id == annee_id,
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .all()
        )

        impayes: list[dict[str, Any]] = []
        for inscription in inscriptions:
            situation = self.get_situation_eleve(inscription.eleve_id, annee_id)
            if situation.reste_a_payer <= Decimal("0"):
                continue
            eleve = self._get_eleve(inscription.eleve_id)
            impayes.append(
                {
                    "eleve_id": eleve.id,
                    "matricule": eleve.matricule,
                    "nom": eleve.nom,
                    "prenom": eleve.prenom,
                    "total_du": situation.total_du,
                    "total_paye": situation.total_paye,
                    "montant_restant": situation.reste_a_payer,
                }
            )
        return sorted(impayes, key=lambda row: row["nom"])

    def get_historique_transactions(
        self,
        date_debut: date | None = None,
        date_fin: date | None = None,
    ) -> list[Paiement]:
        """Historique des paiements sur une période."""
        q = self.db.query(Paiement).filter(Paiement.tenant_id == self.tenant_id)
        if date_debut is not None:
            q = q.filter(Paiement.date_paiement >= date_debut)
        if date_fin is not None:
            q = q.filter(Paiement.date_paiement <= date_fin)
        return q.order_by(Paiement.date_paiement.desc(), Paiement.created_at.desc()).all()

    def webhook_mobile_money(
        self,
        raw_body: bytes,
        signature: str | None,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Callback opérateur Mobile Money — validation HMAC puis création paiement."""
        if not self._verifier_signature_webhook(raw_body, signature):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Signature webhook invalide",
            )

        from app.schemas.finance import MobileMoneyWebhookPayload

        data = MobileMoneyWebhookPayload.model_validate(payload)
        if data.tenant_id != self.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="tenant_id incohérent",
            )

        existing = (
            self.db.query(Paiement)
            .filter(
                Paiement.tenant_id == self.tenant_id,
                Paiement.reference_transaction == data.reference_externe,
            )
            .first()
        )
        if existing is not None:
            return {
                "status": "duplicate",
                "paiement_id": str(existing.id),
                "message": "Paiement déjà enregistré",
            }

        eleve = self._get_eleve(data.eleve_id)
        frais = self._get_frais(data.frais_id)
        self._get_annee(data.annee_scolaire_id)

        if frais.annee_scolaire_id != data.annee_scolaire_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le frais ne correspond pas à l'année scolaire",
            )

        paiement = Paiement(
            tenant_id=self.tenant_id,
            eleve_id=eleve.id,
            frais_id=frais.id,
            annee_scolaire_id=data.annee_scolaire_id,
            montant_paye=data.montant_paye,
            mode_paiement=ModePaiement.MOBILE_MONEY,
            reference_transaction=data.reference_externe,
            encaisse_par=None,
            date_paiement=date.today(),
            statut=StatutPaiement.VALIDE,
        )
        self.db.add(paiement)
        self.db.commit()
        self.db.refresh(paiement)

        self._ajouter_entree_caisse(paiement.date_paiement, paiement.montant_paye)
        self._audit(
            "finance.webhook.mobile_money",
            "paiements",
            paiement.id,
            details={"reference_externe": data.reference_externe},
        )

        return {
            "status": "created",
            "paiement_id": str(paiement.id),
            "reference": paiement.reference_transaction,
        }

    @staticmethod
    def _verifier_signature_webhook(raw_body: bytes, signature: str | None) -> bool:
        if not signature:
            return False
        expected = hmac.new(
            settings.mobile_money_webhook_secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature.strip())

    # ── Helpers privés ──────────────────────────────────────────────────────

    def _get_or_create_caisse(self, target_date: date) -> CaisseJournaliere:
        caisse = (
            self.db.query(CaisseJournaliere)
            .filter(
                CaisseJournaliere.tenant_id == self.tenant_id,
                CaisseJournaliere.date == target_date,
            )
            .first()
        )
        if caisse is not None:
            return caisse

        veille = (
            self.db.query(CaisseJournaliere)
            .filter(
                CaisseJournaliere.tenant_id == self.tenant_id,
                CaisseJournaliere.date < target_date,
            )
            .order_by(CaisseJournaliere.date.desc())
            .first()
        )
        solde_ouverture = veille.solde_cloture if veille else Decimal("0")

        caisse = CaisseJournaliere(
            tenant_id=self.tenant_id,
            date=target_date,
            solde_ouverture=solde_ouverture,
            total_entrees=Decimal("0"),
            total_sorties=Decimal("0"),
            solde_cloture=solde_ouverture,
        )
        self.db.add(caisse)
        self.db.commit()
        self.db.refresh(caisse)
        return caisse

    def _ajouter_entree_caisse(self, target_date: date, montant: Decimal) -> None:
        caisse = self._get_or_create_caisse(target_date)
        caisse.total_entrees += montant
        caisse.solde_cloture = (
            caisse.solde_ouverture + caisse.total_entrees - caisse.total_sorties
        )
        self.db.commit()

    def _ajouter_sortie_caisse(self, target_date: date, montant: Decimal) -> None:
        caisse = self._get_or_create_caisse(target_date)
        caisse.total_sorties += montant
        caisse.solde_cloture = (
            caisse.solde_ouverture + caisse.total_entrees - caisse.total_sorties
        )
        self.db.commit()

    def _get_niveau_eleve(self, eleve_id: uuid.UUID) -> uuid.UUID:
        inscription = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.eleve_id == eleve_id,
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .first()
        )
        if inscription is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Aucune inscription active pour cet élève",
            )
        classe = self._get_classe(inscription.classe_id)
        return classe.niveau_id

    def _get_eleve(self, eleve_id: uuid.UUID) -> Eleve:
        eleve = (
            self.db.query(Eleve)
            .filter(Eleve.id == eleve_id, Eleve.tenant_id == self.tenant_id)
            .first()
        )
        if eleve is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Élève introuvable",
            )
        return eleve

    def _get_frais(self, frais_id: uuid.UUID) -> FraisScolaire:
        frais = (
            self.db.query(FraisScolaire)
            .filter(FraisScolaire.id == frais_id, FraisScolaire.tenant_id == self.tenant_id)
            .first()
        )
        if frais is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Frais scolaire introuvable",
            )
        return frais

    def _get_paiement(self, paiement_id: uuid.UUID) -> Paiement:
        paiement = (
            self.db.query(Paiement)
            .filter(Paiement.id == paiement_id, Paiement.tenant_id == self.tenant_id)
            .first()
        )
        if paiement is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paiement introuvable",
            )
        return paiement

    def _get_niveau(self, niveau_id: uuid.UUID) -> Niveau:
        niveau = (
            self.db.query(Niveau)
            .filter(Niveau.id == niveau_id, Niveau.tenant_id == self.tenant_id)
            .first()
        )
        if niveau is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Niveau introuvable",
            )
        return niveau

    def _get_annee(self, annee_id: uuid.UUID) -> AnneeScolaire:
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

    def _get_classe(self, classe_id: uuid.UUID) -> Classe:
        classe = (
            self.db.query(Classe)
            .filter(Classe.id == classe_id, Classe.tenant_id == self.tenant_id)
            .first()
        )
        if classe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classe introuvable",
            )
        return classe

    def _get_employe(self, employe_id: uuid.UUID) -> Utilisateur:
        employe = (
            self.db.query(Utilisateur)
            .filter(
                Utilisateur.id == employe_id,
                Utilisateur.tenant_id == self.tenant_id,
            )
            .first()
        )
        if employe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employé introuvable",
            )
        return employe
