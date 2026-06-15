"""Routes M2 — Gestion établissement scolaire."""

import uuid
from typing import Annotated, Callable

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import RedirectResponse

from app.core.database import DbSession
from app.core.security import CurrentUser, require_permission
from app.models.auth import Utilisateur
from app.models.enums import Permission
from app.schemas.etablissement import (
    AnneeScolaireCreate,
    AnneeScolaireResponse,
    AnneeScolaireUpdate,
    ClasseCreate,
    ClasseResponse,
    ClasseUpdate,
    CycleCreate,
    CycleResponse,
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
from app.services.etablissement_service import EtablissementService
from app.services.permissions import user_has_any_permission
from app.services.valeur_systeme_service import ValeurSystemeService

router = APIRouter(tags=["etablissement"])


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def require_establishment_read() -> Callable[..., Utilisateur]:
    async def checker(current_user: CurrentUser, db: DbSession) -> Utilisateur:
        if not user_has_any_permission(
            db,
            current_user,
            Permission.ETABLISSEMENT_ACCEDER.value,
            Permission.CLASSES_CONSULTER.value,
            Permission.CLASSES_GERER.value,
        ):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


EstablishmentReader = Annotated[Utilisateur, Depends(require_establishment_read())]
EstablishmentManager = Annotated[
    Utilisateur,
    Depends(require_permission(Permission.ETABLISSEMENT_CONFIGURER.value)),
]


def _service(db: DbSession, user: Utilisateur, request: Request) -> EtablissementService:
    return EtablissementService(
        db=db,
        tenant_id=user.tenant_id,
        utilisateur_id=user.id,
        ip_address=_client_ip(request),
    )


# ── Valeurs système ─────────────────────────────────────────────────────────


@router.get("/valeurs/cycles")
def get_valeurs_cycles(db: DbSession, user: CurrentUser) -> list[dict]:
    return ValeurSystemeService(db).get_cycles()


@router.get("/valeurs/classes")
def get_valeurs_classes(
    db: DbSession,
    user: CurrentUser,
    cycle: str = Query(..., min_length=1),
) -> list[dict]:
    return ValeurSystemeService(db).get_classes_par_cycle(cycle)


@router.get("/valeurs/periodes")
def get_valeurs_periodes(db: DbSession, user: CurrentUser) -> list[dict]:
    return ValeurSystemeService(db).get_periodes()


@router.get("/valeurs/annees-scolaires")
def get_valeurs_annees_scolaires(db: DbSession, user: CurrentUser) -> list[dict]:
    return ValeurSystemeService(db).get_annees_scolaires()


# ── Wizard ──────────────────────────────────────────────────────────────────


@router.post(
    "/wizard",
    response_model=WizardEtablissementResponse,
    status_code=status.HTTP_201_CREATED,
)
def wizard_etablissement(
    body: WizardEtablissementData,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> WizardEtablissementResponse:
    return _service(db, user, request).execute_wizard(body)


# ── Cycles ──────────────────────────────────────────────────────────────────


@router.post("/cycles", response_model=CycleResponse, status_code=status.HTTP_201_CREATED)
def create_cycle(
    body: CycleCreate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> CycleResponse:
    return _service(db, user, request).create_cycle(body)


@router.get("/cycles", response_model=list[CycleResponse])
def list_cycles(
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> list[CycleResponse]:
    return _service(db, user, request).list_cycles()


@router.get("/cycles/{cycle_id}", response_model=CycleResponse)
def get_cycle(
    cycle_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> CycleResponse:
    return _service(db, user, request).get_cycle(cycle_id)


@router.put("/cycles/{cycle_id}", response_model=CycleResponse)
def update_cycle(
    cycle_id: uuid.UUID,
    body: CycleUpdate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> CycleResponse:
    return _service(db, user, request).update_cycle(cycle_id, body)


@router.delete("/cycles/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cycle(
    cycle_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> None:
    _service(db, user, request).delete_cycle(cycle_id)


# ── Classes (niveaux pédagogiques) ─────────────────────────────────────────


@router.post("/classes", response_model=ClasseResponse, status_code=status.HTTP_201_CREATED)
def create_classe(
    body: ClasseCreate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> ClasseResponse:
    return _service(db, user, request).create_classe(body)


@router.get("/classes", response_model=list[ClasseResponse])
def list_classes(
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
    cycle_id: uuid.UUID | None = Query(default=None),
) -> list[ClasseResponse]:
    return _service(db, user, request).list_classes(cycle_id)


@router.get("/classes/{classe_id}", response_model=ClasseResponse)
def get_classe(
    classe_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> ClasseResponse:
    return _service(db, user, request).get_classe(classe_id)


@router.put("/classes/{classe_id}", response_model=ClasseResponse)
def update_classe(
    classe_id: uuid.UUID,
    body: ClasseUpdate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> ClasseResponse:
    return _service(db, user, request).update_classe(classe_id, body)


@router.delete("/classes/{classe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_classe(
    classe_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> None:
    _service(db, user, request).delete_classe(classe_id)


# ── Salles (divisions physiques) ────────────────────────────────────────────


@router.post("/salles", response_model=SalleResponse, status_code=status.HTTP_201_CREATED)
def create_salle(
    body: SalleCreate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> SalleResponse:
    return _service(db, user, request).create_salle(body)


@router.get("/salles", response_model=list[SalleResponse])
def list_salles(
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
    classe_id: uuid.UUID | None = Query(default=None),
    annee_scolaire_id: uuid.UUID | None = Query(default=None),
    niveau_id: uuid.UUID | None = Query(default=None),
) -> list[SalleResponse]:
    return _service(db, user, request).list_salles(
        classe_id or niveau_id, annee_scolaire_id
    )


@router.get("/salles/{salle_id}", response_model=SalleResponse)
def get_salle(
    salle_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> SalleResponse:
    return _service(db, user, request).get_salle(salle_id)


@router.put("/salles/{salle_id}", response_model=SalleResponse)
def update_salle(
    salle_id: uuid.UUID,
    body: SalleUpdate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> SalleResponse:
    return _service(db, user, request).update_salle(salle_id, body)


@router.delete("/salles/{salle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_salle(
    salle_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> None:
    _service(db, user, request).delete_salle(salle_id)


@router.get("/salles/{salle_id}/effectif", response_model=SalleEffectifResponse)
def get_salle_effectif(
    salle_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> SalleEffectifResponse:
    return _service(db, user, request).get_salle_effectif(salle_id)


# ── Alias legacy /niveaux → classes ─────────────────────────────────────────


@router.post("/niveaux", response_model=NiveauResponse, status_code=status.HTTP_201_CREATED)
def create_niveau(
    body: NiveauCreate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> NiveauResponse:
    return _service(db, user, request).create_niveau(body)


@router.get("/niveaux", response_model=list[NiveauResponse])
def list_niveaux(
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
    cycle_id: uuid.UUID | None = Query(default=None),
) -> list[NiveauResponse]:
    return _service(db, user, request).list_niveaux(cycle_id)


@router.get("/niveaux/{niveau_id}", response_model=NiveauResponse)
def get_niveau(
    niveau_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> NiveauResponse:
    return _service(db, user, request).get_niveau(niveau_id)


@router.put("/niveaux/{niveau_id}", response_model=NiveauResponse)
def update_niveau(
    niveau_id: uuid.UUID,
    body: NiveauUpdate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> NiveauResponse:
    return _service(db, user, request).update_niveau(niveau_id, body)


@router.delete("/niveaux/{niveau_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_niveau(
    niveau_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> None:
    _service(db, user, request).delete_niveau(niveau_id)


# ── Alias legacy divisions physiques (anciennes /classes → /salles) ─────────


@router.post(
    "/divisions",
    response_model=SalleResponse,
    status_code=status.HTTP_201_CREATED,
    deprecated=True,
)
def legacy_create_division(
    body: SalleCreate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> SalleResponse:
    return _service(db, user, request).create_salle(body)


@router.get("/divisions", response_model=list[SalleResponse], deprecated=True)
def legacy_list_divisions(
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
    niveau_id: uuid.UUID | None = Query(default=None),
    annee_scolaire_id: uuid.UUID | None = Query(default=None),
) -> list[SalleResponse]:
    return _service(db, user, request).list_salles(niveau_id, annee_scolaire_id)


@router.get("/divisions/{salle_id}", response_model=SalleResponse, deprecated=True)
def legacy_get_division(
    salle_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> SalleResponse:
    return _service(db, user, request).get_salle(salle_id)


@router.get(
    "/divisions/{salle_id}/effectif",
    response_model=SalleEffectifResponse,
    deprecated=True,
)
def legacy_division_effectif(
    salle_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> SalleEffectifResponse:
    return _service(db, user, request).get_salle_effectif(salle_id)


@router.get("/classes-physiques", status_code=status.HTTP_301_MOVED_PERMANENTLY, include_in_schema=False)
def redirect_classes_physiques() -> RedirectResponse:
    return RedirectResponse(url="/salles", status_code=status.HTTP_301_MOVED_PERMANENTLY)


# ── Années scolaires ────────────────────────────────────────────────────────


@router.post(
    "/annees-scolaires",
    response_model=AnneeScolaireResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_annee_scolaire(
    body: AnneeScolaireCreate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> AnneeScolaireResponse:
    return _service(db, user, request).create_annee_scolaire(body)


@router.get("/annees-scolaires", response_model=list[AnneeScolaireResponse])
def list_annees_scolaires(
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> list[AnneeScolaireResponse]:
    return _service(db, user, request).list_annees_scolaires()


@router.get("/annees-scolaires/active", response_model=AnneeScolaireResponse | None)
def get_annee_active(
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> AnneeScolaireResponse | None:
    return _service(db, user, request).get_annee_active()


@router.put("/annees-scolaires/{annee_id}", response_model=AnneeScolaireResponse)
def update_annee_scolaire(
    annee_id: uuid.UUID,
    body: AnneeScolaireUpdate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> AnneeScolaireResponse:
    return _service(db, user, request).update_annee_scolaire(annee_id, body)


@router.post("/annees-scolaires/{annee_id}/activer", response_model=AnneeScolaireResponse)
def activer_annee_scolaire(
    annee_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> AnneeScolaireResponse:
    return _service(db, user, request).activer_annee_scolaire(annee_id)


@router.delete("/annees-scolaires/{annee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_annee_scolaire(
    annee_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> None:
    _service(db, user, request).delete_annee_scolaire(annee_id)


# ── Périodes ────────────────────────────────────────────────────────────────


@router.post("/periodes", response_model=PeriodeResponse, status_code=status.HTTP_201_CREATED)
def create_periode(
    body: PeriodeCreate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> PeriodeResponse:
    return _service(db, user, request).create_periode(body)


@router.get("/periodes", response_model=list[PeriodeResponse])
def list_periodes(
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
    annee_scolaire_id: uuid.UUID | None = Query(default=None),
) -> list[PeriodeResponse]:
    return _service(db, user, request).list_periodes(annee_scolaire_id)


@router.get("/periodes/{periode_id}", response_model=PeriodeResponse)
def get_periode(
    periode_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> PeriodeResponse:
    return _service(db, user, request).get_periode(periode_id)


@router.put("/periodes/{periode_id}", response_model=PeriodeResponse)
def update_periode(
    periode_id: uuid.UUID,
    body: PeriodeUpdate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> PeriodeResponse:
    return _service(db, user, request).update_periode(periode_id, body)


@router.delete("/periodes/{periode_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_periode(
    periode_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> None:
    _service(db, user, request).delete_periode(periode_id)


# ── Séquences d'évaluation ──────────────────────────────────────────────────


@router.get("/sequences-evaluation", response_model=list[SequenceEvaluationResponse])
def list_sequences_evaluation(
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
    cycle_id: uuid.UUID | None = Query(default=None),
    periode_id: uuid.UUID | None = Query(default=None),
) -> list[SequenceEvaluationResponse]:
    return _service(db, user, request).lister_sequences(cycle_id, periode_id)


@router.post(
    "/sequences-evaluation",
    response_model=SequenceEvaluationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_sequence_evaluation(
    body: SequenceEvaluationCreate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> SequenceEvaluationResponse:
    return _service(db, user, request).creer_sequence(body)


@router.put(
    "/sequences-evaluation/{sequence_id}",
    response_model=SequenceEvaluationResponse,
)
def update_sequence_evaluation(
    sequence_id: uuid.UUID,
    body: SequenceEvaluationUpdate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> SequenceEvaluationResponse:
    return _service(db, user, request).modifier_sequence(sequence_id, body)


@router.delete(
    "/sequences-evaluation/{sequence_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_sequence_evaluation(
    sequence_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> None:
    _service(db, user, request).supprimer_sequence(sequence_id)


# ── Matières ────────────────────────────────────────────────────────────────


@router.post("/matieres", response_model=MatiereResponse, status_code=status.HTTP_201_CREATED)
def create_matiere(
    body: MatiereCreate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> MatiereResponse:
    return _service(db, user, request).create_matiere(body)


@router.get("/matieres", response_model=list[MatiereResponse])
def list_matieres(
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
    classe_id: uuid.UUID | None = Query(default=None),
    niveau_id: uuid.UUID | None = Query(default=None),
) -> list[MatiereResponse]:
    return _service(db, user, request).list_matieres(classe_id or niveau_id)


@router.get("/matieres/{matiere_id}", response_model=MatiereResponse)
def get_matiere(
    matiere_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> MatiereResponse:
    return _service(db, user, request).get_matiere(matiere_id)


@router.put("/matieres/{matiere_id}", response_model=MatiereResponse)
def update_matiere(
    matiere_id: uuid.UUID,
    body: MatiereUpdate,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> MatiereResponse:
    return _service(db, user, request).update_matiere(matiere_id, body)


@router.delete("/matieres/{matiere_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_matiere(
    matiere_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> None:
    _service(db, user, request).delete_matiere(matiere_id)


# ── Structure globale ───────────────────────────────────────────────────────


@router.get("/etablissement/structure", response_model=EtablissementStructure)
def get_structure(
    request: Request,
    db: DbSession,
    user: EstablishmentReader,
) -> EtablissementStructure:
    return _service(db, user, request).get_structure()


@router.post(
    "/etablissement/dupliquer",
    response_model=DupliquerStructureResponse,
    status_code=status.HTTP_201_CREATED,
)
def dupliquer_structure(
    annee_src_id: uuid.UUID,
    annee_dst_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: EstablishmentManager,
) -> DupliquerStructureResponse:
    return _service(db, user, request).dupliquer_structure(annee_src_id, annee_dst_id)
