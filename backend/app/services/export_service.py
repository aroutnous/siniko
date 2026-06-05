"""Génération d'exports PDF et Excel en mémoire."""

import uuid
from decimal import Decimal
from io import BytesIO
from typing import Any

from fastapi import HTTPException, status
from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from app.models.enums import StatutPaiement, StatutSalaire
from app.models.etablissement import AnneeScolaire
from app.models.finance import Depense, Paiement, Salaire
from app.schemas.reporting import FormatExport
from app.services.pedagogie_service import PedagogieService


class ExportService:
    """Exports PDF/Excel — jamais écrits sur disque."""

    @staticmethod
    def exporter_pdf(data: dict[str, Any], template: str) -> bytes:
        """Génère un PDF depuis un dict de données et un nom de template."""
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        styles = getSampleStyleSheet()
        elements: list[Any] = [
            Paragraph(f"SINIKO — {template}", styles["Title"]),
            Spacer(1, 12),
        ]

        rows = [["Clé", "Valeur"]]
        for key, value in data.items():
            if isinstance(value, (dict, list)):
                continue
            rows.append([str(key), str(value)])

        if len(rows) > 1:
            table = Table(rows, colWidths=[200, 300])
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                    ]
                )
            )
            elements.append(table)

        doc.build(elements)
        return buffer.getvalue()

    @staticmethod
    def exporter_excel(data: list[dict[str, Any]], colonnes: list[str]) -> bytes:
        """Génère un fichier Excel en mémoire."""
        buffer = BytesIO()
        wb = Workbook()
        ws = wb.active
        ws.title = "Export"
        ws.append(colonnes)
        for row in data:
            ws.append([row.get(col, "") for col in colonnes])
        wb.save(buffer)
        return buffer.getvalue()

    def exporter_rapport_financier(
        self,
        db: Session,
        tenant_id: uuid.UUID,
        annee_id: uuid.UUID,
        format: FormatExport,
    ) -> bytes:
        annee = (
            db.query(AnneeScolaire)
            .filter(
                AnneeScolaire.id == annee_id,
                AnneeScolaire.tenant_id == tenant_id,
            )
            .first()
        )
        if annee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Année scolaire introuvable",
            )

        paiements = (
            db.query(Paiement)
            .filter(
                Paiement.tenant_id == tenant_id,
                Paiement.annee_scolaire_id == annee_id,
                Paiement.statut == StatutPaiement.VALIDE,
            )
            .all()
        )
        total_recettes = sum((p.montant_paye for p in paiements), Decimal("0"))

        depenses = (
            db.query(Depense)
            .filter(
                Depense.tenant_id == tenant_id,
                Depense.date_depense >= annee.date_debut,
                Depense.date_depense <= annee.date_fin,
            )
            .all()
        )
        total_depenses = sum((d.montant for d in depenses), Decimal("0"))

        salaires = (
            db.query(Salaire)
            .filter(
                Salaire.tenant_id == tenant_id,
                Salaire.statut == StatutSalaire.PAYE,
                Salaire.mois >= annee.date_debut,
                Salaire.mois <= annee.date_fin,
            )
            .all()
        )
        total_salaires = sum((s.montant_net for s in salaires), Decimal("0"))

        data = {
            "annee_scolaire": annee.libelle,
            "total_recettes": str(total_recettes),
            "total_depenses": str(total_depenses),
            "total_salaires": str(total_salaires),
            "solde": str(total_recettes - total_depenses - total_salaires),
        }

        if format == FormatExport.PDF:
            return self.exporter_pdf(data, "Rapport financier")
        return self.exporter_excel(
            [data],
            ["annee_scolaire", "total_recettes", "total_depenses", "total_salaires", "solde"],
        )

    def exporter_resultats_classe(
        self,
        db: Session,
        tenant_id: uuid.UUID,
        classe_id: uuid.UUID,
        periode_id: uuid.UUID,
        format: FormatExport,
    ) -> bytes:
        service = PedagogieService(db=db, tenant_id=tenant_id, utilisateur_id=tenant_id)
        resultats = service.get_resultats_classe(classe_id, periode_id)

        rows = [
            {
                "eleve_id": str(c.eleve_id),
                "moyenne": str(c.moyenne_generale or ""),
                "rang": c.rang or "",
                "mention": c.mention or "",
            }
            for c in resultats.classement
        ]
        colonnes = ["eleve_id", "moyenne", "rang", "mention"]

        if format == FormatExport.PDF:
            pdf_data = {
                "classe_id": str(classe_id),
                "periode_id": str(periode_id),
                "effectif": resultats.effectif,
                "taux_reussite": str(resultats.taux_reussite),
            }
            return self.exporter_pdf(pdf_data, "Résultats de classe")
        return self.exporter_excel(rows, colonnes)
