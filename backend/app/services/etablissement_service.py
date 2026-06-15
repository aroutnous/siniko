"""Logique métier M2 — Gestion établissement scolaire."""

import re
import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.models.eleve import Inscription
from app.models.enseignant import Enseignant
from app.models.finance import FraisScolaire
from app.models.etablissement import (
    AnneeScolaire,
    Classe,
    Cycle,
    Matiere,
    Periode,
    Salle,
    SequenceEvaluation,
)
from app.models.valeur_systeme import ValeurSysteme
from app.models.pedagogie import Note
from app.schemas.etablissement import (
    AnneeScolaireCreate,
    AnneeScolaireResponse,
    AnneeScolaireUpdate,
    ClasseCreate,
    ClasseEffectifResponse,
    ClasseResponse,
    ClasseStructureResponse,
    ClasseUpdate,
    CycleCreate,
    CycleResponse,
    CycleStructureResponse,
    CycleUpdate,
    DupliquerStructureResponse,
    EtablissementStructure,
    MatiereCreate,
    MatiereResponse,
    MatiereUpdate,
    NiveauCreate,
    NiveauResponse,
    NiveauUpdate,
    PeriodeCreate,
    PeriodeResponse,
    PeriodeUpdate,
    SequenceEvaluationCreate,
    SequenceEvaluationResponse,
    SequenceEvaluationUpdate,
    SalleCreate,
    SalleEffectifResponse,
    SalleResponse,
    SalleUpdate,
    WizardEtablissementData,
    WizardEtablissementResponse,
)
from app.services.audit_service import log_audit

DEFAULT_NOTE_MAX = Decimal("20.00")
DEFAULT_NOTE_PASSAGE = Decimal("10.00")
DEFAULT_ARRONDI = 2


class EtablissementService:
    """CRUD et opérations métier sur la structure de l'établissement."""

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

    # ── Cycles ──────────────────────────────────────────────────────────────

    def create_cycle(self, data: CycleCreate) -> CycleResponse:
        payload = data.model_dump()
        cycle = Cycle(tenant_id=self.tenant_id, **payload)
        if not payload.get("valeur_systeme_ref"):
            self._apply_notation_from_valeurs_systeme(cycle)
        self.db.add(cycle)
        self.db.commit()
        self.db.refresh(cycle)
        self._audit("establishment.cycle.create", "cycles", cycle.id)
        return CycleResponse.model_validate(cycle)

    def list_cycles(self) -> list[CycleResponse]:
        cycles = (
            self.db.query(Cycle)
            .filter(Cycle.tenant_id == self.tenant_id)
            .order_by(Cycle.ordre, Cycle.nom)
            .all()
        )
        return [CycleResponse.model_validate(cycle) for cycle in cycles]

    def get_cycle(self, cycle_id: uuid.UUID) -> CycleResponse:
        return CycleResponse.model_validate(self._get_cycle(cycle_id))

    def update_cycle(self, cycle_id: uuid.UUID, data: CycleUpdate) -> CycleResponse:
        cycle = self._get_cycle(cycle_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(cycle, field, value)
        if cycle.type_evaluation == "qualitative":
            cycle.note_max = None
            cycle.note_passage = None
            cycle.arrondi = None
        elif (
            cycle.note_passage is not None
            and cycle.note_max is not None
            and cycle.note_passage > cycle.note_max
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="note_passage ne peut pas dépasser note_max",
            )
        self.db.commit()
        self.db.refresh(cycle)
        self._audit("establishment.cycle.update", "cycles", cycle.id)
        return CycleResponse.model_validate(cycle)

    def delete_cycle(self, cycle_id: uuid.UUID) -> None:
        cycle = self._get_cycle(cycle_id)
        has_classes = (
            self.db.query(Classe)
            .filter(Classe.tenant_id == self.tenant_id, Classe.cycle_id == cycle_id)
            .count()
            > 0
        )
        if has_classes:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer un cycle contenant des classes",
            )
        self.db.delete(cycle)
        self.db.commit()
        self._audit("establishment.cycle.delete", "cycles", cycle_id)

    # ── Classes (niveaux pédagogiques) ─────────────────────────────────────

    def create_classe(self, data: ClasseCreate) -> ClasseResponse:
        self._get_cycle(data.cycle_id)
        classe = Classe(tenant_id=self.tenant_id, **data.model_dump())
        self.db.add(classe)
        self.db.commit()
        self.db.refresh(classe)
        self._audit("establishment.classe.create", "classes", classe.id)
        return ClasseResponse.model_validate(classe)

    def list_classes(self, cycle_id: uuid.UUID | None = None) -> list[ClasseResponse]:
        query = self.db.query(Classe).filter(Classe.tenant_id == self.tenant_id)
        if cycle_id is not None:
            self._get_cycle(cycle_id)
            query = query.filter(Classe.cycle_id == cycle_id)
        classes = query.order_by(Classe.ordre, Classe.nom).all()
        return [ClasseResponse.model_validate(classe) for classe in classes]

    def get_classe(self, classe_id: uuid.UUID) -> ClasseResponse:
        return ClasseResponse.model_validate(self._get_classe(classe_id))

    def update_classe(self, classe_id: uuid.UUID, data: ClasseUpdate) -> ClasseResponse:
        classe = self._get_classe(classe_id)
        payload = data.model_dump(exclude_unset=True)
        for field, value in payload.items():
            setattr(classe, field, value)
        self.db.commit()
        self.db.refresh(classe)
        self._audit("establishment.classe.update", "classes", classe.id)
        return ClasseResponse.model_validate(classe)

    def delete_classe(self, classe_id: uuid.UUID) -> None:
        classe = self._get_classe(classe_id)
        has_salles = (
            self.db.query(Salle)
            .filter(Salle.tenant_id == self.tenant_id, Salle.classe_id == classe_id)
            .count()
            > 0
        )
        if has_salles:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer une classe contenant des salles",
            )
        has_matieres = (
            self.db.query(Matiere)
            .filter(Matiere.tenant_id == self.tenant_id, Matiere.classe_id == classe_id)
            .count()
            > 0
        )
        if has_matieres:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer une classe contenant des matières",
            )
        self.db.delete(classe)
        self.db.commit()
        self._audit("establishment.classe.delete", "classes", classe_id)

    # ── Alias niveaux (rétrocompatibilité API) ─────────────────────────────

    def create_niveau(self, data: NiveauCreate) -> NiveauResponse:
        return NiveauResponse.model_validate(self.create_classe(data))

    def list_niveaux(self, cycle_id: uuid.UUID | None = None) -> list[NiveauResponse]:
        return [
            NiveauResponse.model_validate(classe)
            for classe in self.list_classes(cycle_id=cycle_id)
        ]

    def get_niveau(self, niveau_id: uuid.UUID) -> NiveauResponse:
        return NiveauResponse.model_validate(self.get_classe(niveau_id))

    def update_niveau(self, niveau_id: uuid.UUID, data: NiveauUpdate) -> NiveauResponse:
        return NiveauResponse.model_validate(self.update_classe(niveau_id, data))

    def delete_niveau(self, niveau_id: uuid.UUID) -> None:
        self.delete_classe(niveau_id)

    # ── Salles (divisions physiques) ───────────────────────────────────────

    def create_salle(self, data: SalleCreate) -> SalleResponse:
        self._get_classe(data.classe_id)
        self._get_annee(data.annee_scolaire_id)
        nom = data.nom
        nom_salle = data.nom_salle
        if not nom and nom_salle:
            nom = nom_salle
        if not nom_salle and nom:
            nom_salle = nom
        salle = Salle(
            tenant_id=self.tenant_id,
            classe_id=data.classe_id,
            annee_scolaire_id=data.annee_scolaire_id,
            nom=nom,
            nom_salle=nom_salle,
            capacite=data.capacite,
        )
        self.db.add(salle)
        self.db.commit()
        self.db.refresh(salle)
        self._audit("establishment.salle.create", "salles", salle.id)
        return SalleResponse.model_validate(salle)

    def list_salles(
        self,
        classe_id: uuid.UUID | None = None,
        annee_scolaire_id: uuid.UUID | None = None,
    ) -> list[SalleResponse]:
        query = self.db.query(Salle).filter(Salle.tenant_id == self.tenant_id)
        if classe_id is not None:
            self._get_classe(classe_id)
            query = query.filter(Salle.classe_id == classe_id)
        if annee_scolaire_id is not None:
            self._get_annee(annee_scolaire_id)
            query = query.filter(Salle.annee_scolaire_id == annee_scolaire_id)
        salles = query.order_by(Salle.nom).all()
        return [SalleResponse.model_validate(salle) for salle in salles]

    def get_salle(self, salle_id: uuid.UUID) -> SalleResponse:
        return SalleResponse.model_validate(self._get_salle(salle_id))

    def update_salle(self, salle_id: uuid.UUID, data: SalleUpdate) -> SalleResponse:
        salle = self._get_salle(salle_id)
        payload = data.model_dump(exclude_unset=True)
        if "nom_salle" in payload and "nom" not in payload:
            payload["nom"] = payload["nom_salle"]
        for field, value in payload.items():
            setattr(salle, field, value)
        self.db.commit()
        self.db.refresh(salle)
        self._audit("establishment.salle.update", "salles", salle.id)
        return SalleResponse.model_validate(salle)

    def delete_salle(self, salle_id: uuid.UUID) -> None:
        salle = self._get_salle(salle_id)
        has_inscriptions = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.classe_id == salle_id,
            )
            .count()
            > 0
        )
        if has_inscriptions:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer une salle avec des inscriptions",
            )
        self.db.delete(salle)
        self.db.commit()
        self._audit("establishment.salle.delete", "salles", salle_id)

    def get_salle_effectif(self, salle_id: uuid.UUID) -> SalleEffectifResponse:
        salle = self._get_salle(salle_id)
        effectif = (
            self.db.query(Inscription)
            .filter(
                Inscription.tenant_id == self.tenant_id,
                Inscription.classe_id == salle_id,
            )
            .count()
        )
        est_complete = salle.capacite is not None and effectif >= salle.capacite
        return SalleEffectifResponse(
            salle_id=salle.id,
            effectif=effectif,
            capacite=salle.capacite,
            est_complete=est_complete,
        )

    def get_classe_effectif(self, classe_id: uuid.UUID) -> ClasseEffectifResponse:
        return ClasseEffectifResponse.model_validate(self.get_salle_effectif(classe_id))

    # ── Années scolaires ────────────────────────────────────────────────────

    def create_annee_scolaire(self, data: AnneeScolaireCreate) -> AnneeScolaireResponse:
        if data.date_fin < data.date_debut:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_fin doit être postérieure à date_debut",
            )
        if data.est_active:
            self._deactivate_all_annees()
        annee = AnneeScolaire(tenant_id=self.tenant_id, **data.model_dump())
        self.db.add(annee)
        self.db.commit()
        self.db.refresh(annee)
        self._audit("establishment.annee.create", "annees_scolaires", annee.id)
        return AnneeScolaireResponse.model_validate(annee)

    def list_annees_scolaires(self) -> list[AnneeScolaireResponse]:
        annees = (
            self.db.query(AnneeScolaire)
            .filter(AnneeScolaire.tenant_id == self.tenant_id)
            .order_by(AnneeScolaire.date_debut.desc())
            .all()
        )
        return [AnneeScolaireResponse.model_validate(annee) for annee in annees]

    def get_annee_scolaire(self, annee_id: uuid.UUID) -> AnneeScolaireResponse:
        return AnneeScolaireResponse.model_validate(self._get_annee(annee_id))

    def get_annee_active(self) -> AnneeScolaireResponse | None:
        annee = (
            self.db.query(AnneeScolaire)
            .filter(
                AnneeScolaire.tenant_id == self.tenant_id,
                AnneeScolaire.est_active.is_(True),
            )
            .first()
        )
        if annee is None:
            return None
        return AnneeScolaireResponse.model_validate(annee)

    def update_annee_scolaire(
        self,
        annee_id: uuid.UUID,
        data: AnneeScolaireUpdate,
    ) -> AnneeScolaireResponse:
        annee = self._get_annee(annee_id)
        payload = data.model_dump(exclude_unset=True)
        if payload.get("est_active"):
            self._deactivate_all_annees()
        date_debut = payload.get("date_debut", annee.date_debut)
        date_fin = payload.get("date_fin", annee.date_fin)
        if date_fin < date_debut:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_fin doit être postérieure à date_debut",
            )
        for field, value in payload.items():
            setattr(annee, field, value)
        self.db.commit()
        self.db.refresh(annee)
        self._audit("establishment.annee.update", "annees_scolaires", annee.id)
        return AnneeScolaireResponse.model_validate(annee)

    def activer_annee_scolaire(self, annee_id: uuid.UUID) -> AnneeScolaireResponse:
        annee = self._get_annee(annee_id)
        self._deactivate_all_annees()
        annee.est_active = True
        self.db.commit()
        self.db.refresh(annee)
        self._audit("establishment.annee.activate", "annees_scolaires", annee.id)
        return AnneeScolaireResponse.model_validate(annee)

    def delete_annee_scolaire(self, annee_id: uuid.UUID) -> None:
        annee = self._get_annee(annee_id)
        if annee.est_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer l'année scolaire active",
            )
        linked_checks: list[tuple[type, str]] = [
            (Periode, "périodes"),
            (Salle, "salles"),
            (Inscription, "inscriptions"),
            (FraisScolaire, "frais scolaires"),
        ]
        for model, label in linked_checks:
            count = (
                self.db.query(model)
                .filter(
                    model.tenant_id == self.tenant_id,
                    model.annee_scolaire_id == annee_id,
                )
                .count()
            )
            if count > 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Impossible de supprimer une année avec des {label}",
                )
        self.db.delete(annee)
        self.db.commit()
        self._audit("establishment.annee.delete", "annees_scolaires", annee_id)

    # ── Périodes ────────────────────────────────────────────────────────────

    def create_periode(self, data: PeriodeCreate) -> PeriodeResponse:
        self._get_annee(data.annee_scolaire_id)
        if data.date_fin < data.date_debut:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_fin doit être postérieure à date_debut",
            )
        periode = Periode(tenant_id=self.tenant_id, **data.model_dump())
        self.db.add(periode)
        self.db.commit()
        self.db.refresh(periode)
        self._audit("establishment.periode.create", "periodes", periode.id)
        return PeriodeResponse.model_validate(periode)

    def list_periodes(
        self,
        annee_scolaire_id: uuid.UUID | None = None,
    ) -> list[PeriodeResponse]:
        query = self.db.query(Periode).filter(Periode.tenant_id == self.tenant_id)
        if annee_scolaire_id is not None:
            self._get_annee(annee_scolaire_id)
            query = query.filter(Periode.annee_scolaire_id == annee_scolaire_id)
        periodes = query.order_by(Periode.ordre, Periode.nom).all()
        return [PeriodeResponse.model_validate(periode) for periode in periodes]

    def get_periode(self, periode_id: uuid.UUID) -> PeriodeResponse:
        return PeriodeResponse.model_validate(self._get_periode(periode_id))

    def update_periode(self, periode_id: uuid.UUID, data: PeriodeUpdate) -> PeriodeResponse:
        periode = self._get_periode(periode_id)
        payload = data.model_dump(exclude_unset=True)
        date_debut = payload.get("date_debut", periode.date_debut)
        date_fin = payload.get("date_fin", periode.date_fin)
        if date_fin < date_debut:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_fin doit être postérieure à date_debut",
            )
        for field, value in payload.items():
            setattr(periode, field, value)
        self.db.commit()
        self.db.refresh(periode)
        self._audit("establishment.periode.update", "periodes", periode.id)
        return PeriodeResponse.model_validate(periode)

    def delete_periode(self, periode_id: uuid.UUID) -> None:
        periode = self._get_periode(periode_id)
        has_notes = (
            self.db.query(Note)
            .filter(
                Note.tenant_id == self.tenant_id,
                Note.periode_id == periode_id,
            )
            .count()
            > 0
        )
        if has_notes:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer une période avec des notes",
            )
        self.db.delete(periode)
        self.db.commit()
        self._audit("establishment.periode.delete", "periodes", periode_id)

    # ── Séquences d'évaluation ──────────────────────────────────────────────

    def creer_sequence(self, data: SequenceEvaluationCreate) -> SequenceEvaluationResponse:
        self._get_cycle(data.cycle_id)
        self._get_periode(data.periode_id)
        if (
            data.date_debut is not None
            and data.date_fin is not None
            and data.date_fin < data.date_debut
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_fin doit être postérieure à date_debut",
            )
        sequence = SequenceEvaluation(tenant_id=self.tenant_id, **data.model_dump())
        self.db.add(sequence)
        self.db.commit()
        self.db.refresh(sequence)
        self._audit("establishment.sequence.create", "sequences_evaluation", sequence.id)
        return SequenceEvaluationResponse.model_validate(sequence)

    def lister_sequences(
        self,
        cycle_id: uuid.UUID | None = None,
        periode_id: uuid.UUID | None = None,
    ) -> list[SequenceEvaluationResponse]:
        query = self.db.query(SequenceEvaluation).filter(
            SequenceEvaluation.tenant_id == self.tenant_id,
        )
        if cycle_id is not None:
            self._get_cycle(cycle_id)
            query = query.filter(SequenceEvaluation.cycle_id == cycle_id)
        if periode_id is not None:
            self._get_periode(periode_id)
            query = query.filter(SequenceEvaluation.periode_id == periode_id)
        sequences = query.order_by(
            SequenceEvaluation.ordre,
            SequenceEvaluation.nom,
        ).all()
        return [
            SequenceEvaluationResponse.model_validate(sequence) for sequence in sequences
        ]

    def modifier_sequence(
        self,
        sequence_id: uuid.UUID,
        data: SequenceEvaluationUpdate,
    ) -> SequenceEvaluationResponse:
        sequence = self._get_sequence(sequence_id)
        payload = data.model_dump(exclude_unset=True)
        if "cycle_id" in payload and payload["cycle_id"] is not None:
            self._get_cycle(payload["cycle_id"])
        if "periode_id" in payload and payload["periode_id"] is not None:
            self._get_periode(payload["periode_id"])
        date_debut = payload.get("date_debut", sequence.date_debut)
        date_fin = payload.get("date_fin", sequence.date_fin)
        if date_debut is not None and date_fin is not None and date_fin < date_debut:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_fin doit être postérieure à date_debut",
            )
        for field, value in payload.items():
            setattr(sequence, field, value)
        self.db.commit()
        self.db.refresh(sequence)
        self._audit("establishment.sequence.update", "sequences_evaluation", sequence.id)
        return SequenceEvaluationResponse.model_validate(sequence)

    def supprimer_sequence(self, sequence_id: uuid.UUID) -> None:
        sequence = self._get_sequence(sequence_id)
        has_notes = (
            self.db.query(Note)
            .filter(
                Note.tenant_id == self.tenant_id,
                Note.sequence_id == sequence_id,
            )
            .count()
            > 0
        )
        if has_notes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Impossible de supprimer une séquence liée à des notes",
            )
        self.db.delete(sequence)
        self.db.commit()
        self._audit("establishment.sequence.delete", "sequences_evaluation", sequence_id)

    # ── Matières ────────────────────────────────────────────────────────────

    def create_matiere(self, data: MatiereCreate) -> MatiereResponse:
        self._get_classe(data.classe_id)
        self._validate_matiere_enseignants(
            data.enseignant_principal_id,
            data.enseignant_assistant_id,
        )
        matiere = Matiere(
            tenant_id=self.tenant_id,
            **data.model_dump(exclude={"niveau_id"}),
        )
        self.db.add(matiere)
        self.db.commit()
        self._audit("establishment.matiere.create", "matieres", matiere.id)
        return self._matiere_to_response(self._get_matiere_with_relations(matiere.id))

    def list_matieres(self, classe_id: uuid.UUID | None = None) -> list[MatiereResponse]:
        query = (
            self.db.query(Matiere)
            .options(
                joinedload(Matiere.classe).joinedload(Classe.cycle),
                joinedload(Matiere.enseignant_principal),
                joinedload(Matiere.enseignant_assistant),
            )
            .join(Classe, Matiere.classe_id == Classe.id)
            .join(Cycle, Classe.cycle_id == Cycle.id)
            .filter(Matiere.tenant_id == self.tenant_id)
        )
        if classe_id is not None:
            self._get_classe(classe_id)
            query = query.filter(Matiere.classe_id == classe_id)
        matieres = query.order_by(
            Cycle.ordre,
            Classe.ordre,
            Matiere.ordre,
            Matiere.nom,
        ).all()
        return [self._matiere_to_response(matiere) for matiere in matieres]

    def get_matiere(self, matiere_id: uuid.UUID) -> MatiereResponse:
        return self._matiere_to_response(self._get_matiere_with_relations(matiere_id))

    def update_matiere(self, matiere_id: uuid.UUID, data: MatiereUpdate) -> MatiereResponse:
        matiere = self._get_matiere(matiere_id)
        updates = data.model_dump(exclude_unset=True)
        if "classe_id" in updates and updates["classe_id"] is not None:
            self._get_classe(updates["classe_id"])
        principal_id = updates.get("enseignant_principal_id", matiere.enseignant_principal_id)
        assistant_id = updates.get("enseignant_assistant_id", matiere.enseignant_assistant_id)
        if "enseignant_principal_id" in updates or "enseignant_assistant_id" in updates:
            self._validate_matiere_enseignants(principal_id, assistant_id)
        for field, value in updates.items():
            setattr(matiere, field, value)
        self.db.commit()
        self._audit("establishment.matiere.update", "matieres", matiere.id)
        return self._matiere_to_response(self._get_matiere_with_relations(matiere.id))

    def delete_matiere(self, matiere_id: uuid.UUID) -> None:
        matiere = self._get_matiere(matiere_id)
        self.db.delete(matiere)
        self.db.commit()
        self._audit("establishment.matiere.delete", "matieres", matiere_id)

    # ── Structure globale ───────────────────────────────────────────────────

    def get_structure(self) -> EtablissementStructure:
        cycles = (
            self.db.query(Cycle)
            .filter(Cycle.tenant_id == self.tenant_id)
            .order_by(Cycle.ordre, Cycle.nom)
            .all()
        )
        classes = (
            self.db.query(Classe)
            .filter(Classe.tenant_id == self.tenant_id)
            .order_by(Classe.ordre, Classe.nom)
            .all()
        )
        salles = (
            self.db.query(Salle)
            .filter(Salle.tenant_id == self.tenant_id)
            .order_by(Salle.nom)
            .all()
        )
        matieres = (
            self.db.query(Matiere)
            .options(
                joinedload(Matiere.classe).joinedload(Classe.cycle),
                joinedload(Matiere.enseignant_principal),
                joinedload(Matiere.enseignant_assistant),
            )
            .filter(Matiere.tenant_id == self.tenant_id)
            .order_by(Matiere.ordre, Matiere.nom)
            .all()
        )
        annees = self.list_annees_scolaires()

        classes_by_cycle: dict[uuid.UUID, list[Classe]] = {}
        for classe in classes:
            classes_by_cycle.setdefault(classe.cycle_id, []).append(classe)

        salles_by_classe: dict[uuid.UUID, list[Salle]] = {}
        for salle in salles:
            salles_by_classe.setdefault(salle.classe_id, []).append(salle)

        matieres_by_classe: dict[uuid.UUID, list[Matiere]] = {}
        for matiere in matieres:
            matieres_by_classe.setdefault(matiere.classe_id, []).append(matiere)

        cycle_nodes: list[CycleStructureResponse] = []
        for cycle in cycles:
            class_nodes: list[ClasseStructureResponse] = []
            for classe in classes_by_cycle.get(cycle.id, []):
                class_nodes.append(
                    ClasseStructureResponse(
                        **ClasseResponse.model_validate(classe).model_dump(),
                        salles=[
                            SalleResponse.model_validate(salle)
                            for salle in salles_by_classe.get(classe.id, [])
                        ],
                        matieres=[
                            self._matiere_to_response(matiere)
                            for matiere in matieres_by_classe.get(classe.id, [])
                        ],
                    )
                )
            cycle_nodes.append(
                CycleStructureResponse(
                    **CycleResponse.model_validate(cycle).model_dump(),
                    classes=class_nodes,
                )
            )

        annee_active = next((annee for annee in annees if annee.est_active), None)
        return EtablissementStructure(
            cycles=cycle_nodes,
            annees_scolaires=annees,
            annee_active=annee_active,
        )

    def dupliquer_structure(
        self,
        annee_src_id: uuid.UUID,
        annee_dst_id: uuid.UUID,
    ) -> DupliquerStructureResponse:
        if annee_src_id == annee_dst_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Les années source et destination doivent être différentes",
            )
        self._get_annee(annee_src_id)
        self._get_annee(annee_dst_id)

        salles_src = (
            self.db.query(Salle)
            .filter(
                Salle.tenant_id == self.tenant_id,
                Salle.annee_scolaire_id == annee_src_id,
            )
            .all()
        )
        salles_copiees = 0
        matieres_copiees = 0

        for salle_src in salles_src:
            exists = (
                self.db.query(Salle)
                .filter(
                    Salle.tenant_id == self.tenant_id,
                    Salle.annee_scolaire_id == annee_dst_id,
                    Salle.classe_id == salle_src.classe_id,
                    Salle.nom == salle_src.nom,
                )
                .first()
            )
            if exists is not None:
                continue
            self.db.add(
                Salle(
                    tenant_id=self.tenant_id,
                    classe_id=salle_src.classe_id,
                    annee_scolaire_id=annee_dst_id,
                    nom=salle_src.nom,
                    nom_salle=salle_src.nom_salle,
                    capacite=salle_src.capacite,
                )
            )
            salles_copiees += 1

        self.db.commit()
        self._audit(
            "establishment.structure.duplicate",
            "annees_scolaires",
            annee_dst_id,
            details={
                "annee_src_id": str(annee_src_id),
                "salles_copiees": salles_copiees,
                "matieres_copiees": matieres_copiees,
            },
        )
        return DupliquerStructureResponse(
            salles_copiees=salles_copiees,
            matieres_copiees=matieres_copiees,
            message="Structure dupliquée avec succès",
        )

    # ── Wizard initialisation établissement ────────────────────────────────

    def execute_wizard(
        self,
        data: WizardEtablissementData,
    ) -> WizardEtablissementResponse:
        date_debut, date_fin = self._parse_annee_scolaire(data.annee_scolaire)

        periodes_creees = 0
        classes_creees = 0
        salles_creees = 0
        matieres_creees = 0

        cycles_by_name: dict[str, Cycle] = {}
        classes_by_name: dict[str, Classe] = {}
        annee_id: uuid.UUID | None = None

        try:
            self._deactivate_all_annees()
            annee = AnneeScolaire(
                tenant_id=self.tenant_id,
                libelle=data.annee_scolaire.strip(),
                date_debut=date_debut,
                date_fin=date_fin,
                est_active=True,
            )
            self.db.add(annee)
            self.db.flush()
            annee_id = annee.id

            for periode_data in data.periodes:
                if periode_data.date_fin < periode_data.date_debut:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Période invalide: {periode_data.periode}",
                    )
                self.db.add(
                    Periode(
                        tenant_id=self.tenant_id,
                        annee_scolaire_id=annee.id,
                        nom=periode_data.periode,
                        date_debut=periode_data.date_debut,
                        date_fin=periode_data.date_fin,
                        ordre=periodes_creees + 1,
                    )
                )
                periodes_creees += 1

            for ordre, cycle_name in enumerate(data.cycles_selectionnes, start=1):
                nom_normalise = cycle_name.strip()
                cycle = (
                    self.db.query(Cycle)
                    .filter(Cycle.tenant_id == self.tenant_id, Cycle.nom == nom_normalise)
                    .first()
                )
                if cycle is None:
                    cycle = Cycle(
                        tenant_id=self.tenant_id,
                        nom=nom_normalise,
                        ordre=ordre,
                    )
                    self._apply_notation_from_valeurs_systeme(cycle)
                    self.db.add(cycle)
                    self.db.flush()
                else:
                    self._apply_notation_from_valeurs_systeme(cycle)
                cycles_by_name[nom_normalise] = cycle

            for classe_data in data.classes_selectionnees:
                cycle = cycles_by_name.get(classe_data.cycle.strip())
                if cycle is None:
                    cycle = (
                        self.db.query(Cycle)
                        .filter(
                            Cycle.tenant_id == self.tenant_id,
                            Cycle.nom == classe_data.cycle.strip(),
                        )
                        .first()
                    )
                    if cycle is None:
                        cycle = Cycle(
                            tenant_id=self.tenant_id,
                            nom=classe_data.cycle.strip(),
                            ordre=0,
                        )
                        self._apply_notation_from_valeurs_systeme(cycle)
                        self.db.add(cycle)
                        self.db.flush()
                    else:
                        self._apply_notation_from_valeurs_systeme(cycle)
                    cycles_by_name[cycle.nom] = cycle

                classe_nom = classe_data.classe.strip()
                classe = (
                    self.db.query(Classe)
                    .filter(
                        Classe.tenant_id == self.tenant_id,
                        Classe.cycle_id == cycle.id,
                        Classe.nom == classe_nom,
                    )
                    .first()
                )
                if classe is None:
                    classe = Classe(
                        tenant_id=self.tenant_id,
                        cycle_id=cycle.id,
                        nom=classe_nom,
                        ordre=0,
                        valeur_systeme_ref=classe_nom,
                    )
                    self.db.add(classe)
                    self.db.flush()
                    classes_creees += 1
                classes_by_name[classe_nom] = classe

            for salle_data in data.salles:
                classe = classes_by_name.get(salle_data.classe.strip())
                if classe is None:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Classe introuvable pour salle: {salle_data.classe}",
                    )
                self.db.add(
                    Salle(
                        tenant_id=self.tenant_id,
                        classe_id=classe.id,
                        annee_scolaire_id=annee.id,
                        nom=salle_data.nom_salle,
                        nom_salle=salle_data.nom_salle,
                        capacite=salle_data.capacite,
                    )
                )
                salles_creees += 1

            for matiere_data in data.matieres:
                classe = classes_by_name.get(matiere_data.classe.strip())
                if classe is None:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Classe introuvable pour matière: {matiere_data.classe}",
                    )
                exists = (
                    self.db.query(Matiere)
                    .filter(
                        Matiere.tenant_id == self.tenant_id,
                        Matiere.classe_id == classe.id,
                        Matiere.nom == matiere_data.nom.strip(),
                    )
                    .first()
                )
                if exists is None:
                    self.db.add(
                        Matiere(
                            tenant_id=self.tenant_id,
                            classe_id=classe.id,
                            nom=matiere_data.nom.strip(),
                            coefficient=matiere_data.coefficient,
                            est_active=True,
                            est_domaine_competence=matiere_data.est_domaine_competence,
                        )
                    )
                    matieres_creees += 1

            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        if annee_id is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Erreur lors de la création de l'année scolaire",
            )

        self._audit(
            "establishment.wizard.complete",
            "annees_scolaires",
            annee_id,
            details={
                "periodes_creees": periodes_creees,
                "classes_creees": classes_creees,
                "salles_creees": salles_creees,
                "matieres_creees": matieres_creees,
            },
        )

        return WizardEtablissementResponse(
            annee_scolaire_id=annee_id,
            periodes_creees=periodes_creees,
            classes_creees=classes_creees,
            salles_creees=salles_creees,
            matieres_creees=matieres_creees,
            message="Configuration de l'établissement terminée",
        )

    # ── Helpers privés ──────────────────────────────────────────────────────

    def _deactivate_all_annees(self) -> None:
        (
            self.db.query(AnneeScolaire)
            .filter(AnneeScolaire.tenant_id == self.tenant_id)
            .update({AnneeScolaire.est_active: False})
        )

    def _parse_annee_scolaire(self, libelle: str) -> tuple[date, date]:
        match = re.match(r"^\s*(\d{4})\s*-\s*(\d{4})\s*$", libelle)
        if match is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="annee_scolaire doit être au format YYYY-YYYY",
            )
        year_start = int(match.group(1))
        year_end = int(match.group(2))
        if year_end != year_start + 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="annee_scolaire doit couvrir deux années consécutives",
            )
        return date(year_start, 9, 1), date(year_end, 6, 30)

    def _apply_notation_from_valeurs_systeme(self, cycle: Cycle) -> None:
        """Applique type_evaluation et barème depuis valeurs_systeme (seed migration 010)."""
        row = (
            self.db.query(ValeurSysteme)
            .filter(
                ValeurSysteme.categorie == "cycle",
                ValeurSysteme.valeur == cycle.nom,
                ValeurSysteme.actif.is_(True),
            )
            .first()
        )
        cycle.valeur_systeme_ref = cycle.nom
        if row is None or not row.metadata_json:
            cycle.type_evaluation = "chiffree"
            cycle.note_max = DEFAULT_NOTE_MAX
            cycle.note_passage = DEFAULT_NOTE_PASSAGE
            cycle.arrondi = DEFAULT_ARRONDI
            return

        meta = row.metadata_json
        type_eval = meta.get("type_evaluation", "chiffree")
        cycle.type_evaluation = type_eval
        if type_eval == "qualitative":
            cycle.note_max = None
            cycle.note_passage = None
            cycle.arrondi = None
            return

        note_max = meta.get("note_max")
        note_passage = meta.get("note_passage")
        arrondi = meta.get("arrondi")
        cycle.note_max = (
            Decimal(str(note_max)) if note_max is not None else DEFAULT_NOTE_MAX
        )
        cycle.note_passage = (
            Decimal(str(note_passage))
            if note_passage is not None
            else DEFAULT_NOTE_PASSAGE
        )
        cycle.arrondi = int(arrondi) if arrondi is not None else DEFAULT_ARRONDI

    def _get_cycle(self, cycle_id: uuid.UUID) -> Cycle:
        cycle = (
            self.db.query(Cycle)
            .filter(Cycle.id == cycle_id, Cycle.tenant_id == self.tenant_id)
            .first()
        )
        if cycle is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cycle introuvable",
            )
        return cycle

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

    def _get_salle(self, salle_id: uuid.UUID) -> Salle:
        salle = (
            self.db.query(Salle)
            .filter(Salle.id == salle_id, Salle.tenant_id == self.tenant_id)
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

    def _get_matiere_with_relations(self, matiere_id: uuid.UUID) -> Matiere:
        matiere = (
            self.db.query(Matiere)
            .options(
                joinedload(Matiere.classe).joinedload(Classe.cycle),
                joinedload(Matiere.enseignant_principal),
                joinedload(Matiere.enseignant_assistant),
            )
            .filter(Matiere.id == matiere_id, Matiere.tenant_id == self.tenant_id)
            .first()
        )
        if matiere is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Matière introuvable",
            )
        return matiere

    def _get_enseignant(self, enseignant_id: uuid.UUID) -> Enseignant:
        enseignant = (
            self.db.query(Enseignant)
            .filter(
                Enseignant.id == enseignant_id,
                Enseignant.tenant_id == self.tenant_id,
            )
            .first()
        )
        if enseignant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Enseignant introuvable",
            )
        return enseignant

    def _validate_matiere_enseignants(
        self,
        principal_id: uuid.UUID | None,
        assistant_id: uuid.UUID | None,
    ) -> None:
        if principal_id is not None:
            self._get_enseignant(principal_id)
        if assistant_id is not None:
            self._get_enseignant(assistant_id)

    @staticmethod
    def _enseignant_display_name(enseignant: Enseignant | None) -> str | None:
        if enseignant is None:
            return None
        return f"{enseignant.prenom} {enseignant.nom}".strip()

    def _matiere_to_response(self, matiere: Matiere) -> MatiereResponse:
        classe = matiere.classe
        cycle = classe.cycle if classe is not None else None
        note_max_effective = matiere.note_max
        if note_max_effective is None and cycle is not None:
            note_max_effective = cycle.note_max
        return MatiereResponse(
            id=matiere.id,
            tenant_id=matiere.tenant_id,
            classe_id=matiere.classe_id,
            nom=matiere.nom,
            coefficient=matiere.coefficient,
            note_max=matiere.note_max,
            note_max_effective=note_max_effective,
            est_obligatoire=matiere.est_obligatoire,
            est_domaine_competence=matiere.est_domaine_competence,
            ordre=matiere.ordre,
            est_active=matiere.est_active,
            enseignant_principal_id=matiere.enseignant_principal_id,
            enseignant_assistant_id=matiere.enseignant_assistant_id,
            cycle_id=cycle.id if cycle is not None else None,
            cycle_nom=cycle.nom if cycle is not None else None,
            classe_nom=classe.nom if classe is not None else None,
            enseignant_principal_nom=self._enseignant_display_name(
                matiere.enseignant_principal
            ),
            enseignant_assistant_nom=self._enseignant_display_name(
                matiere.enseignant_assistant
            ),
        )
