"""Routes M4 — Gestion pédagogique."""

import uuid
from typing import Annotated, Callable

from fastapi import APIRouter, Depends, Query, Request, status

from app.core.database import DbSession
from app.core.security import CurrentUser
from app.models.auth import Utilisateur
from app.schemas.pedagogie import (
    BulletinGenererRequest,
    BulletinResponse,
    NoteBatchCreate,
    NoteResponse,
    ResultatsClasseResponse,
)
from app.services.pedagogie_service import PedagogieService
from app.models.enums import Permission
from app.services.permissions import user_has_any_permission, user_has_permission

router = APIRouter(prefix="/pedagogie", tags=["pedagogie"])


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def require_pedagogy_read() -> Callable[..., Utilisateur]:
    """Lecture : pedagogy.read ou pedagogy.manage."""

    async def checker(current_user: CurrentUser, db: DbSession) -> Utilisateur:
        if not user_has_any_permission(
            db,
            current_user,
            Permission.NOTES_CONSULTER.value,
            Permission.RESULTATS_CONSULTER.value,
            Permission.BULLETINS_GENERER.value,
        ):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


def require_pedagogy_notes() -> Callable[..., Utilisateur]:
    """Saisie notes : pedagogy.notes ou pedagogy.manage."""

    async def checker(current_user: CurrentUser, db: DbSession) -> Utilisateur:
        if not user_has_permission(db, current_user, Permission.NOTES_SAISIR.value):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


def require_pedagogy_generate() -> Callable[..., Utilisateur]:
    """Génération bulletins : pedagogy.generate ou pedagogy.manage."""

    async def checker(current_user: CurrentUser, db: DbSession) -> Utilisateur:
        if not user_has_permission(db, current_user, Permission.BULLETINS_GENERER.value):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


def require_pedagogy_validate() -> Callable[..., Utilisateur]:
    """Validation bulletins : bulletins.valider."""

    async def checker(current_user: CurrentUser, db: DbSession) -> Utilisateur:
        if not user_has_permission(
            db, current_user, Permission.BULLETINS_VALIDER.value
        ):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


def require_pedagogy_publish() -> Callable[..., Utilisateur]:
    """Publication bulletins : bulletins.publier."""

    async def checker(current_user: CurrentUser, db: DbSession) -> Utilisateur:
        if not user_has_permission(
            db, current_user, Permission.BULLETINS_PUBLIER.value
        ):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission insuffisante",
            )
        return current_user

    return checker


PedagogyReader = Annotated[Utilisateur, Depends(require_pedagogy_read())]
PedagogyNotes = Annotated[Utilisateur, Depends(require_pedagogy_notes())]
PedagogyGenerate = Annotated[Utilisateur, Depends(require_pedagogy_generate())]
PedagogyValidator = Annotated[Utilisateur, Depends(require_pedagogy_validate())]
PedagogyPublisher = Annotated[Utilisateur, Depends(require_pedagogy_publish())]


def _service(db: DbSession, user: Utilisateur, request: Request) -> PedagogieService:
    return PedagogieService(
        db=db,
        tenant_id=user.tenant_id,
        utilisateur_id=user.id,
        ip_address=_client_ip(request),
    )


@router.post(
    "/notes/batch",
    response_model=list[NoteResponse],
    status_code=status.HTTP_201_CREATED,
)
def saisir_notes_batch(
    body: NoteBatchCreate,
    request: Request,
    db: DbSession,
    user: PedagogyNotes,
) -> list[NoteResponse]:
    return _service(db, user, request).saisir_notes_batch(body, user.id)


@router.get("/notes/{eleve_id}", response_model=list[NoteResponse])
def get_historique_notes(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PedagogyReader,
    periode_id: uuid.UUID | None = Query(default=None),
) -> list[NoteResponse]:
    return _service(db, user, request).get_historique_notes(eleve_id, periode_id)


@router.post(
    "/bulletins/generer",
    response_model=list[BulletinResponse],
    status_code=status.HTTP_201_CREATED,
)
def generer_bulletins_classe(
    body: BulletinGenererRequest,
    request: Request,
    db: DbSession,
    user: PedagogyGenerate,
) -> list[BulletinResponse]:
    return _service(db, user, request).generer_bulletins_classe(body)


@router.get(
    "/eleves/{eleve_id}/bulletins",
    response_model=list[BulletinResponse],
)
def list_bulletins_eleve(
    eleve_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PedagogyReader,
) -> list[BulletinResponse]:
    return _service(db, user, request).list_bulletins_eleve(eleve_id)


@router.get("/bulletins/{bulletin_id}", response_model=BulletinResponse)
def get_bulletin(
    bulletin_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PedagogyReader,
) -> BulletinResponse:
    return _service(db, user, request).get_bulletin(bulletin_id)


@router.put("/bulletins/{bulletin_id}/valider", response_model=BulletinResponse)
def valider_bulletin(
    bulletin_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PedagogyValidator,
) -> BulletinResponse:
    return _service(db, user, request).valider_bulletin(bulletin_id, user.id)


@router.put("/bulletins/{bulletin_id}/publier", response_model=BulletinResponse)
def publier_bulletin(
    bulletin_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PedagogyPublisher,
) -> BulletinResponse:
    return _service(db, user, request).publier_bulletin(bulletin_id)


@router.get(
    "/classes/{classe_id}/resultats",
    response_model=ResultatsClasseResponse,
)
def get_resultats_classe(
    classe_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PedagogyReader,
    periode_id: uuid.UUID = Query(...),
) -> ResultatsClasseResponse:
    return _service(db, user, request).get_resultats_classe(classe_id, periode_id)
