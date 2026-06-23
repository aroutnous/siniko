"""Tests module M1 — Administration plateforme (Platform Owner)."""

import uuid

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.models.auth import Utilisateur
from app.models.enums import RoleUtilisateur, StatutTenant, StatutUtilisateur
from app.models.tenant import PlanAbonnement, Tenant
from tests.conftest import TEST_PASSWORD


async def _platform_owner_headers(
    client: AsyncClient,
    db_session,
    unique_ip_headers: dict[str, str],
) -> dict[str, str]:
    tenant = Tenant(
        nom="Plateforme KALANKO",
        slug=f"kalanko-platform-{uuid.uuid4().hex[:8]}",
        statut=StatutTenant.ACTIF,
    )
    db_session.add(tenant)
    db_session.flush()

    email = f"owner-{uuid.uuid4().hex[:8]}@kalanko.ml"
    owner = Utilisateur(
        tenant_id=tenant.id,
        nom="Owner",
        prenom="Platform",
        email=email,
        mot_de_passe_hash=hash_password(TEST_PASSWORD),
        role=RoleUtilisateur.PLATFORM_OWNER,
        statut=StatutUtilisateur.ACTIF,
    )
    db_session.add(owner)
    db_session.flush()
    db_session.refresh(tenant)

    login = await client.post(
        "/auth/login",
        json={
            "email": email,
            "password": TEST_PASSWORD,
            "tenant_slug": "",
        },
        headers=unique_ip_headers,
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def platform_headers(
    async_client: AsyncClient,
    db_session,
    unique_ip_headers: dict[str, str],
) -> dict[str, str]:
    return await _platform_owner_headers(async_client, db_session, unique_ip_headers)


@pytest.fixture
def plan_abonnement(db_session) -> PlanAbonnement:
    plan = PlanAbonnement(
        nom="Standard",
        prix_mensuel="25000.00",
        limite_eleves=500,
        limite_utilisateurs=20,
        modules_inclus={"m1": True, "m2": True},
        est_actif=True,
    )
    db_session.add(plan)
    db_session.flush()
    db_session.refresh(plan)
    return plan


@pytest.mark.asyncio
async def test_creer_tenant(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
    plan_abonnement: PlanAbonnement,
) -> None:
    response = await async_client.post(
        "/platform/tenants",
        json={
            "nom": "École Nouvelle",
            "email": "contact@ecole-nouvelle.ml",
            "plan_id": str(plan_abonnement.id),
            "promoteur_email": "promoteur@ecole-nouvelle.ml",
            "promoteur_nom": "Traoré",
            "promoteur_prenom": "Moussa",
        },
        headers=platform_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["tenant"]["nom"] == "École Nouvelle"
    assert data["tenant"]["statut"] == "actif"
    assert data["tenant"]["slug"].startswith("ecole-nouvelle")
    assert data["promoteur_email"] == "promoteur@ecole-nouvelle.ml"
    assert len(data["mot_de_passe_temporaire"]) >= 8


@pytest.mark.asyncio
async def test_suspendre_tenant(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
    plan_abonnement: PlanAbonnement,
) -> None:
    create = await async_client.post(
        "/platform/tenants",
        json={
            "nom": "École Suspend",
            "email": "s@ecole.ml",
            "plan_id": str(plan_abonnement.id),
            "promoteur_email": "p@ecole.ml",
            "promoteur_nom": "A",
            "promoteur_prenom": "B",
        },
        headers=platform_headers,
    )
    tenant_id = create.json()["tenant"]["id"]

    response = await async_client.put(
        f"/platform/tenants/{tenant_id}/suspendre",
        headers=platform_headers,
    )
    assert response.status_code == 200
    assert response.json()["statut"] == "suspendu"


@pytest.mark.asyncio
async def test_activer_tenant(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
    plan_abonnement: PlanAbonnement,
) -> None:
    create = await async_client.post(
        "/platform/tenants",
        json={
            "nom": "École Reactiver",
            "email": "r@ecole.ml",
            "plan_id": str(plan_abonnement.id),
            "promoteur_email": "p2@ecole.ml",
            "promoteur_nom": "C",
            "promoteur_prenom": "D",
        },
        headers=platform_headers,
    )
    tenant_id = create.json()["tenant"]["id"]
    await async_client.put(
        f"/platform/tenants/{tenant_id}/suspendre",
        headers=platform_headers,
    )

    response = await async_client.put(
        f"/platform/tenants/{tenant_id}/activer",
        headers=platform_headers,
    )
    assert response.status_code == 200
    assert response.json()["statut"] == "actif"


@pytest.mark.asyncio
async def test_stats_plateforme(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
) -> None:
    response = await async_client.get("/platform/stats", headers=platform_headers)
    assert response.status_code == 200
    data = response.json()
    assert "nb_tenants" in data
    assert "nb_eleves_total" in data
    assert "nb_utilisateurs_total" in data
    assert "revenus_mois" in data
    assert data["nb_tenants"] >= 1


@pytest.mark.asyncio
async def test_creer_plan(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
) -> None:
    response = await async_client.post(
        "/platform/plans",
        json={
            "nom": "Premium",
            "prix_mensuel": "50000",
            "max_eleves": 1000,
            "max_utilisateurs": 50,
            "fonctionnalites": {"reporting": True},
        },
        headers=platform_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["nom"] == "Premium"
    assert float(data["prix_mensuel"]) == 50000.0
    assert data["fonctionnalites"]["reporting"] is True


@pytest.mark.asyncio
async def test_get_audit_logs_global(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
    plan_abonnement: PlanAbonnement,
) -> None:
    await async_client.post(
        "/platform/tenants",
        json={
            "nom": "École Audit",
            "email": "audit@ecole.ml",
            "plan_id": str(plan_abonnement.id),
            "promoteur_email": "pa@ecole.ml",
            "promoteur_nom": "E",
            "promoteur_prenom": "F",
        },
        headers=platform_headers,
    )

    response = await async_client.get(
        "/platform/audit-logs",
        params={"action": "platform.tenant.create"},
        headers=platform_headers,
    )
    assert response.status_code == 200
    logs = response.json()
    assert len(logs) >= 1
    assert any(log["action"] == "platform.tenant.create" for log in logs)


@pytest.mark.asyncio
async def test_creer_utilisateur_tenant(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
    plan_abonnement: PlanAbonnement,
) -> None:
    create = await async_client.post(
        "/platform/tenants",
        json={
            "nom": "École Users",
            "email": "users@ecole.ml",
            "plan_id": str(plan_abonnement.id),
            "promoteur_email": "prom@ecole.ml",
            "promoteur_nom": "G",
            "promoteur_prenom": "H",
        },
        headers=platform_headers,
    )
    tenant_id = create.json()["tenant"]["id"]

    response = await async_client.post(
        f"/platform/tenants/{tenant_id}/utilisateurs",
        json={
            "email": "directeur@ecole-users.ml",
            "nom": "Keita",
            "prenom": "Awa",
            "role": "directeur",
        },
        headers=platform_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "directeur@ecole-users.ml"
    assert data["role"] == "directeur"
    assert data["mot_de_passe_temporaire"] is not None


@pytest.mark.asyncio
async def test_modifier_tenant(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
    plan_abonnement: PlanAbonnement,
) -> None:
    create = await async_client.post(
        "/platform/tenants",
        json={
            "nom": "École Edit",
            "email": "edit@ecole.ml",
            "plan_id": str(plan_abonnement.id),
            "promoteur_email": "pe@ecole.ml",
            "promoteur_nom": "Edit",
            "promoteur_prenom": "Test",
        },
        headers=platform_headers,
    )
    tenant_id = create.json()["tenant"]["id"]

    response = await async_client.put(
        f"/platform/tenants/{tenant_id}",
        json={
            "nom": "École Modifiée",
            "email_contact": "nouveau@ecole.ml",
            "slug": "ecole-modifiee-test",
        },
        headers=platform_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["nom"] == "École Modifiée"
    assert data["email"] == "nouveau@ecole.ml"
    assert data["slug"] == "ecole-modifiee-test"


@pytest.mark.asyncio
async def test_supprimer_tenant_avec_abonnement_actif(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
    plan_abonnement: PlanAbonnement,
) -> None:
    create = await async_client.post(
        "/platform/tenants",
        json={
            "nom": "École Delete Force",
            "email": "del@ecole.ml",
            "plan_id": str(plan_abonnement.id),
            "promoteur_email": "pd@ecole.ml",
            "promoteur_nom": "Del",
            "promoteur_prenom": "Block",
        },
        headers=platform_headers,
    )
    tenant_id = create.json()["tenant"]["id"]

    response = await async_client.delete(
        f"/platform/tenants/{tenant_id}",
        headers=platform_headers,
    )
    assert response.status_code == 204

    liste = await async_client.get("/platform/tenants", headers=platform_headers)
    ids = [t["id"] for t in liste.json()]
    assert tenant_id not in ids


@pytest.mark.asyncio
async def test_modifier_plan(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
    plan_abonnement: PlanAbonnement,
) -> None:
    response = await async_client.put(
        f"/platform/plans/{plan_abonnement.id}",
        json={
            "nom": "Standard Plus",
            "prix_mensuel": "30000",
            "max_eleves": 600,
        },
        headers=platform_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["nom"] == "Standard Plus"
    assert float(data["prix_mensuel"]) == 30000.0
    assert data["max_eleves"] == 600


@pytest.mark.asyncio
async def test_supprimer_plan(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
) -> None:
    create = await async_client.post(
        "/platform/plans",
        json={
            "nom": "Plan à supprimer",
            "prix_mensuel": "10000",
            "max_eleves": 50,
        },
        headers=platform_headers,
    )
    plan_id = create.json()["id"]

    response = await async_client.delete(
        f"/platform/plans/{plan_id}",
        headers=platform_headers,
    )
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_reset_password_utilisateur_tenant(
    async_client: AsyncClient,
    platform_headers: dict[str, str],
    plan_abonnement: PlanAbonnement,
) -> None:
    create = await async_client.post(
        "/platform/tenants",
        json={
            "nom": "École Reset",
            "email": "reset@ecole.ml",
            "plan_id": str(plan_abonnement.id),
            "promoteur_email": "pr@ecole.ml",
            "promoteur_nom": "Reset",
            "promoteur_prenom": "Pwd",
        },
        headers=platform_headers,
    )
    tenant_id = create.json()["tenant"]["id"]

    user_create = await async_client.post(
        f"/platform/tenants/{tenant_id}/utilisateurs",
        json={
            "email": "sec@ecole-reset.ml",
            "nom": "Sec",
            "prenom": "Test",
            "role": "secretaire",
        },
        headers=platform_headers,
    )
    user_id = user_create.json()["id"]

    response = await async_client.post(
        f"/platform/tenants/{tenant_id}/utilisateurs/{user_id}/reset-password",
        headers=platform_headers,
    )
    assert response.status_code == 200
    assert len(response.json()["mot_de_passe_temporaire"]) >= 8


@pytest.mark.asyncio
async def test_acces_refuse_non_platform_owner(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    response = await async_client.get("/platform/stats", headers=auth_headers)
    assert response.status_code == 403
