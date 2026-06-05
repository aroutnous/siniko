"""Tests module M2 — Gestion établissement."""

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.models.auth import Utilisateur
from app.models.enums import RoleUtilisateur, StatutTenant, StatutUtilisateur
from app.models.etablissement import Cycle
from app.models.tenant import Tenant
from tests.conftest import TEST_PASSWORD


@pytest.mark.asyncio
async def test_create_cycle(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    response = await async_client.post(
        "/cycles",
        json={"nom": "Fondamental", "description": "Cycle fondamental", "ordre": 1},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["nom"] == "Fondamental"
    assert data["ordre"] == 1


@pytest.mark.asyncio
async def test_create_niveau_dans_cycle(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    cycle = await async_client.post(
        "/cycles",
        json={"nom": "Préscolaire", "ordre": 0},
        headers=auth_headers,
    )
    cycle_id = cycle.json()["id"]

    response = await async_client.post(
        "/niveaux",
        json={"cycle_id": cycle_id, "nom": "Grande section", "ordre": 1},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["cycle_id"] == cycle_id
    assert response.json()["nom"] == "Grande section"


@pytest.mark.asyncio
async def test_create_classe(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    cycle = await async_client.post(
        "/cycles", json={"nom": "Fondamental", "ordre": 1}, headers=auth_headers
    )
    niveau = await async_client.post(
        "/niveaux",
        json={"cycle_id": cycle.json()["id"], "nom": "6ème", "ordre": 1},
        headers=auth_headers,
    )
    annee = await async_client.post(
        "/annees-scolaires",
        json={
            "libelle": "2025-2026",
            "date_debut": "2025-09-01",
            "date_fin": "2026-06-30",
            "est_active": True,
        },
        headers=auth_headers,
    )

    response = await async_client.post(
        "/classes",
        json={
            "niveau_id": niveau.json()["id"],
            "annee_scolaire_id": annee.json()["id"],
            "nom": "6ème A",
            "capacite_max": 40,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["nom"] == "6ème A"
    assert response.json()["capacite_max"] == 40


@pytest.mark.asyncio
async def test_activer_annee_scolaire(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    annee1 = await async_client.post(
        "/annees-scolaires",
        json={
            "libelle": "2024-2025",
            "date_debut": "2024-09-01",
            "date_fin": "2025-06-30",
            "est_active": True,
        },
        headers=auth_headers,
    )
    annee2 = await async_client.post(
        "/annees-scolaires",
        json={
            "libelle": "2025-2026",
            "date_debut": "2025-09-01",
            "date_fin": "2026-06-30",
            "est_active": False,
        },
        headers=auth_headers,
    )

    activate = await async_client.post(
        f"/annees-scolaires/{annee2.json()['id']}/activer",
        headers=auth_headers,
    )
    assert activate.status_code == 200
    assert activate.json()["est_active"] is True

    active = await async_client.get("/annees-scolaires/active", headers=auth_headers)
    assert active.status_code == 200
    assert active.json()["id"] == annee2.json()["id"]

    liste = await async_client.get("/annees-scolaires", headers=auth_headers)
    annee1_data = next(
        a for a in liste.json() if a["id"] == annee1.json()["id"]
    )
    assert annee1_data["est_active"] is False


@pytest.mark.asyncio
async def test_structure_complete(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    cycle = await async_client.post(
        "/cycles", json={"nom": "Fondamental", "ordre": 1}, headers=auth_headers
    )
    niveau = await async_client.post(
        "/niveaux",
        json={"cycle_id": cycle.json()["id"], "nom": "CM2", "ordre": 5},
        headers=auth_headers,
    )
    annee = await async_client.post(
        "/annees-scolaires",
        json={
            "libelle": "2025-2026",
            "date_debut": "2025-09-01",
            "date_fin": "2026-06-30",
            "est_active": True,
        },
        headers=auth_headers,
    )
    await async_client.post(
        "/classes",
        json={
            "niveau_id": niveau.json()["id"],
            "annee_scolaire_id": annee.json()["id"],
            "nom": "CM2 A",
        },
        headers=auth_headers,
    )
    await async_client.post(
        "/matieres",
        json={"niveau_id": niveau.json()["id"], "nom": "Mathématiques", "coefficient": "2"},
        headers=auth_headers,
    )

    structure = await async_client.get("/etablissement/structure", headers=auth_headers)
    assert structure.status_code == 200
    data = structure.json()
    assert len(data["cycles"]) == 1
    assert data["cycles"][0]["nom"] == "Fondamental"
    assert len(data["cycles"][0]["niveaux"]) == 1
    assert len(data["cycles"][0]["niveaux"][0]["classes"]) == 1
    assert len(data["cycles"][0]["niveaux"][0]["matieres"]) == 1
    assert data["annee_active"]["libelle"] == "2025-2026"


@pytest.mark.asyncio
async def test_isolation_tenant(
    async_client: AsyncClient,
    db_session,
    unique_ip_headers: dict[str, str],
) -> None:
    """Un tenant ne doit pas accéder aux données d'un autre tenant."""
    tenant_a = Tenant(nom="École A", slug="ecole-a", statut=StatutTenant.ACTIF)
    tenant_b = Tenant(nom="École B", slug="ecole-b", statut=StatutTenant.ACTIF)
    db_session.add_all([tenant_a, tenant_b])
    db_session.flush()

    user_a = Utilisateur(
        tenant_id=tenant_a.id,
        nom="User",
        prenom="A",
        email="user-a@test.ml",
        mot_de_passe_hash=hash_password(TEST_PASSWORD),
        role=RoleUtilisateur.DIRECTEUR,
        statut=StatutUtilisateur.ACTIF,
    )
    db_session.add(user_a)

    cycle_b = Cycle(tenant_id=tenant_b.id, nom="Cycle B", ordre=1)
    db_session.add(cycle_b)
    db_session.flush()
    db_session.refresh(user_a)
    db_session.refresh(cycle_b)

    login = await async_client.post(
        "/auth/login",
        json={
            "email": "user-a@test.ml",
            "password": TEST_PASSWORD,
            "tenant_slug": "ecole-a",
        },
        headers=unique_ip_headers,
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = await async_client.get(f"/cycles/{cycle_b.id}", headers=headers)
    assert response.status_code == 404

    listing = await async_client.get("/cycles", headers=headers)
    assert listing.status_code == 200
    assert all(c["nom"] != "Cycle B" for c in listing.json())
