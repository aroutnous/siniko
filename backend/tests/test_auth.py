"""Tests de sécurité — module M1 Authentification."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from jose import jwt

from app.core.config import settings
from app.core.security import hash_token
from app.models.auth import Session as UserSession, Utilisateur
from app.models.tenant import Tenant
from tests.conftest import TEST_PASSWORD


@pytest.mark.asyncio
async def test_login_success(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, Utilisateur],
    unique_ip_headers: dict[str, str],
) -> None:
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
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "directeur"
    assert data["tenant_slug"] == tenant.slug
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, Utilisateur],
    unique_ip_headers: dict[str, str],
) -> None:
    tenant, user = seed_auth_data
    response = await async_client.post(
        "/auth/login",
        json={
            "email": user.email,
            "password": "MauvaisMotDePasse1!",
            "tenant_slug": tenant.slug,
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
            "email": "anyone@example.ml",
            "password": TEST_PASSWORD,
            "tenant_slug": suspended_tenant.slug,
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
            "email": "anyone@example.ml",
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
    seed_auth_data: tuple[Tenant, Utilisateur],
) -> None:
    tenant, user = seed_auth_data
    headers = {"X-Forwarded-For": "203.0.113.50"}
    for _ in range(5):
        response = await async_client.post(
            "/auth/login",
            json={
                "email": user.email,
                "password": "wrong-password-99",
                "tenant_slug": tenant.slug,
            },
            headers=headers,
        )
        assert response.status_code == 401

    blocked = await async_client.post(
        "/auth/login",
        json={
            "email": user.email,
            "password": "wrong-password-99",
            "tenant_slug": tenant.slug,
        },
        headers=headers,
    )
    assert blocked.status_code == 429


@pytest.mark.asyncio
async def test_reset_password_always_200(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, Utilisateur],
) -> None:
    tenant, user = seed_auth_data
    known = await async_client.post(
        "/auth/reset-password/request",
        json={"email": user.email, "tenant_slug": tenant.slug},
    )
    unknown = await async_client.post(
        "/auth/reset-password/request",
        json={"email": "inconnu@example.ml", "tenant_slug": tenant.slug},
    )
    assert known.status_code == 200
    assert unknown.status_code == 200
    assert known.json()["message"] == unknown.json()["message"]


@pytest.mark.asyncio
async def test_jwt_expiry(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, Utilisateur],
    db_session,
    unique_ip_headers: dict[str, str],
) -> None:
    tenant, user = seed_auth_data
    login = await async_client.post(
        "/auth/login",
        json={
            "email": user.email,
            "password": TEST_PASSWORD,
            "tenant_slug": tenant.slug,
        },
        headers=unique_ip_headers,
    )
    token = login.json()["access_token"]

    expired_token = jwt.encode(
        {
            "sub": str(user.id),
            "tenant_id": str(tenant.id),
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

    db_session.query(UserSession).filter(
        UserSession.token_hash == hash_token(token)
    ).delete()
    db_session.flush()

    no_session = await async_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert no_session.status_code == 401


@pytest.mark.asyncio
async def test_logout_invalidates_session(
    async_client: AsyncClient,
    seed_auth_data: tuple[Tenant, Utilisateur],
    unique_ip_headers: dict[str, str],
) -> None:
    tenant, user = seed_auth_data
    login = await async_client.post(
        "/auth/login",
        json={
            "email": user.email,
            "password": TEST_PASSWORD,
            "tenant_slug": tenant.slug,
        },
        headers=unique_ip_headers,
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    logout = await async_client.post("/auth/logout", headers=headers)
    assert logout.status_code == 200

    me = await async_client.get("/auth/me", headers=headers)
    assert me.status_code == 401
