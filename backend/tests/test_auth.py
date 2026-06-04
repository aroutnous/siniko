"""Tests de sécurité — module M1 Authentification."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from jose import jwt

from app.core.config import settings
from app.core.security import hash_token
from app.models.auth import Session as UserSession
from app.models.enums import StatutTenant
from app.models.tenant import Tenant
from tests.conftest import TEST_EMAIL, TEST_PASSWORD, TEST_SLUG


@pytest.mark.asyncio
async def test_login_success(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, object],
    unique_ip_headers: dict[str, str],
) -> None:
    response = await async_client.post(
        "/auth/login",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "tenant_slug": TEST_SLUG,
        },
        headers=unique_ip_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "directeur"
    assert data["tenant_slug"] == TEST_SLUG
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, object],
    unique_ip_headers: dict[str, str],
) -> None:
    response = await async_client.post(
        "/auth/login",
        json={
            "email": TEST_EMAIL,
            "password": "MauvaisMotDePasse1!",
            "tenant_slug": TEST_SLUG,
        },
        headers=unique_ip_headers,
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Identifiants invalides"


@pytest.mark.asyncio
async def test_login_inactive_tenant(
    async_client: AsyncClient,
    suspended_tenant: Tenant,
) -> None:
    response = await async_client.post(
        "/auth/login",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "tenant_slug": "ecole-suspendue",
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Tenant suspendu"


@pytest.mark.asyncio
async def test_login_unknown_tenant(
    async_client: AsyncClient,
    unique_ip_headers: dict[str, str],
) -> None:
    response = await async_client.post(
        "/auth/login",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "tenant_slug": "tenant-inexistant",
        },
        headers=unique_ip_headers,
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Identifiants invalides"


@pytest.mark.asyncio
async def test_bruteforce_protection(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, object],
) -> None:
    headers = {"X-Forwarded-For": "203.0.113.50"}
    for _ in range(5):
        response = await async_client.post(
            "/auth/login",
            json={
                "email": TEST_EMAIL,
                "password": "wrong-password-99",
                "tenant_slug": TEST_SLUG,
            },
            headers=headers,
        )
        assert response.status_code == 401

    blocked = await async_client.post(
        "/auth/login",
        json={
            "email": TEST_EMAIL,
            "password": "wrong-password-99",
            "tenant_slug": TEST_SLUG,
        },
        headers=headers,
    )
    assert blocked.status_code == 429


@pytest.mark.asyncio
async def test_reset_password_always_200(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, object],
) -> None:
    known = await async_client.post(
        "/auth/reset-password/request",
        json={"email": TEST_EMAIL, "tenant_slug": TEST_SLUG},
    )
    unknown = await async_client.post(
        "/auth/reset-password/request",
        json={"email": "inconnu@example.ml", "tenant_slug": TEST_SLUG},
    )
    assert known.status_code == 200
    assert unknown.status_code == 200
    assert known.json()["message"] == unknown.json()["message"]


@pytest.mark.asyncio
async def test_jwt_expiry(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, object],
    db_session,
    unique_ip_headers: dict[str, str],
) -> None:
    login = await async_client.post(
        "/auth/login",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "tenant_slug": TEST_SLUG,
        },
        headers=unique_ip_headers,
    )
    token = login.json()["access_token"]

    expired_token = jwt.encode(
        {
            "sub": str(seed_auth_data[1].id),
            "tenant_id": str(seed_auth_data[0].id),
            "role": "directeur",
            "exp": int((datetime.now(UTC) - timedelta(hours=1)).timestamp()),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    expired_response = await async_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert expired_response.status_code == 401

    # Token valide mais session supprimée manuellement
    db_session.query(UserSession).filter(
        UserSession.token_hash == hash_token(token)
    ).delete()
    db_session.commit()

    no_session = await async_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert no_session.status_code == 401


@pytest.mark.asyncio
async def test_logout_invalidates_session(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, object],
    unique_ip_headers: dict[str, str],
) -> None:
    login = await async_client.post(
        "/auth/login",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "tenant_slug": TEST_SLUG,
        },
        headers=unique_ip_headers,
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    logout = await async_client.post("/auth/logout", headers=headers)
    assert logout.status_code == 200

    me = await async_client.get("/auth/me", headers=headers)
    assert me.status_code == 401
