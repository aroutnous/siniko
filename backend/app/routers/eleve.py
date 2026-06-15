"""Routes M3 — Gestion des élèves."""

import uuid
from typing import Annotated, Callable

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse

from app.core.database import DbSession
from app.core.security import CurrentUser
from app.models.auth import Utilisateur
from app.schemas.eleve import (
    AbsenceCreate,
    AbsenceJustifierRequest,
    AbsenceResponse,
    ClasseAbsencesResponse,
    DossierEleveResponse,
    EleveInscrireCreate,
    EleveInscrireResponse,
    EleveListResponse,
    EleveResponse,
    EleveUpdate,
    InscriptionResponse,
    TransfertRequest,
)
from app.services.eleve_service import EleveService
from app.models.enums import Permission
from app.services.permissions import user_has_any_permission, user_has_permission

router = APIRouter(prefix="/eleves", tags=["eleves"])

PDF_MEDIA = "application/pdf"


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def require_students_read() -> Callable[..., Utilisateur]:
    """Lecture : students.read, students.manage ou students.update."""

    async def checker(current_user: CurrentUser, db: DbSession) -> Utilisateur:
        if not user_has_any_permission(
            db,
            current_user,
            Permission.ELEVES_CONSULTER.value,
            Permission.ELEVES_INSCRIRE.value,
            Permission.ELEVES_DOSSIERS.value,
        ):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


def require_students_write() -> Callable[..., Utilisateur]:
    """Écriture : students.manage ou students.update (Secrétaire, Directeur, Promoteur)."""

    async def checker(current_user: CurrentUser, db: DbSession) -> Utilisateur:
        if not user_has_any_permission(
            db,
            current_user,
            Permission.ELEVES_INSCRIRE.value,
            Permission.ELEVES_DOSSIERS.value,
            Permission.ABSENCES_GERER.value,
        ):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


StudentsReader = Annotated[Utilisateur, Depends(require_students_read())]
StudentsWriter = Annotated[Utilisateur, Depends(require_students_write())]


def _stream_pdf(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        iter([data]),
        media_type=PDF_MEDIA,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _service(db: DbSession, user: Utilisateur, request: Request) -> EleveService:
    return EleveService(
        db=db,
        tenant_id=user.tenant_id,
        utilisateur_id=user.id,
        ip_address=_client_ip(request),
    )


@router.post(
    "/inscrire",
    response_model=EleveInscrireResponse,
    status_code=status.HTTP_201_CREATED,
)
def inscrire_eleve(
    body: EleveInscrireCreate,
    request: Request,
    db: DbSession,
    user: StudentsWriter,
) -> EleveInscrireResponse:
    return _service(db, user, request).inscrire_eleve(body)


@router.get("/", response_model=list[EleveListResponse])
def rechercher_eleves(
    request: Request,
    db: DbSession,
    user: StudentsReader,
    query: str | None = Query(default=None, min_length=1),
    classe_id: uuid.UUID | None = Query(default=None),
    annee_id: uuid.UUID | None = Query(default=None),
) -> list[EleveListResponse]:
    return _service(db, user, request).rechercher(query, classe_id, annee_id)


@router.get(
    "/classes/{classe_id}/absences",
    response_model=ClasseAbsencesResponse,
)
def get_absences_classe(
    classe_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: StudentsReader,
    periode_id: uuid.UUID | None = Query(default=None),
) -> ClasseAbsencesResponse:
    return _service(db, user, request).get_absences_classe(classe_id, periode_id)


@router.put(
    "/absences/{absence_id}/justifier",
    response_model=AbsenceResponse,
)
def justifier_absence(
    absence_id: uuid.UUID,
    body: AbsenceJustifierRequest,
    request: Request,
    db: DbSession,
    user: StudentsWriter,
) -> AbsenceResponse:
    return _service(db, user, request).justifier_absence(absence_id, body.motif)


@router.get("/{eleve_id}", response_model=EleveResponse)
def get_eleve(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: StudentsReader,
) -> EleveResponse:
    return _service(db, user, request).get_eleve(eleve_id)


@router.put("/{eleve_id}", response_model=EleveResponse)
def update_eleve(
    eleve_id: uuid.UUID,
    body: EleveUpdate,
    request: Request,
    db: DbSession,
    user: StudentsWriter,
) -> EleveResponse:
    return _service(db, user, request).update_eleve(eleve_id, body)


@router.post("/{eleve_id}/archiver", response_model=EleveResponse)
def archiver_eleve(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: StudentsWriter,
) -> EleveResponse:
    return _service(db, user, request).archiver_eleve(eleve_id)


@router.delete("/{eleve_id}", status_code=status.HTTP_204_NO_CONTENT)
def supprimer_eleve(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: StudentsWriter,
) -> None:
    _service(db, user, request).supprimer_eleve(eleve_id)


@router.post(
    "/{eleve_id}/transferer",
    response_model=InscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
def transferer_eleve(
    eleve_id: uuid.UUID,
    body: TransfertRequest,
    request: Request,
    db: DbSession,
    user: StudentsWriter,
) -> InscriptionResponse:
    return _service(db, user, request).transferer(eleve_id, body)


@router.get("/{eleve_id}/dossier", response_model=DossierEleveResponse)
def get_dossier_eleve(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: StudentsReader,
) -> DossierEleveResponse:
    return _service(db, user, request).get_dossier_complet(eleve_id)


@router.post(
    "/{eleve_id}/absences",
    response_model=AbsenceResponse,
    status_code=status.HTTP_201_CREATED,
)
def enregistrer_absence(
    eleve_id: uuid.UUID,
    body: AbsenceCreate,
    request: Request,
    db: DbSession,
    user: StudentsWriter,
) -> AbsenceResponse:
    return _service(db, user, request).enregistrer_absence(
        eleve_id, body, user.id
    )


@router.get("/{eleve_id}/carte-scolaire")
def get_carte_scolaire(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: StudentsReader,
) -> StreamingResponse:
    data = _service(db, user, request).generer_carte_scolaire(eleve_id)
    return _stream_pdf(data, f"carte-scolaire-{eleve_id}.pdf")


@router.get("/{eleve_id}/attestation")
def get_attestation(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: StudentsReader,
) -> StreamingResponse:
    data = _service(db, user, request).generer_attestation(eleve_id)
    return _stream_pdf(data, f"attestation-{eleve_id}.pdf")


@router.get("/{eleve_id}/certificat")
def get_certificat(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: StudentsReader,
) -> StreamingResponse:
    data = _service(db, user, request).generer_certificat(eleve_id)
    return _stream_pdf(data, f"certificat-{eleve_id}.pdf")


@router.get("/{eleve_id}/absences", response_model=list[AbsenceResponse])
def get_absences_eleve(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: StudentsReader,
    periode_id: uuid.UUID | None = Query(default=None),
) -> list[AbsenceResponse]:
    return _service(db, user, request).get_absences_eleve(eleve_id, periode_id)
