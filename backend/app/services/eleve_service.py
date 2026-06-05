"""Logique métier M3 — Gestion des élèves."""

import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.eleve import Absence, Eleve, Inscription
from app.models.enums import StatutEleve, StatutInscription, TypeAbsence
from app.models.etablissement import AnneeScolaire, Classe, Periode
from app.schemas.eleve import (
    AbsenceCreate,
    AbsenceResponse,
    AbsenceStatistiquesResponse,
    ClasseAbsencesResponse,
    DossierEleveResponse,
    EleveInscrireCreate,
    EleveInscrireResponse,
    EleveResponse,
    EleveUpdate,
    InscriptionResponse,
    TransfertRequest,
)
from app.services.audit_service import log_audit


class EleveService:
    """Inscription, transfert, absences et dossier élève."""

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

    def generer_matricule(self) -> str:
        """Format ECO-YYYY-NNNN, unique par tenant."""
        year = datetime.now(UTC).year
        prefix = f"ECO-{year}-"
        existing = (
            self.db.query(Eleve)
            .filter(
                Eleve.tenant_id == self.tenant_id,
                Eleve.matricule.like(f"{prefix}%"),
            )
            .count()
        )
        return f"{prefix}{existing + 1:04d}"

    def inscrire_eleve(self, data: EleveInscrireCreate) -> EleveInscrireResponse:
        """Crée un élève avec matricule auto et son inscription."""
        self._get_classe(data.classe_id)
        self._get_annee(data.annee_scolaire_id)
        self._verifier_capacite_classe(data.classe_id)

        matricule = self.generer_matricule()
        eleve = Eleve(
            tenant_id=self.tenant_id,
            matricule=matricule,
            nom=data.nom,
            prenom=data.prenom,
            date_naissance=data.date_naissance,
            lieu_naissance=data.lieu_naissance,
            sexe=data.sexe,
            photo_url=data.photo_url,
            nom_parent=data.nom_parent,
            telephone_parent=data.telephone_parent,
            adresse=data.adresse,
            statut=StatutEleve.ACTIF,
        )
        self.db.add(eleve)
        self.db.flush()

        inscription = Inscription(
            tenant_id=self.tenant_id,
            eleve_id=eleve.id,
            classe_id=data.classe_id,
            annee_scolaire_id=data.annee_scolaire_id,
            date_inscription=data.date_inscription or date.today(),
            statut=StatutInscription.INSCRIT,
        )
        self.db.add(inscription)
        self.db.commit()
        self.db.refresh(eleve)
        self.db.refresh(inscription)

        self._audit("students.inscrire", "eleves", eleve.id, details={"matricule": matricule})
        return EleveInscrireResponse(
            eleve=EleveResponse.model_validate(eleve),
            inscription=InscriptionResponse.model_validate(inscription),
        )

    def rechercher(
        self,
        query: str | None = None,
        classe_id: uuid.UUID | None = None,
        annee_id: uuid.UUID | None = None,
    ) -> list[EleveResponse]:
        """Recherche élèves par nom, prénom ou matricule."""
        q = self.db.query(Eleve).filter(Eleve.tenant_id == self.tenant_id)

        if query:
            term = f"%{query.strip()}%"
            q = q.filter(
                or_(
                    Eleve.nom.ilike(term),
                    Eleve.prenom.ilike(term),
                    Eleve.matricule.ilike(term),
                )
            )

        if classe_id is not None or annee_id is not None:
            q = q.join(Inscription, Inscription.eleve_id == Eleve.id).filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.statut == StatutInscription.INSCRIT,
            )
            if classe_id is not None:
                self._get_classe(classe_id)
                q = q.filter(Inscription.classe_id == classe_id)
            if annee_id is not None:
                self._get_annee(annee_id)
                q = q.filter(Inscription.annee_scolaire_id == annee_id)

        eleves = q.order_by(Eleve.nom, Eleve.prenom).distinct().all()
        return [EleveResponse.model_validate(e) for e in eleves]

    def get_eleve(self, eleve_id: uuid.UUID) -> EleveResponse:
        return EleveResponse.model_validate(self._get_eleve(eleve_id))

    def update_eleve(self, eleve_id: uuid.UUID, data: EleveUpdate) -> EleveResponse:
        eleve = self._get_eleve(eleve_id)
        ancien_statut = eleve.statut
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(eleve, field, value)
        self.db.commit()
        self.db.refresh(eleve)

        if data.statut == StatutEleve.EXCLU and ancien_statut != StatutEleve.EXCLU:
            self._audit("students.exclusion", "eleves", eleve.id)
        else:
            self._audit("students.update", "eleves", eleve.id)
        return EleveResponse.model_validate(eleve)

    def affecter_classe(
        self,
        eleve_id: uuid.UUID,
        classe_id: uuid.UUID,
        annee_id: uuid.UUID,
    ) -> InscriptionResponse:
        """Affecte un élève à une classe (nouvelle inscription)."""
        eleve = self._get_eleve(eleve_id)
        self._get_classe(classe_id)
        self._get_annee(annee_id)
        self._verifier_capacite_classe(classe_id)

        inscription = Inscription(
            tenant_id=self.tenant_id,
            eleve_id=eleve.id,
            classe_id=classe_id,
            annee_scolaire_id=annee_id,
            date_inscription=date.today(),
            statut=StatutInscription.INSCRIT,
        )
        self.db.add(inscription)
        self.db.commit()
        self.db.refresh(inscription)
        self._audit("students.affecter_classe", "inscriptions", inscription.id)
        return InscriptionResponse.model_validate(inscription)

    def transferer(
        self,
        eleve_id: uuid.UUID,
        data: TransfertRequest,
    ) -> InscriptionResponse:
        """Transfère un élève vers une nouvelle classe (vérifie capacité)."""
        eleve = self._get_eleve(eleve_id)
        nouvelle_classe = self._get_classe(data.classe_id)
        self._verifier_capacite_classe(data.classe_id)

        inscription_active = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.eleve_id == eleve.id,
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .first()
        )
        if inscription_active is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Aucune inscription active pour cet élève",
            )

        annee_id = data.annee_scolaire_id or inscription_active.annee_scolaire_id
        self._get_annee(annee_id)

        inscription_active.statut = StatutInscription.TRANSFERE
        eleve.statut = StatutEleve.TRANSFERE

        nouvelle_inscription = Inscription(
            tenant_id=self.tenant_id,
            eleve_id=eleve.id,
            classe_id=data.classe_id,
            annee_scolaire_id=annee_id,
            date_inscription=date.today(),
            statut=StatutInscription.INSCRIT,
        )
        eleve.statut = StatutEleve.ACTIF
        self.db.add(nouvelle_inscription)
        self.db.commit()
        self.db.refresh(nouvelle_inscription)

        self._audit(
            "students.transferer",
            "inscriptions",
            nouvelle_inscription.id,
            details={
                "ancienne_classe_id": str(inscription_active.classe_id),
                "nouvelle_classe_id": str(nouvelle_classe.id),
            },
        )
        return InscriptionResponse.model_validate(nouvelle_inscription)

    def get_dossier_complet(self, eleve_id: uuid.UUID) -> DossierEleveResponse:
        eleve = self._get_eleve(eleve_id)
        inscriptions = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.eleve_id == eleve.id,
            )
            .order_by(Inscription.date_inscription.desc())
            .all()
        )
        absences = (
            self.db.query(Absence)
            .filter(
                Absence.tenant_id == self.tenant_id,
                Absence.eleve_id == eleve.id,
            )
            .order_by(Absence.date_absence.desc())
            .all()
        )
        return DossierEleveResponse(
            eleve=EleveResponse.model_validate(eleve),
            inscriptions=[InscriptionResponse.model_validate(i) for i in inscriptions],
            absences=[AbsenceResponse.model_validate(a) for a in absences],
        )

    def enregistrer_absence(
        self,
        eleve_id: uuid.UUID,
        data: AbsenceCreate,
        saisi_par: uuid.UUID,
    ) -> AbsenceResponse:
        eleve = self._get_eleve(eleve_id)
        self._get_classe(data.classe_id)

        absence = Absence(
            tenant_id=self.tenant_id,
            eleve_id=eleve.id,
            classe_id=data.classe_id,
            date_absence=data.date_absence,
            type=data.type,
            justifiee=data.justifiee,
            motif=data.motif,
            saisi_par=saisi_par,
        )
        self.db.add(absence)
        self.db.commit()
        self.db.refresh(absence)
        self._audit("students.absence.create", "absences", absence.id)
        return AbsenceResponse.model_validate(absence)

    def justifier_absence(
        self,
        absence_id: uuid.UUID,
        motif: str,
    ) -> AbsenceResponse:
        absence = self._get_absence(absence_id)
        absence.justifiee = True
        absence.motif = motif
        self.db.commit()
        self.db.refresh(absence)
        self._audit("students.absence.justify", "absences", absence.id)
        return AbsenceResponse.model_validate(absence)

    def get_absences_eleve(
        self,
        eleve_id: uuid.UUID,
        periode_id: uuid.UUID | None = None,
    ) -> list[AbsenceResponse]:
        self._get_eleve(eleve_id)
        q = self.db.query(Absence).filter(
            Absence.tenant_id == self.tenant_id,
            Absence.eleve_id == eleve_id,
        )
        q = self._filtrer_par_periode(q, periode_id)
        absences = q.order_by(Absence.date_absence.desc()).all()
        return [AbsenceResponse.model_validate(a) for a in absences]

    def get_absences_classe(
        self,
        classe_id: uuid.UUID,
        periode_id: uuid.UUID | None = None,
    ) -> ClasseAbsencesResponse:
        self._get_classe(classe_id)
        q = self.db.query(Absence).filter(
            Absence.tenant_id == self.tenant_id,
            Absence.classe_id == classe_id,
        )
        q = self._filtrer_par_periode(q, periode_id)
        absences = q.order_by(Absence.date_absence.desc()).all()
        stats = self.get_statistiques_absences(classe_id, periode_id)
        return ClasseAbsencesResponse(
            absences=[AbsenceResponse.model_validate(a) for a in absences],
            statistiques=stats,
        )

    def get_statistiques_absences(
        self,
        classe_id: uuid.UUID,
        periode_id: uuid.UUID | None = None,
    ) -> AbsenceStatistiquesResponse:
        self._get_classe(classe_id)
        q = self.db.query(Absence).filter(
            Absence.tenant_id == self.tenant_id,
            Absence.classe_id == classe_id,
        )
        q = self._filtrer_par_periode(q, periode_id)
        absences = q.all()

        total = len(absences)
        count_absences = sum(1 for a in absences if a.type == TypeAbsence.ABSENCE)
        count_retards = sum(1 for a in absences if a.type == TypeAbsence.RETARD)
        justifiees = sum(1 for a in absences if a.justifiee)
        return AbsenceStatistiquesResponse(
            classe_id=classe_id,
            total=total,
            absences=count_absences,
            retards=count_retards,
            justifiees=justifiees,
            non_justifiees=total - justifiees,
        )

    # ── Helpers privés ──────────────────────────────────────────────────────

    def _filtrer_par_periode(self, query, periode_id: uuid.UUID | None):
        if periode_id is None:
            return query
        periode = self._get_periode(periode_id)
        return query.filter(
            Absence.date_absence >= periode.date_debut,
            Absence.date_absence <= periode.date_fin,
        )

    def _verifier_capacite_classe(self, classe_id: uuid.UUID) -> None:
        classe = self._get_classe(classe_id)
        if classe.capacite_max is None:
            return
        effectif = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.classe_id == classe_id,
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .count()
        )
        if effectif >= classe.capacite_max:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Classe complète",
            )

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

    def _get_absence(self, absence_id: uuid.UUID) -> Absence:
        absence = (
            self.db.query(Absence)
            .filter(Absence.id == absence_id, Absence.tenant_id == self.tenant_id)
            .first()
        )
        if absence is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Absence introuvable",
            )
        return absence
