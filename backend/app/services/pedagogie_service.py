"""Logique métier M4 — Gestion pédagogique."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.models.eleve import Eleve, Inscription
from app.models.enums import StatutBulletin, StatutInscription
from app.models.etablissement import Classe, Matiere, Periode
from app.models.pedagogie import Bulletin, BulletinLigne, Note
from app.schemas.pedagogie import (
    BulletinGenererRequest,
    BulletinResponse,
    ClassementEleve,
    MoyenneMatiere,
    NoteBatchCreate,
    NoteResponse,
    ResultatsClasseResponse,
)
from app.services.audit_service import log_audit
from app.services.calcul_service import CalculService


class PedagogieService:
    """Saisie des notes, bulletins et résultats de classe."""

    def __init__(
        self,
        db: Session,
        tenant_id: uuid.UUID,
        utilisateur_id: uuid.UUID,
        ip_address: str | None = None,
    ) -> None:
        self.db = db
        self.tenant_id = tenant_id
        self.utilisateur_id = utilisateur_id
        self.ip_address = ip_address
        self.calcul = CalculService()

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

    def saisir_notes_batch(
        self,
        data: NoteBatchCreate,
        saisi_par: uuid.UUID,
    ) -> list[NoteResponse]:
        """Saisie groupée avec upsert eleve+matiere+periode."""
        result: list[Note] = []

        for item in data.notes:
            self._get_eleve(item.eleve_id)
            self._get_matiere(item.matiere_id)
            self._get_periode(item.periode_id)
            self._get_classe(item.classe_id)

            existing = (
                self.db.query(Note)
                .filter(
                    Note.tenant_id == self.tenant_id,
                    Note.eleve_id == item.eleve_id,
                    Note.matiere_id == item.matiere_id,
                    Note.periode_id == item.periode_id,
                )
                .first()
            )

            appreciation = item.appreciation
            if appreciation is None:
                appreciation = self.calcul.get_mention(float(item.valeur))

            if existing:
                existing.valeur = item.valeur
                existing.classe_id = item.classe_id
                existing.appreciation = appreciation
                existing.saisi_par = saisi_par
                result.append(existing)
            else:
                note = Note(
                    tenant_id=self.tenant_id,
                    eleve_id=item.eleve_id,
                    matiere_id=item.matiere_id,
                    periode_id=item.periode_id,
                    classe_id=item.classe_id,
                    valeur=item.valeur,
                    appreciation=appreciation,
                    saisi_par=saisi_par,
                )
                self.db.add(note)
                result.append(note)

        self.db.commit()
        for note in result:
            self.db.refresh(note)
        return [NoteResponse.model_validate(n) for n in result]

    def generer_bulletins_classe(
        self,
        data: BulletinGenererRequest,
    ) -> list[BulletinResponse]:
        """Génère ou régénère les bulletins d'une classe pour une période."""
        self._get_classe(data.classe_id)
        self._get_periode(data.periode_id)

        eleve_ids = self._get_eleves_classe(data.classe_id)
        if not eleve_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Aucun élève inscrit dans cette classe",
            )

        notes = (
            self.db.query(Note)
            .filter(
                Note.tenant_id == self.tenant_id,
                Note.classe_id == data.classe_id,
                Note.periode_id == data.periode_id,
            )
            .all()
        )
        notes_par_eleve: dict[uuid.UUID, list[Note]] = {}
        for note in notes:
            notes_par_eleve.setdefault(note.eleve_id, []).append(note)

        coefficients = self._get_coefficients_map()
        matiere_ids = {n.matiere_id for n in notes}
        moyennes_classe_matiere: dict[uuid.UUID, float] = {}
        for matiere_id in matiere_ids:
            notes_matiere = [n for n in notes if n.matiere_id == matiere_id]
            moyennes_classe_matiere[matiere_id] = self.calcul.calculer_moyenne_classe(
                notes_matiere
            )

        bulletins_generes: list[Bulletin] = []
        moyennes_eleves: dict[uuid.UUID, float] = {}

        for eleve_id in eleve_ids:
            notes_eleve = notes_par_eleve.get(eleve_id, [])
            lignes_data: list[dict[str, Any]] = []
            for note in notes_eleve:
                coef = coefficients.get(note.matiere_id, Decimal("1"))
                lignes_data.append(
                    {
                        "matiere_id": note.matiere_id,
                        "note": note.valeur,
                        "moyenne_classe": Decimal(
                            str(moyennes_classe_matiere.get(note.matiere_id, 0.0))
                        ),
                        "coefficient": coef,
                        "appreciation": note.appreciation,
                    }
                )

            lignes_temp = [
                BulletinLigne(
                    bulletin_id=uuid.uuid4(),
                    matiere_id=ld["matiere_id"],
                    note=ld["note"],
                    moyenne_classe=ld["moyenne_classe"],
                    coefficient=ld["coefficient"],
                    appreciation=ld["appreciation"],
                )
                for ld in lignes_data
            ]
            moyenne_generale = self.calcul.calculer_moyenne_generale(lignes_temp)
            moyennes_eleves[eleve_id] = moyenne_generale

        effectif = len(eleve_ids)

        for eleve_id in eleve_ids:
            existing = (
                self.db.query(Bulletin)
                .filter(
                    Bulletin.tenant_id == self.tenant_id,
                    Bulletin.eleve_id == eleve_id,
                    Bulletin.classe_id == data.classe_id,
                    Bulletin.periode_id == data.periode_id,
                )
                .first()
            )

            if existing and existing.statut == StatutBulletin.PUBLIE:
                bulletins_generes.append(existing)
                continue

            moyenne_generale = moyennes_eleves[eleve_id]
            rang = self.calcul.calculer_rang(eleve_id, moyennes_eleves)
            mention = self.calcul.get_mention(moyenne_generale)

            if existing:
                if existing.statut != StatutBulletin.BROUILLON:
                    existing.statut = StatutBulletin.BROUILLON
                    existing.valide_par = None
                    existing.date_validation = None
                existing.moyenne_generale = Decimal(str(round(moyenne_generale, 2)))
                existing.rang = rang
                existing.effectif_classe = effectif
                existing.mention = mention
                existing.appreciation_generale = mention
                self.db.query(BulletinLigne).filter(
                    BulletinLigne.bulletin_id == existing.id
                ).delete()
                bulletin = existing
            else:
                bulletin = Bulletin(
                    tenant_id=self.tenant_id,
                    eleve_id=eleve_id,
                    classe_id=data.classe_id,
                    periode_id=data.periode_id,
                    moyenne_generale=Decimal(str(round(moyenne_generale, 2))),
                    rang=rang,
                    effectif_classe=effectif,
                    mention=mention,
                    appreciation_generale=mention,
                    statut=StatutBulletin.BROUILLON,
                )
                self.db.add(bulletin)
                self.db.flush()

            notes_eleve = notes_par_eleve.get(eleve_id, [])
            for note in notes_eleve:
                coef = coefficients.get(note.matiere_id, Decimal("1"))
                ligne = BulletinLigne(
                    bulletin_id=bulletin.id,
                    matiere_id=note.matiere_id,
                    note=note.valeur,
                    moyenne_classe=Decimal(
                        str(moyennes_classe_matiere.get(note.matiere_id, 0.0))
                    ),
                    coefficient=coef,
                    appreciation=note.appreciation,
                )
                self.db.add(ligne)

            bulletins_generes.append(bulletin)

        self.db.commit()
        return [self._bulletin_to_response(b) for b in bulletins_generes]

    def valider_bulletin(
        self,
        bulletin_id: uuid.UUID,
        directeur_id: uuid.UUID,
    ) -> BulletinResponse:
        """Passe un bulletin de BROUILLON à VALIDE."""
        bulletin = self._get_bulletin(bulletin_id)
        if bulletin.statut == StatutBulletin.PUBLIE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Un bulletin publié ne peut plus être modifié",
            )
        if bulletin.statut != StatutBulletin.BROUILLON:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Seuls les bulletins en brouillon peuvent être validés",
            )

        bulletin.statut = StatutBulletin.VALIDE
        bulletin.valide_par = directeur_id
        bulletin.date_validation = date.today()
        self.db.commit()
        self.db.refresh(bulletin)

        self._audit("pedagogy.bulletin.validate", "bulletins", bulletin.id)
        return self._bulletin_to_response(bulletin)

    def publier_bulletin(self, bulletin_id: uuid.UUID) -> BulletinResponse:
        """Passe un bulletin de VALIDE à PUBLIE."""
        bulletin = self._get_bulletin(bulletin_id)
        if bulletin.statut == StatutBulletin.PUBLIE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ce bulletin est déjà publié",
            )
        if bulletin.statut != StatutBulletin.VALIDE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Seuls les bulletins validés peuvent être publiés",
            )

        bulletin.statut = StatutBulletin.PUBLIE
        self.db.commit()
        self.db.refresh(bulletin)

        self._audit("pedagogy.bulletin.publish", "bulletins", bulletin.id)
        return self._bulletin_to_response(bulletin)

    def get_bulletin(self, bulletin_id: uuid.UUID) -> BulletinResponse:
        return self._bulletin_to_response(self._get_bulletin(bulletin_id))

    def get_resultats_classe(
        self,
        classe_id: uuid.UUID,
        periode_id: uuid.UUID,
    ) -> ResultatsClasseResponse:
        """Statistiques agrégées : moyennes par matière, classement, taux de réussite."""
        self._get_classe(classe_id)
        self._get_periode(periode_id)

        notes = (
            self.db.query(Note)
            .filter(
                Note.tenant_id == self.tenant_id,
                Note.classe_id == classe_id,
                Note.periode_id == periode_id,
            )
            .all()
        )

        matiere_ids = {n.matiere_id for n in notes}
        moyennes_par_matiere = [
            MoyenneMatiere(
                matiere_id=mid,
                moyenne=Decimal(
                    str(round(self.calcul.calculer_moyenne_classe(
                        [n for n in notes if n.matiere_id == mid]
                    ), 2))
                ),
            )
            for mid in sorted(matiere_ids, key=str)
        ]

        bulletins = (
            self.db.query(Bulletin)
            .filter(
                Bulletin.tenant_id == self.tenant_id,
                Bulletin.classe_id == classe_id,
                Bulletin.periode_id == periode_id,
            )
            .order_by(Bulletin.rang)
            .all()
        )

        classement = [
            ClassementEleve(
                eleve_id=b.eleve_id,
                moyenne_generale=b.moyenne_generale,
                rang=b.rang,
                mention=b.mention,
            )
            for b in bulletins
        ]

        effectif = len(bulletins) or len(self._get_eleves_classe(classe_id))
        reussis = sum(
            1
            for b in bulletins
            if b.moyenne_generale is not None and float(b.moyenne_generale) >= 10
        )
        taux = Decimal("0") if effectif == 0 else Decimal(
            str(round(reussis / effectif * 100, 2))
        )

        return ResultatsClasseResponse(
            classe_id=classe_id,
            periode_id=periode_id,
            effectif=effectif,
            moyennes_par_matiere=moyennes_par_matiere,
            classement=classement,
            taux_reussite=taux,
        )

    def get_historique_notes(
        self,
        eleve_id: uuid.UUID,
        periode_id: uuid.UUID | None = None,
    ) -> list[NoteResponse]:
        self._get_eleve(eleve_id)
        q = self.db.query(Note).filter(
            Note.tenant_id == self.tenant_id,
            Note.eleve_id == eleve_id,
        )
        if periode_id is not None:
            self._get_periode(periode_id)
            q = q.filter(Note.periode_id == periode_id)
        notes = q.order_by(Note.created_at.desc()).all()
        return [NoteResponse.model_validate(n) for n in notes]

    def get_appreciations(
        self,
        eleve_id: uuid.UUID,
        periode_id: uuid.UUID,
    ) -> list[str]:
        self._get_eleve(eleve_id)
        self._get_periode(periode_id)
        notes = (
            self.db.query(Note)
            .filter(
                Note.tenant_id == self.tenant_id,
                Note.eleve_id == eleve_id,
                Note.periode_id == periode_id,
            )
            .all()
        )
        return [n.appreciation for n in notes if n.appreciation]

    # ── Helpers privés ──────────────────────────────────────────────────────

    def _bulletin_to_response(self, bulletin: Bulletin) -> BulletinResponse:
        bulletin = (
            self.db.query(Bulletin)
            .options(joinedload(Bulletin.lignes))
            .filter(Bulletin.id == bulletin.id, Bulletin.tenant_id == self.tenant_id)
            .first()
        )
        return BulletinResponse.model_validate(bulletin)

    def _get_coefficients_map(self) -> dict[uuid.UUID, Decimal]:
        matieres = (
            self.db.query(Matiere)
            .filter(Matiere.tenant_id == self.tenant_id)
            .all()
        )
        return {m.id: m.coefficient for m in matieres}

    def _get_eleves_classe(self, classe_id: uuid.UUID) -> list[uuid.UUID]:
        inscriptions = (
            self.db.query(Inscription.eleve_id)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.classe_id == classe_id,
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .all()
        )
        return [row[0] for row in inscriptions]

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

    def _get_matiere(self, matiere_id: uuid.UUID) -> Matiere:
        matiere = (
            self.db.query(Matiere)
            .filter(Matiere.id == matiere_id, Matiere.tenant_id == self.tenant_id)
            .first()
        )
        if matiere is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Matière introuvable",
            )
        return matiere

    def _get_periode(self, periode_id: uuid.UUID) -> Periode:
        periode = (
            self.db.query(Periode)
            .filter(Periode.id == periode_id, Periode.tenant_id == self.tenant_id)
            .first()
        )
        if periode is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Période introuvable",
            )
        return periode

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

    def _get_bulletin(self, bulletin_id: uuid.UUID) -> Bulletin:
        bulletin = (
            self.db.query(Bulletin)
            .filter(Bulletin.id == bulletin_id, Bulletin.tenant_id == self.tenant_id)
            .first()
        )
        if bulletin is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bulletin introuvable",
            )
        return bulletin
