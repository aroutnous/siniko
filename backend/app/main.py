"""Point d'entrée FastAPI SINIKO."""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Cycle de vie : initialisation au démarrage."""
    configure_logging()
    settings = get_settings()
    logger.info(
        "application_started",
        env=settings.app_env,
        service="siniko-api",
    )
    yield
    logger.info("application_stopped", service="siniko-api")


def create_app() -> FastAPI:
    """Fabrique l'application FastAPI avec middlewares sécurisés."""
    settings = get_settings()
    application = FastAPI(
        title="SINIKO API",
        description="API de gestion scolaire — stage DevSecOps",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.app_debug else "/docs",
        redoc_url="/redoc",
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @application.middleware("http")
    async def security_logging_middleware(
        request: Request,
        call_next,
    ) -> JSONResponse:
        """Journalise chaque requête (supervision brute force, erreurs)."""
        response = await call_next(request)
        log_fn = logger.warning if response.status_code >= 400 else logger.info
        log_fn(
            "http_request",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            client_host=request.client.host if request.client else None,
        )
        return response

    @application.get("/health", tags=["Système"])
    async def health() -> dict[str, str]:
        """Contrôle de santé pour Docker, ALB et smoke tests CI/CD."""
        return {"status": "ok", "service": "siniko-api"}

    @application.get("/", tags=["Système"])
    async def root() -> dict[str, str]:
        """Racine API."""
        return {"message": "SINIKO API", "docs": "/docs"}

    return application


app = create_app()
