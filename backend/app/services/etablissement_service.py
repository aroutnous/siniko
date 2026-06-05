"""Logique métier M2 — Gestion établissement scolaire."""

import uuid
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.eleve import Inscription
from app.models.etablissement import (
    AnneeScolaire,
    Classe,
    ConfigNotation,
    Cycle,
    Matiere,
    Niveau,
    Periode,
)
from app.models.pedagogie import Note
from app.schemas.etablissement import (
    AnneeScolaireCreate,
    AnneeScolaireResponse,
    AnneeScolaireUpdate,
    ClasseCreate,
    ClasseEffectifResponse,
    ClasseResponse,
    ClasseUpdate,
    ConfigNotationResponse,
    ConfigNotationUpdate,
    CycleCreate,
    CycleResponse,
    CycleUpdate,
    DupliquerStructureResponse,
    EtablissementConfig,
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
        cycle = Cycle(tenant_id=self.tenant_id, **data.model_dump())
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
        return [CycleResponse.model_validate(c) for c in cycles]

    def get_cycle(self, cycle_id: uuid.UUID) -> CycleResponse:
        return CycleResponse.model_validate(self._get_cycle(cycle_id))

    def update_cycle(self, cycle_id: uuid.UUID, data: CycleUpdate) -> CycleResponse:
        cycle = self._get_cycle(cycle_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(cycle, field, value)
        self.db.commit()
        self.db.refresh(cycle)
        self._audit("establishment.cycle.update", "cycles", cycle.id)
        return CycleResponse.model_validate(cycle)

    def delete_cycle(self, cycle_id: uuid.UUID) -> None:
        cycle = self._get_cycle(cycle_id)
        if (
            self.db.query(Niveau)
            .filter(Niveau.cycle_id == cycle_id, Niveau.tenant_id == self.tenant_id)
            .count()
            > 0
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer un cycle contenant des niveaux",
            )
        self.db.delete(cycle)
        self.db.commit()
        self._audit("establishment.cycle.delete", "cycles", cycle_id)

    # ── Niveaux ─────────────────────────────────────────────────────────────

    def create_niveau(self, data: NiveauCreate) -> NiveauResponse:
        self._get_cycle(data.cycle_id)
        niveau = Niveau(tenant_id=self.tenant_id, **data.model_dump())
        self.db.add(niveau)
        self.db.commit()
        self.db.refresh(niveau)
        self._audit("establishment.niveau.create", "niveaux", niveau.id)
        return NiveauResponse.model_validate(niveau)

    def list_niveaux(self, cycle_id: uuid.UUID | None = None) -> list[NiveauResponse]:
        query = self.db.query(Niveau).filter(Niveau.tenant_id == self.tenant_id)
        if cycle_id is not None:
            self._get_cycle(cycle_id)
            query = query.filter(Niveau.cycle_id == cycle_id)
        niveaux = query.order_by(Niveau.ordre, Niveau.nom).all()
        return [NiveauResponse.model_validate(n) for n in niveaux]

    def get_niveau(self, niveau_id: uuid.UUID) -> NiveauResponse:
        return NiveauResponse.model_validate(self._get_niveau(niveau_id))

    def update_niveau(self, niveau_id: uuid.UUID, data: NiveauUpdate) -> NiveauResponse:
        niveau = self._get_niveau(niveau_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(niveau, field, value)
        self.db.commit()
        self.db.refresh(niveau)
        self._audit("establishment.niveau.update", "niveaux", niveau.id)
        return NiveauResponse.model_validate(niveau)

    def delete_niveau(self, niveau_id: uuid.UUID) -> None:
        niveau = self._get_niveau(niveau_id)
        if (
            self.db.query(Classe)
            .filter(Classe.niveau_id == niveau_id, Classe.tenant_id == self.tenant_id)
            .count()
            > 0
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer un niveau contenant des classes",
            )
        if (
            self.db.query(Matiere)
            .filter(Matiere.niveau_id == niveau_id, Matiere.tenant_id == self.tenant_id)
            .count()
            > 0
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer un niveau contenant des matières",
            )
        self.db.delete(niveau)
        self.db.commit()
        self._audit("establishment.niveau.delete", "niveaux", niveau_id)

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
        return [AnneeScolaireResponse.model_validate(a) for a in annees]

    def get_annee_scolaire(self, annee_id: uuid.UUID) -> AnneeScolaireResponse:
        return AnneeScolaireResponse.model_validate(self._get_annee(annee_id))

    def get_annee_active(self) -> AnneeScolaireResponse:
        annee = (
            self.db.query(AnneeScolaire)
            .filter(
                AnneeScolaire.tenant_id == self.tenant_id,
                AnneeScolaire.est_active.is_(True),
            )
            .first()
        )
        if annee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Aucune année scolaire active",
            )
        return AnneeScolaireResponse.model_validate(annee)

    def update_annee_scolaire(
        self, annee_id: uuid.UUID, data: AnneeScolaireUpdate
    ) -> AnneeScolaireResponse:
        annee = self._get_annee(annee_id)
        payload = data.model_dump(exclude_unset=True)
        if "est_active" in payload and payload["est_active"]:
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
        self, annee_scolaire_id: uuid.UUID | None = None
    ) -> list[PeriodeResponse]:
        query = self.db.query(Periode).filter(Periode.tenant_id == self.tenant_id)
        if annee_scolaire_id is not None:
            self._get_annee(annee_scolaire_id)
            query = query.filter(Periode.annee_scolaire_id == annee_scolaire_id)
        periodes = query.order_by(Periode.ordre, Periode.nom).all()
        return [PeriodeResponse.model_validate(p) for p in periodes]

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

    # ── Classes ─────────────────────────────────────────────────────────────

    def create_classe(self, data: ClasseCreate) -> ClasseResponse:
        self._get_niveau(data.niveau_id)
        self._get_annee(data.annee_scolaire_id)
        classe = Classe(tenant_id=self.tenant_id, **data.model_dump())
        self.db.add(classe)
        self.db.commit()
        self.db.refresh(classe)
        self._audit("establishment.classe.create", "classes", classe.id)
        return ClasseResponse.model_validate(classe)

    def list_classes(
        self,
        niveau_id: uuid.UUID | None = None,
        annee_scolaire_id: uuid.UUID | None = None,
    ) -> list[ClasseResponse]:
        query = self.db.query(Classe).filter(Classe.tenant_id == self.tenant_id)
        if niveau_id is not None:
            self._get_niveau(niveau_id)
            query = query.filter(Classe.niveau_id == niveau_id)
        if annee_scolaire_id is not None:
            self._get_annee(annee_scolaire_id)
            query = query.filter(Classe.annee_scolaire_id == annee_scolaire_id)
        classes = query.order_by(Classe.nom).all()
        return [ClasseResponse.model_validate(c) for c in classes]

    def get_classe(self, classe_id: uuid.UUID) -> ClasseResponse:
        return ClasseResponse.model_validate(self._get_classe(classe_id))

    def update_classe(self, classe_id: uuid.UUID, data: ClasseUpdate) -> ClasseResponse:
        classe = self._get_classe(classe_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(classe, field, value)
        self.db.commit()
        self.db.refresh(classe)
        self._audit("establishment.classe.update", "classes", classe.id)
        return ClasseResponse.model_validate(classe)

    def delete_classe(self, classe_id: uuid.UUID) -> None:
        classe = self._get_classe(classe_id)
        if (
            self.db.query(Inscription)
            .filter(
                Inscription.classe_id == classe_id,
                Inscription.tenant_id == self.tenant_id,
            )
            .count()
            > 0
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer une classe avec des inscriptions",
            )
        self.db.delete(classe)
        self.db.commit()
        self._audit("establishment.classe.delete", "classes", classe_id)

    def get_classe_effectif(self, classe_id: uuid.UUID) -> ClasseEffectifResponse:
        classe = self._get_classe(classe_id)
        effectif = (
            self.db.query(Inscription)
            .filter(
                Inscription.classe_id == classe_id,
                Inscription.tenant_id == self.tenant_id,
            )
            .count()
        )
        est_complete = (
            classe.capacite_max is not None and effectif >= classe.capacite_max
        )
        return ClasseEffectifResponse(
            classe_id=classe.id,
            effectif=effectif,
            capacite_max=classe.capacite_max,
            est_complete=est_complete,
        )

    # ── Matières ────────────────────────────────────────────────────────────

    def create_matiere(self, data: MatiereCreate) -> MatiereResponse:
        self._get_niveau(data.niveau_id)
        matiere = Matiere(tenant_id=self.tenant_id, **data.model_dump())
        self.db.add(matiere)
        self.db.commit()
        self.db.refresh(matiere)
        self._audit("establishment.matiere.create", "matieres", matiere.id)
        return MatiereResponse.model_validate(matiere)

    def list_matieres(self, niveau_id: uuid.UUID | None = None) -> list[MatiereResponse]:
        query = self.db.query(Matiere).filter(Matiere.tenant_id == self.tenant_id)
        if niveau_id is not None:
            self._get_niveau(niveau_id)
            query = query.filter(Matiere.niveau_id == niveau_id)
        matieres = query.order_by(Matiere.nom).all()
        return [MatiereResponse.model_validate(m) for m in matieres]

    def get_matiere(self, matiere_id: uuid.UUID) -> MatiereResponse:
        return MatiereResponse.model_validate(self._get_matiere(matiere_id))

    def update_matiere(self, matiere_id: uuid.UUID, data: MatiereUpdate) -> MatiereResponse:
        matiere = self._get_matiere(matiere_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(matiere, field, value)
        self.db.commit()
        self.db.refresh(matiere)
        self._audit("establishment.matiere.update", "matieres", matiere.id)
        return MatiereResponse.model_validate(matiere)

    def delete_matiere(self, matiere_id: uuid.UUID) -> None:
        matiere = self._get_matiere(matiere_id)
        if (
            self.db.query(Note)
            .filter(Note.matiere_id == matiere_id, Note.tenant_id == self.tenant_id)
            .count()
            > 0
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de supprimer une matière avec des notes",
            )
        self.db.delete(matiere)
        self.db.commit()
        self._audit("establishment.matiere.delete", "matieres", matiere_id)

    # ── Configuration notation ──────────────────────────────────────────────

    def get_config_notation(self) -> ConfigNotationResponse:
        config = (
            self.db.query(ConfigNotation)
            .filter(ConfigNotation.tenant_id == self.tenant_id)
            .first()
        )
        if config is None:
            config = ConfigNotation(
                tenant_id=self.tenant_id,
                note_max=DEFAULT_NOTE_MAX,
                note_passage=DEFAULT_NOTE_PASSAGE,
                arrondi=DEFAULT_ARRONDI,
            )
            self.db.add(config)
            self.db.commit()
            self.db.refresh(config)
        return ConfigNotationResponse.model_validate(config)

    def update_config_notation(self, data: ConfigNotationUpdate) -> ConfigNotationResponse:
        config_row = (
            self.db.query(ConfigNotation)
            .filter(ConfigNotation.tenant_id == self.tenant_id)
            .first()
        )
        if config_row is None:
            config_row = ConfigNotation(
                tenant_id=self.tenant_id,
                note_max=DEFAULT_NOTE_MAX,
                note_passage=DEFAULT_NOTE_PASSAGE,
                arrondi=DEFAULT_ARRONDI,
            )
            self.db.add(config_row)
            self.db.flush()
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(config_row, field, value)
        if config_row.note_passage > config_row.note_max:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="note_passage ne peut pas dépasser note_max",
            )
        self.db.commit()
        self.db.refresh(config_row)
        self._audit("establishment.config_notation.update", "config_notation", config_row.id)
        return ConfigNotationResponse.model_validate(config_row)

    # ── Structure globale ───────────────────────────────────────────────────

    def get_structure(self) -> EtablissementStructure:
        cycles = (
            self.db.query(Cycle)
            .filter(Cycle.tenant_id == self.tenant_id)
            .order_by(Cycle.ordre, Cycle.nom)
            .all()
        )
        niveaux = (
            self.db.query(Niveau)
            .filter(Niveau.tenant_id == self.tenant_id)
            .order_by(Niveau.ordre, Niveau.nom)
            .all()
        )
        classes = (
            self.db.query(Classe)
            .filter(Classe.tenant_id == self.tenant_id)
            .order_by(Classe.nom)
            .all()
        )
        matieres = (
            self.db.query(Matiere)
            .filter(Matiere.tenant_id == self.tenant_id)
            .order_by(Matiere.nom)
            .all()
        )
        annees = self.list_annees_scolaires()

        niveaux_by_cycle: dict[uuid.UUID, list] = {}
        for n in niveaux:
            niveaux_by_cycle.setdefault(n.cycle_id, []).append(n)

        classes_by_niveau: dict[uuid.UUID, list] = {}
        for c in classes:
            classes_by_niveau.setdefault(c.niveau_id, []).append(c)

        matieres_by_niveau: dict[uuid.UUID, list] = {}
        for m in matieres:
            matieres_by_niveau.setdefault(m.niveau_id, []).append(m)

        from app.schemas.etablissement import (
            CycleStructureResponse,
            NiveauStructureResponse,
        )

        cycle_tree = []
        for cycle in cycles:
            niveau_nodes = []
            for niveau in niveaux_by_cycle.get(cycle.id, []):
                niveau_nodes.append(
                    NiveauStructureResponse(
                        **NiveauResponse.model_validate(niveau).model_dump(),
                        classes=[
                            ClasseResponse.model_validate(c)
                            for c in classes_by_niveau.get(niveau.id, [])
                        ],
                        matieres=[
                            MatiereResponse.model_validate(m)
                            for m in matieres_by_niveau.get(niveau.id, [])
                        ],
                    )
                )
            cycle_tree.append(
                CycleStructureResponse(
                    **CycleResponse.model_validate(cycle).model_dump(),
                    niveaux=niveau_nodes,
                )
            )

        annee_active = next((a for a in annees if a.est_active), None)
        return EtablissementStructure(
            cycles=cycle_tree,
            annees_scolaires=annees,
            annee_active=annee_active,
        )

    def get_etablissement_config(self) -> EtablissementConfig:
        from app.schemas.etablissement import EtablissementConfig

        return EtablissementConfig(
            structure=self.get_structure(),
            config_notation=self.get_config_notation(),
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

        classes_src = (
            self.db.query(Classe)
            .filter(
                Classe.tenant_id == self.tenant_id,
                Classe.annee_scolaire_id == annee_src_id,
            )
            .all()
        )
        classes_copiees = 0
        matieres_copiees = 0
        niveaux_traites: set[uuid.UUID] = set()

        for src in classes_src:
            exists = (
                self.db.query(Classe)
                .filter(
                    Classe.tenant_id == self.tenant_id,
                    Classe.annee_scolaire_id == annee_dst_id,
                    Classe.niveau_id == src.niveau_id,
                    Classe.nom == src.nom,
                )
                .first()
            )
            if exists is None:
                self.db.add(
                    Classe(
                        tenant_id=self.tenant_id,
                        niveau_id=src.niveau_id,
                        annee_scolaire_id=annee_dst_id,
                        nom=src.nom,
                        capacite_max=src.capacite_max,
                    )
                )
                classes_copiees += 1

            if src.niveau_id not in niveaux_traites:
                niveaux_traites.add(src.niveau_id)

        # Matières liées au niveau (partagées entre années) — recopiées si absentes
        for niveau_id in niveaux_traites:
            matieres_src = (
                self.db.query(Matiere)
                .filter(
                    Matiere.tenant_id == self.tenant_id,
                    Matiere.niveau_id == niveau_id,
                )
                .all()
            )
            for mat in matieres_src:
                exists = (
                    self.db.query(Matiere)
                    .filter(
                        Matiere.tenant_id == self.tenant_id,
                        Matiere.niveau_id == niveau_id,
                        Matiere.nom == mat.nom,
                    )
                    .first()
                )
                if exists is None:
                    self.db.add(
                        Matiere(
                            tenant_id=self.tenant_id,
                            niveau_id=niveau_id,
                            nom=mat.nom,
                            coefficient=mat.coefficient,
                            est_active=mat.est_active,
                        )
                    )
                    matieres_copiees += 1

        self.db.commit()
        self._audit(
            "establishment.structure.duplicate",
            "annees_scolaires",
            annee_dst_id,
            details={
                "annee_src_id": str(annee_src_id),
                "classes_copiees": classes_copiees,
                "matieres_copiees": matieres_copiees,
            },
        )
        return DupliquerStructureResponse(
            classes_copiees=classes_copiees,
            matieres_copiees=matieres_copiees,
            message="Structure dupliquée avec succès",
        )

    # ── Helpers privés ──────────────────────────────────────────────────────

    def _deactivate_all_annees(self) -> None:
        (
            self.db.query(AnneeScolaire)
            .filter(AnneeScolaire.tenant_id == self.tenant_id)
            .update({AnneeScolaire.est_active: False})
        )

    def _get_cycle(self, cycle_id: uuid.UUID) -> Cycle:
        cycle = (
            self.db.query(Cycle)
            .filter(Cycle.id == cycle_id, Cycle.tenant_id == self.tenant_id)
            .first()
        )
        if cycle is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle introuvable")
        return cycle

    def _get_niveau(self, niveau_id: uuid.UUID) -> Niveau:
        niveau = (
            self.db.query(Niveau)
            .filter(Niveau.id == niveau_id, Niveau.tenant_id == self.tenant_id)
            .first()
        )
        if niveau is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Niveau introuvable")
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
