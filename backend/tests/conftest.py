"""Fixtures pytest — base de données, client HTTP, rate limit mémoire."""

import os
import uuid
from collections.abc import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from fastapi import Request
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Variables de test forcées avant import app (ignore backend/.env)
os.environ["SINIKO_TESTING"] = "1"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://siniko_user:siniko_dev_password@localhost:5432/siniko",
)
os.environ["REDIS_URL"] = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379")
os.environ["JWT_SECRET"] = "test-jwt-secret-change-me-in-production-32"
os.environ["JWT_EXPIRE_MINUTES"] = "15"
os.environ["ENVIRONMENT"] = "development"
os.environ["DEBUG"] = "true"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"
os.environ["MOBILE_MONEY_WEBHOOK_SECRET"] = "test-webhook-secret"

from app.core.config import get_settings, settings  # noqa: E402

get_settings.cache_clear()
from app.core.database import get_db, set_tenant_context  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models.auth import Utilisateur  # noqa: E402
from app.models.enums import RoleUtilisateur, StatutTenant, StatutUtilisateur  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.routers.auth import limiter  # noqa: E402

TEST_PASSWORD = "Password123!"
TEST_SLUG = "ecole-test"
TEST_EMAIL = "directeur@ecole-test.ml"  # défaut ; seed_auth_data utilise un email unique

_ip_counter = 0


@pytest.fixture
def unique_ip_headers() -> dict[str, str]:
    """IP distincte par test pour isoler le rate limiting login."""
    global _ip_counter
    _ip_counter += 1
    return {"X-Forwarded-For": f"198.51.100.{_ip_counter % 250 + 1}"}


@pytest.fixture(scope="session")
def engine():
    return create_engine(settings.database_url, pool_pre_ping=True)


@pytest.fixture
def db_session(engine) -> Generator[Session, None, None]:
    connection = engine.connect()
    transaction = connection.begin()
    session = sessionmaker(bind=connection, autocommit=False, autoflush=False)()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def seed_auth_data(db_session: Session) -> tuple[Tenant, Utilisateur]:
    """Tenant actif + utilisateur directeur pour les tests auth."""
    tenant = Tenant(
        nom="École Test",
        slug=f"ecole-test-{uuid.uuid4().hex[:8]}",
        statut=StatutTenant.ACTIF,
    )
    db_session.add(tenant)
    db_session.flush()

    email = f"directeur-{uuid.uuid4().hex[:8]}@ecole-test.ml"
    user = Utilisateur(
        tenant_id=tenant.id,
        nom="Diallo",
        prenom="Amadou",
        email=email,
        mot_de_passe_hash=hash_password(TEST_PASSWORD),
        role=RoleUtilisateur.DIRECTEUR,
        statut=StatutUtilisateur.ACTIF,
    )
    db_session.add(user)
    db_session.flush()
    db_session.refresh(tenant)
    db_session.refresh(user)
    return tenant, user


@pytest.fixture
def suspended_tenant(db_session: Session) -> Tenant:
    tenant = Tenant(
        nom="École Suspendue",
        slug=f"ecole-suspendue-{uuid.uuid4().hex[:8]}",
        statut=StatutTenant.SUSPENDU,
    )
    db_session.add(tenant)
    db_session.flush()
    db_session.refresh(tenant)
    return tenant


@pytest.fixture(autouse=True)
def override_db(db_session: Session) -> Generator[None, None, None]:
    """Injecte la session de test dans FastAPI."""

    def _override_get_db(request: Request) -> Generator[Session, None, None]:
        tenant_id = getattr(request.state, "tenant_id", None)
        if tenant_id is not None:
            set_tenant_context(db_session, tenant_id)
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> Generator[None, None, None]:
    """Réinitialise le rate limiter entre chaque test (évite les fuites 429)."""
    from limits.storage import MemoryStorage

    previous_uri = limiter.storage_uri
    limiter.storage_uri = "memory://"
    limiter._storage = MemoryStorage()
    yield
    limiter.storage_uri = previous_uri


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest_asyncio.fixture
async def auth_headers(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, Utilisateur],
    unique_ip_headers: dict[str, str],
) -> dict[str, str]:
    """JWT + session valide pour les tests authentifiés."""
    tenant, user = seed_auth_data
    response = await async_client.post(
        "/auth/login",
        json={
            "email": user.email,
            "password": TEST_PASSWORD,
            "tenant_slug": tenant.slug,
        },
        headers=unique_ip_headers,
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
