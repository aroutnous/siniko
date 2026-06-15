"""Logique métier M4 — Gestion pédagogique."""

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.models.eleve import Eleve, Inscription
from app.models.enums import StatutBulletin, StatutInscription
from app.models.etablissement import (
    Classe,
    Cycle,
    Matiere,
    Periode,
    Salle,
    SequenceEvaluation,
)
from app.models.pedagogie import Bulletin, BulletinLigne, Note
from app.schemas.pedagogie import (
    BulletinGenererRequest,
    BulletinResponse,
    ClassementEleve,
    MoyenneMatiere,
    NoteBatchCreate,
    NoteCreate,
    NoteResponse,
    ResultatsClasseResponse,
)
from app.services.audit_service import log_audit
from app.services.calcul_service import CalculService


_CYCLE_1ER = "1er Cycle"


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
        if not data.notes:
            return []

        cycle = self._get_cycle_for_salle(self._get_salle(data.notes[0].classe_id))
        is_qualitative = cycle.type_evaluation == "qualitative"

        result: list[Note] = []

        for item in data.notes:
            self._get_eleve(item.eleve_id)
            self._get_matiere(item.matiere_id)
            self._get_salle(item.classe_id)
            periode_id, sequence_id = self._resolve_note_links(item, cycle)
            self._validate_note_item(item, is_qualitative, cycle)

            query = self.db.query(Note).filter(
                Note.tenant_id == self.tenant_id,
                Note.eleve_id == item.eleve_id,
                Note.matiere_id == item.matiere_id,
            )
            if sequence_id is not None:
                query = query.filter(Note.sequence_id == sequence_id)
            else:
                query = query.filter(Note.periode_id == periode_id)
            existing = query.first()

            if is_qualitative:
                appreciation = item.appreciation
                valeur = None
                valeur_qualitative = item.valeur_qualitative
            else:
                valeur = item.valeur
                valeur_qualitative = None
                appreciation = item.appreciation
                if appreciation is None and valeur is not None:
                    appreciation = self.calcul.get_mention(
                        float(valeur),
                        float(cycle.note_passage or 10),
                    )

            if existing:
                existing.valeur = valeur
                existing.valeur_qualitative = valeur_qualitative
                existing.classe_id = item.classe_id
                existing.periode_id = periode_id
                existing.sequence_id = sequence_id
                existing.appreciation = appreciation
                existing.saisi_par = saisi_par
                result.append(existing)
            else:
                note = Note(
                    tenant_id=self.tenant_id,
                    eleve_id=item.eleve_id,
                    matiere_id=item.matiere_id,
                    periode_id=periode_id,
                    sequence_id=sequence_id,
                    classe_id=item.classe_id,
                    valeur=valeur,
                    valeur_qualitative=valeur_qualitative,
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
        salle = self._get_salle(data.classe_id)
        cycle = self._get_cycle_for_salle(salle)

        if cycle.type_evaluation == "qualitative":
            return self._generer_bulletins_competences(data, cycle)
        return self._generer_bulletins_chiffres(data, cycle)

    def _generer_bulletins_chiffres(
        self,
        data: BulletinGenererRequest,
        cycle: Cycle,
    ) -> list[BulletinResponse]:
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
                Note.valeur.isnot(None),
            )
            .all()
        )
        notes_par_eleve: dict[uuid.UUID, list[Note]] = {}
        for note in notes:
            notes_par_eleve.setdefault(note.eleve_id, []).append(note)

        coefficients = self._get_coefficients_map()
        matiere_ids = {n.matiere_id for n in notes if n.matiere_id is not None}
        moyennes_classe_matiere: dict[uuid.UUID, float] = {}
        for matiere_id in matiere_ids:
            notes_matiere = [n for n in notes if n.matiere_id == matiere_id]
            moyennes_classe_matiere[matiere_id] = self.calcul.calculer_moyenne_classe(
                notes_matiere
            )

        bulletins_generes: list[Bulletin] = []
        moyennes_eleves: dict[uuid.UUID, float] = {}
        note_passage = float(cycle.note_passage or 10)

        for eleve_id in eleve_ids:
            notes_eleve = notes_par_eleve.get(eleve_id, [])
            lignes_temp = [
                BulletinLigne(
                    bulletin_id=uuid.uuid4(),
                    matiere_id=note.matiere_id,
                    note=note.valeur,
                    coefficient=coefficients.get(note.matiere_id, Decimal("1")),
                )
                for note in notes_eleve
                if note.valeur is not None
            ]
            moyennes_eleves[eleve_id] = self.calcul.calculer_moyenne_generale(lignes_temp)

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
            mention = self.calcul.get_mention(moyenne_generale, note_passage)

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
                existing.type_bulletin = "chiffre"
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
                    type_bulletin="chiffre",
                    statut=StatutBulletin.BROUILLON,
                )
                self.db.add(bulletin)
                self.db.flush()

            notes_eleve = notes_par_eleve.get(eleve_id, [])
            for note in notes_eleve:
                if note.valeur is None:
                    continue
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

    def _generer_bulletins_competences(
        self,
        data: BulletinGenererRequest,
        _cycle: Cycle,
    ) -> list[BulletinResponse]:
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
                Note.valeur_qualitative.isnot(None),
            )
            .all()
        )
        notes_par_eleve: dict[uuid.UUID, list[Note]] = {}
        for note in notes:
            notes_par_eleve.setdefault(note.eleve_id, []).append(note)

        effectif = len(eleve_ids)
        bulletins_generes: list[Bulletin] = []

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

            if existing:
                if existing.statut != StatutBulletin.BROUILLON:
                    existing.statut = StatutBulletin.BROUILLON
                    existing.valide_par = None
                    existing.date_validation = None
                existing.moyenne_generale = None
                existing.rang = None
                existing.effectif_classe = effectif
                existing.mention = None
                existing.appreciation_generale = None
                existing.type_bulletin = "competences"
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
                    moyenne_generale=None,
                    rang=None,
                    effectif_classe=effectif,
                    mention=None,
                    appreciation_generale=None,
                    type_bulletin="competences",
                    statut=StatutBulletin.BROUILLON,
                )
                self.db.add(bulletin)
                self.db.flush()

            for note in notes_par_eleve.get(eleve_id, []):
                ligne = BulletinLigne(
                    bulletin_id=bulletin.id,
                    matiere_id=note.matiere_id,
                    note=None,
                    moyenne_classe=None,
                    coefficient=None,
                    statut_competence=note.valeur_qualitative,
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

    def list_bulletins_eleve(self, eleve_id: uuid.UUID) -> list[BulletinResponse]:
        """Liste les bulletins générés pour un élève."""
        self._get_eleve(eleve_id)
        bulletins = (
            self.db.query(Bulletin)
            .filter(
                Bulletin.tenant_id == self.tenant_id,
                Bulletin.eleve_id == eleve_id,
            )
            .order_by(Bulletin.created_at.desc())
            .all()
        )
        return [self._bulletin_to_response(b) for b in bulletins]

    def get_resultats_classe(
        self,
        classe_id: uuid.UUID,
        periode_id: uuid.UUID,
    ) -> ResultatsClasseResponse:
        """Statistiques agrégées : moyennes par matière, classement, taux de réussite."""
        salle = self._get_salle(classe_id)
        cycle = self._get_cycle_for_salle(salle)
        self._get_periode(periode_id)

        if cycle.type_evaluation == "qualitative":
            return self._get_resultats_competences(classe_id, periode_id, cycle)

        notes = (
            self.db.query(Note)
            .filter(
                Note.tenant_id == self.tenant_id,
                Note.classe_id == classe_id,
                Note.periode_id == periode_id,
                Note.valeur.isnot(None),
            )
            .all()
        )

        matiere_ids = {n.matiere_id for n in notes if n.matiere_id is not None}
        moyennes_par_matiere = [
            MoyenneMatiere(
                matiere_id=mid,
                moyenne=Decimal(
                    str(
                        round(
                            self.calcul.calculer_moyenne_classe(
                                [n for n in notes if n.matiere_id == mid]
                            ),
                            2,
                        )
                    )
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
                Bulletin.type_bulletin == "chiffre",
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
        note_passage = float(cycle.note_passage or 10)
        reussis = sum(
            1
            for b in bulletins
            if b.moyenne_generale is not None
            and float(b.moyenne_generale) >= note_passage
        )
        taux = Decimal("0") if effectif == 0 else Decimal(
            str(round(reussis / effectif * 100, 2))
        )

        return ResultatsClasseResponse(
            classe_id=classe_id,
            periode_id=periode_id,
            effectif=effectif,
            type_evaluation=cycle.type_evaluation,
            moyennes_par_matiere=moyennes_par_matiere,
            classement=classement,
            taux_reussite=taux,
        )

    def _get_resultats_competences(
        self,
        classe_id: uuid.UUID,
        periode_id: uuid.UUID,
        cycle: Cycle,
    ) -> ResultatsClasseResponse:
        bulletins = (
            self.db.query(Bulletin)
            .options(joinedload(Bulletin.lignes))
            .filter(
                Bulletin.tenant_id == self.tenant_id,
                Bulletin.classe_id == classe_id,
                Bulletin.periode_id == periode_id,
                Bulletin.type_bulletin == "competences",
            )
            .all()
        )

        classement = [
            ClassementEleve(
                eleve_id=b.eleve_id,
                moyenne_generale=None,
                rang=None,
                mention=None,
            )
            for b in bulletins
        ]

        effectif = len(bulletins) or len(self._get_eleves_classe(classe_id))
        acquis = 0
        total_lignes = 0
        for bulletin in bulletins:
            for ligne in bulletin.lignes:
                total_lignes += 1
                if ligne.statut_competence == "acquis":
                    acquis += 1

        taux = Decimal("0") if total_lignes == 0 else Decimal(
            str(round(acquis / total_lignes * 100, 2))
        )

        return ResultatsClasseResponse(
            classe_id=classe_id,
            periode_id=periode_id,
            effectif=effectif,
            type_evaluation=cycle.type_evaluation,
            moyennes_par_matiere=[],
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

    @staticmethod
    def _uses_sequence_for_cycle(cycle: Cycle) -> bool:
        return cycle.type_evaluation == "chiffree" and cycle.nom == _CYCLE_1ER

    def _resolve_note_links(
        self,
        item: NoteCreate,
        cycle: Cycle,
    ) -> tuple[uuid.UUID | None, uuid.UUID | None]:
        """Détermine periode_id / sequence_id selon le type d'évaluation du cycle."""
        if self._uses_sequence_for_cycle(cycle):
            if item.sequence_id is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="sequence_id requis pour le 1er Cycle",
                )
            if item.periode_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="periode_id non autorisé pour le 1er Cycle",
                )
            sequence = self._get_sequence(item.sequence_id)
            if sequence.cycle_id != cycle.id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="La séquence ne correspond pas au cycle de la classe",
                )
            return None, sequence.id

        if item.periode_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="periode_id requis pour ce cycle",
            )
        if item.sequence_id is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="sequence_id non autorisé pour ce cycle",
            )
        self._get_periode(item.periode_id)
        return item.periode_id, None

    def _validate_note_item(
        self,
        item: NoteCreate,
        is_qualitative: bool,
        cycle: Cycle,
    ) -> None:
        if is_qualitative:
            if item.valeur_qualitative is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="valeur_qualitative requise pour un cycle qualitatif",
                )
            if item.valeur is not None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Les notes chiffrées ne sont pas autorisées pour ce cycle",
                )
        else:
            if item.valeur is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="valeur requise pour un cycle chiffré",
                )
            if item.valeur_qualitative is not None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Les notes qualitatives ne sont pas autorisées pour ce cycle",
                )
            note_max = float(cycle.note_max or 20)
            if float(item.valeur) > note_max:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"La note ne peut pas dépasser {note_max}",
                )

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

    def _get_cycle_for_salle(self, salle: Salle) -> Cycle:
        classe = (
            self.db.query(Classe)
            .filter(Classe.id == salle.classe_id, Classe.tenant_id == self.tenant_id)
            .first()
        )
        if classe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classe introuvable",
            )
        cycle = (
            self.db.query(Cycle)
            .filter(Cycle.id == classe.cycle_id, Cycle.tenant_id == self.tenant_id)
            .first()
        )
        if cycle is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cycle introuvable",
            )
        return cycle

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

    def _get_sequence(self, sequence_id: uuid.UUID) -> SequenceEvaluation:
        sequence = (
            self.db.query(SequenceEvaluation)
            .filter(
                SequenceEvaluation.id == sequence_id,
                SequenceEvaluation.tenant_id == self.tenant_id,
            )
            .first()
        )
        if sequence is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Séquence d'évaluation introuvable",
            )
        return sequence

    def _get_salle(self, classe_id: uuid.UUID) -> Salle:
        salle = (
            self.db.query(Salle)
            .filter(Salle.id == classe_id, Salle.tenant_id == self.tenant_id)
            .first()
        )
        if salle is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Salle introuvable",
            )
        return salle

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
