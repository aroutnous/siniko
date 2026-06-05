"""Génération de documents PDF imprimables en mémoire."""

import uuid
from io import BytesIO

from fastapi import HTTPException, status
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from sqlalchemy.orm import Session, joinedload

from app.models.eleve import Eleve, Inscription
from app.models.enums import StatutInscription, StatutPaiement
from app.models.etablissement import Classe
from app.models.finance import Paiement
from app.models.pedagogie import Bulletin


class ImpressionService:
    """Impressions PDF — BytesIO uniquement."""

    def __init__(self, db: Session, tenant_id: uuid.UUID) -> None:
        self.db = db
        self.tenant_id = tenant_id

    def _build_pdf(self, title: str, lines: list[str]) -> bytes:
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        styles = getSampleStyleSheet()
        elements = [Paragraph(title, styles["Title"]), Spacer(1, 12)]
        for line in lines:
            elements.append(Paragraph(line, styles["Normal"]))
            elements.append(Spacer(1, 6))
        doc.build(elements)
        return buffer.getvalue()

    def imprimer_bulletin(self, bulletin_id: uuid.UUID) -> bytes:
        bulletin = (
            self.db.query(Bulletin)
            .options(joinedload(Bulletin.lignes))
            .filter(Bulletin.id == bulletin_id, Bulletin.tenant_id == self.tenant_id)
            .first()
        )
        if bulletin is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bulletin introuvable",
            )

        lines = [
            f"Élève : {bulletin.eleve_id}",
            f"Moyenne générale : {bulletin.moyenne_generale}",
            f"Rang : {bulletin.rang}/{bulletin.effectif_classe}",
            f"Mention : {bulletin.mention or 'N/A'}",
            f"Statut : {bulletin.statut.value}",
        ]
        for ligne in bulletin.lignes:
            lines.append(
                f"  Matière {ligne.matiere_id} : {ligne.note} (coef {ligne.coefficient})"
            )
        return self._build_pdf("Bulletin scolaire", lines)

    def imprimer_recu(self, paiement_id: uuid.UUID) -> bytes:
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
        if paiement.statut != StatutPaiement.VALIDE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Seuls les paiements validés peuvent être imprimés",
            )

        lines = [
            f"Référence : {paiement.reference_transaction}",
            f"Élève : {paiement.eleve_id}",
            f"Montant : {paiement.montant_paye} FCFA",
            f"Mode : {paiement.mode_paiement.value}",
            f"Date : {paiement.date_paiement}",
        ]
        return self._build_pdf("Reçu de paiement", lines)

    def imprimer_liste_classe(self, classe_id: uuid.UUID) -> bytes:
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

        inscriptions = (
            self.db.query(Inscription)
            .join(Eleve, Eleve.id == Inscription.eleve_id)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.classe_id == classe_id,
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .order_by(Eleve.nom, Eleve.prenom)
            .all()
        )

        lines = [f"Classe : {classe.nom}", f"Effectif : {len(inscriptions)}", ""]
        for i, ins in enumerate(inscriptions, start=1):
            eleve = (
                self.db.query(Eleve)
                .filter(Eleve.id == ins.eleve_id, Eleve.tenant_id == self.tenant_id)
                .first()
            )
            if eleve:
                lines.append(f"{i}. {eleve.nom} {eleve.prenom} — {eleve.matricule}")

        return self._build_pdf("Liste de classe", lines)

    def imprimer_attestation(self, eleve_id: uuid.UUID) -> bytes:
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

        lines = [
            "Je soussigné(e), certifie que l'élève ci-dessous est régulièrement inscrit(e)",
            "dans notre établissement pour l'année scolaire en cours.",
            "",
            f"Nom : {eleve.nom} {eleve.prenom}",
            f"Matricule : {eleve.matricule}",
            f"Date de naissance : {eleve.date_naissance or 'N/A'}",
        ]
        return self._build_pdf("Attestation de scolarité", lines)
