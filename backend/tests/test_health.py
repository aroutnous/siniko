"""Tests du endpoint de santé."""

import os

import pytest
from httpx import ASGITransport, AsyncClient

# Variables minimales pour les tests (jamais de secrets réels en prod)
os.environ.setdefault("APP_SECRET_KEY", "test-secret-key-min-32-characters-long")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-min-32-chars-long")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://siniko:siniko@localhost:5432/siniko_test",
)

from app.main import app  # noqa: E402


@pytest.mark.asyncio
async def test_health_returns_ok() -> None:
    """Vérifie que /health répond 200 avec le statut attendu."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "siniko-api"}


@pytest.mark.asyncio
async def test_root_returns_message() -> None:
    """Vérifie que la racine expose les métadonnées API."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")

    assert response.status_code == 200
    assert response.json()["message"] == "SINIKO API"
