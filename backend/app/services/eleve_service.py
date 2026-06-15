"""Logique métier M3 — Gestion des élèves."""

import uuid
from datetime import UTC, date, datetime
from io import BytesIO
from typing import Any

from fastapi import HTTPException, status
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.eleve import Absence, Eleve, Inscription
from app.models.finance import Paiement
from app.models.tenant import Tenant
from app.models.enums import StatutEleve, StatutInscription, TypeAbsence
from app.models.etablissement import AnneeScolaire, Classe, Periode, Salle
from app.schemas.eleve import (
    AbsenceCreate,
    AbsenceResponse,
    AbsenceStatistiquesResponse,
    ClasseAbsencesResponse,
    DossierEleveResponse,
    EleveInscrireCreate,
    EleveInscrireResponse,
    EleveListResponse,
    EleveResponse,
    EleveUpdate,
    InscriptionDossierResponse,
    InscriptionResponse,
    SalleInscriptionBrief,
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
        self._get_salle(data.classe_id)
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
    ) -> list[EleveListResponse]:
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
                self._get_salle(classe_id)
                q = q.filter(Inscription.classe_id == classe_id)
            if annee_id is not None:
                self._get_annee(annee_id)
                q = q.filter(Inscription.annee_scolaire_id == annee_id)

        eleves = q.order_by(Eleve.nom, Eleve.prenom).distinct().all()
        eleve_ids = [e.id for e in eleves]
        salle_noms = self._salle_noms_par_eleve(eleve_ids)
        salle_ids = self._salle_ids_par_eleve(eleve_ids)
        return [
            EleveListResponse(
                **EleveResponse.model_validate(e).model_dump(),
                salle_nom=salle_noms.get(e.id),
                salle_id=salle_ids.get(e.id),
            )
            for e in eleves
        ]

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

    def archiver_eleve(self, eleve_id: uuid.UUID) -> EleveResponse:
        """Archive un élève (statut exclu, inscription active abandonnée)."""
        eleve = self._get_eleve(eleve_id)
        inscriptions_actives = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.eleve_id == eleve.id,
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .all()
        )
        for inscription in inscriptions_actives:
            inscription.statut = StatutInscription.ABANDONNE
        eleve.statut = StatutEleve.EXCLU
        self.db.commit()
        self.db.refresh(eleve)
        self._audit("students.archive", "eleves", eleve.id)
        return EleveResponse.model_validate(eleve)

    def supprimer_eleve(self, eleve_id: uuid.UUID) -> None:
        """Supprime définitivement un élève sans paiement associé."""
        eleve = self._get_eleve(eleve_id)
        paiements = (
            self.db.query(Paiement)
            .filter(
                Paiement.tenant_id == self.tenant_id,
                Paiement.eleve_id == eleve.id,
            )
            .count()
        )
        if paiements > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer : paiements associés à cet élève",
            )
        self.db.delete(eleve)
        self.db.commit()
        self._audit("students.delete", "eleves", eleve_id)

    def affecter_classe(
        self,
        eleve_id: uuid.UUID,
        classe_id: uuid.UUID,
        annee_id: uuid.UUID,
    ) -> InscriptionResponse:
        """Affecte un élève à une classe (nouvelle inscription)."""
        eleve = self._get_eleve(eleve_id)
        self._get_salle(classe_id)
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
        nouvelle_classe = self._get_salle(data.classe_id)
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
        salle_ids = {i.classe_id for i in inscriptions}
        salles = (
            self.db.query(Salle)
            .filter(Salle.tenant_id == self.tenant_id, Salle.id.in_(salle_ids))
            .all()
            if salle_ids
            else []
        )
        salles_by_id = {s.id: s for s in salles}
        niveau_map = self._niveaux_par_salle(salles)

        inscriptions_enrichies: list[InscriptionDossierResponse] = []
        salle_active_nom: str | None = None
        for inscription in inscriptions:
            salle = salles_by_id.get(inscription.classe_id)
            salle_nom = (
                self._format_salle_nom(salle, niveau_map) if salle is not None else None
            )
            if (
                inscription.statut == StatutInscription.INSCRIT
                and salle_active_nom is None
                and salle_nom
            ):
                salle_active_nom = salle_nom
            salle_brief: SalleInscriptionBrief | None = None
            if salle is not None:
                salle_brief = SalleInscriptionBrief(
                    id=salle.id,
                    nom=salle.nom,
                    nom_salle=salle.nom_salle,
                    niveau_nom=niveau_map.get(salle.classe_id),
                )
            inscriptions_enrichies.append(
                InscriptionDossierResponse(
                    **InscriptionResponse.model_validate(inscription).model_dump(),
                    salle_nom=salle_nom,
                    salle=salle_brief,
                )
            )

        return DossierEleveResponse(
            eleve=EleveResponse.model_validate(eleve),
            inscriptions=inscriptions_enrichies,
            absences=[AbsenceResponse.model_validate(a) for a in absences],
            salle_active_nom=salle_active_nom,
        )

    def enregistrer_absence(
        self,
        eleve_id: uuid.UUID,
        data: AbsenceCreate,
        saisi_par: uuid.UUID,
    ) -> AbsenceResponse:
        eleve = self._get_eleve(eleve_id)
        self._get_salle(data.classe_id)

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
        self._get_salle(classe_id)
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
        self._get_salle(classe_id)
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

    def generer_carte_scolaire(self, eleve_id: uuid.UUID) -> bytes:
        """Carte scolaire PDF en mémoire (BytesIO)."""
        ctx = self._get_contexte_document(eleve_id)
        lines = [
            f"Établissement : {ctx['etablissement']}",
            f"Année scolaire : {ctx['annee_libelle']}",
            "",
            f"Nom : {ctx['eleve'].nom} {ctx['eleve'].prenom}",
            f"Matricule : {ctx['eleve'].matricule}",
            f"Classe : {ctx['classe_nom']}",
            f"Photo : {ctx['eleve'].photo_url or 'Non renseignée'}",
            f"Logo : {ctx['logo_url'] or 'Non renseigné'}",
        ]
        return self._build_pdf("Carte scolaire", lines)

    def generer_attestation(self, eleve_id: uuid.UUID) -> bytes:
        """Attestation de scolarité officielle."""
        ctx = self._get_contexte_document(eleve_id)
        lines = [
            f"L'établissement {ctx['etablissement']} certifie que :",
            "",
            f"M./Mme {ctx['eleve'].nom} {ctx['eleve'].prenom}",
            f"Matricule : {ctx['eleve'].matricule}",
            f"Classe : {ctx['classe_nom']}",
            "",
            f"est régulièrement inscrit(e) pour l'année scolaire {ctx['annee_libelle']}.",
            "",
            "La présente attestation est délivrée pour servir et valoir ce que de droit.",
        ]
        return self._build_pdf("Attestation de scolarité", lines)

    def generer_certificat(self, eleve_id: uuid.UUID) -> bytes:
        """Certificat de fin d'année / de scolarité."""
        ctx = self._get_contexte_document(eleve_id)
        lines = [
            f"L'établissement {ctx['etablissement']} certifie que :",
            "",
            f"M./Mme {ctx['eleve'].nom} {ctx['eleve'].prenom}",
            f"Matricule : {ctx['eleve'].matricule}",
            f"Classe : {ctx['classe_nom']}",
            "",
            (
                f"a suivi les cours de l'année scolaire {ctx['annee_libelle']} "
                "et satisfait aux conditions de scolarité de l'établissement."
            ),
            "",
            "Certificat de scolarité délivré à la demande de l'intéressé(e).",
        ]
        return self._build_pdf("Certificat de scolarité", lines)

    # ── Helpers privés ──────────────────────────────────────────────────────

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

    def _get_contexte_document(self, eleve_id: uuid.UUID) -> dict[str, Any]:
        eleve = self._get_eleve(eleve_id)
        inscription = self._get_inscription_active(eleve.id)
        salle = self._get_salle(inscription.classe_id)
        annee = self._get_annee(inscription.annee_scolaire_id)
        tenant = (
            self.db.query(Tenant).filter(Tenant.id == self.tenant_id).first()
        )
        return {
            "eleve": eleve,
            "classe_nom": self._format_salle_nom(salle),
            "annee_libelle": annee.libelle,
            "etablissement": tenant.nom if tenant else "Établissement",
            "logo_url": tenant.logo_url if tenant else None,
        }

    def _get_inscription_active(self, eleve_id: uuid.UUID) -> Inscription:
        inscription = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.eleve_id == eleve_id,
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .order_by(Inscription.date_inscription.desc())
            .first()
        )
        if inscription is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Aucune inscription active pour cet élève",
            )
        return inscription

    def _filtrer_par_periode(self, query, periode_id: uuid.UUID | None):
        if periode_id is None:
            return query
        periode = self._get_periode(periode_id)
        return query.filter(
            Absence.date_absence >= periode.date_debut,
            Absence.date_absence <= periode.date_fin,
        )

    def _verifier_capacite_classe(self, classe_id: uuid.UUID) -> None:
        salle = self._get_salle(classe_id)
        if salle.capacite is None:
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
        if effectif >= salle.capacite:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Salle complète",
            )

    def _niveaux_par_salle(
        self,
        salles: list[Salle],
    ) -> dict[uuid.UUID, str]:
        niveau_ids = {s.classe_id for s in salles}
        if not niveau_ids:
            return {}
        niveaux = (
            self.db.query(Classe)
            .filter(
                Classe.tenant_id == self.tenant_id,
                Classe.id.in_(niveau_ids),
            )
            .all()
        )
        return {n.id: n.nom for n in niveaux}

    def _format_salle_nom(
        self,
        salle: Salle,
        niveaux: dict[uuid.UUID, str] | None = None,
    ) -> str:
        if salle.nom_salle and salle.nom_salle.strip():
            return salle.nom_salle.strip()
        niveau_nom = (niveaux or {}).get(salle.classe_id)
        if niveau_nom is None:
            niveau = (
                self.db.query(Classe)
                .filter(
                    Classe.tenant_id == self.tenant_id,
                    Classe.id == salle.classe_id,
                )
                .first()
            )
            niveau_nom = niveau.nom if niveau else None
        nom = salle.nom.strip()
        if niveau_nom:
            if nom == niveau_nom or nom.startswith(f"{niveau_nom} "):
                return nom
            return f"{niveau_nom} {nom}".strip()
        return nom

    def _salle_noms_par_eleve(
        self,
        eleve_ids: list[uuid.UUID],
    ) -> dict[uuid.UUID, str]:
        if not eleve_ids:
            return {}
        inscriptions = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.eleve_id.in_(eleve_ids),
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .all()
        )
        salle_ids = {i.classe_id for i in inscriptions}
        salles = (
            self.db.query(Salle)
            .filter(Salle.tenant_id == self.tenant_id, Salle.id.in_(salle_ids))
            .all()
            if salle_ids
            else []
        )
        niveau_map = self._niveaux_par_salle(salles)
        salle_map = {
            s.id: self._format_salle_nom(s, niveau_map) for s in salles
        }
        result: dict[uuid.UUID, str] = {}
        for inscription in inscriptions:
            nom = salle_map.get(inscription.classe_id)
            if nom:
                result[inscription.eleve_id] = nom
        return result

    def _salle_ids_par_eleve(
        self,
        eleve_ids: list[uuid.UUID],
    ) -> dict[uuid.UUID, uuid.UUID]:
        if not eleve_ids:
            return {}
        inscriptions = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.eleve_id.in_(eleve_ids),
                Inscription.statut == StatutInscription.INSCRIT,
            )
            .all()
        )
        return {i.eleve_id: i.classe_id for i in inscriptions}

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
