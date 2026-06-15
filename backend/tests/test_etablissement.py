"""Tests module M2 — Gestion établissement."""

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.models.auth import Utilisateur
from app.models.enums import RoleUtilisateur, StatutTenant, StatutUtilisateur
from app.models.etablissement import Cycle
from app.models.tenant import Tenant
from tests.conftest import TEST_PASSWORD
from tests.permission_helpers import grant_role_permissions


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
async def test_create_classe_dans_cycle(
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
        "/classes",
        json={
            "cycle_id": cycle_id,
            "nom": "Grande section",
            "ordre": 1,
            "valeur_systeme_ref": "Grande Section",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["cycle_id"] == cycle_id
    assert response.json()["nom"] == "Grande section"


@pytest.mark.asyncio
async def test_create_niveau_alias(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    cycle = await async_client.post(
        "/cycles",
        json={"nom": "Fondamental", "ordre": 1},
        headers=auth_headers,
    )
    response = await async_client.post(
        "/niveaux",
        json={"cycle_id": cycle.json()["id"], "nom": "6eme Annee", "ordre": 1},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["nom"] == "6eme Annee"


@pytest.mark.asyncio
async def test_create_salle(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    cycle = await async_client.post(
        "/cycles", json={"nom": "Fondamental", "ordre": 1}, headers=auth_headers
    )
    classe = await async_client.post(
        "/classes",
        json={"cycle_id": cycle.json()["id"], "nom": "6eme Annee", "ordre": 1},
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
        "/salles",
        json={
            "classe_id": classe.json()["id"],
            "annee_scolaire_id": annee.json()["id"],
            "nom_salle": "6ème A",
            "capacite": 40,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["nom_salle"] == "6ème A"
    assert response.json()["capacite"] == 40


@pytest.mark.asyncio
async def test_get_annee_active_absente(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    """Sans année active configurée : 200 + null (pas de 404)."""
    response = await async_client.get("/annees-scolaires/active", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() is None


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
    annee1_data = next(a for a in liste.json() if a["id"] == annee1.json()["id"])
    assert annee1_data["est_active"] is False


@pytest.mark.asyncio
async def test_structure_complete(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    cycle = await async_client.post(
        "/cycles", json={"nom": "Fondamental", "ordre": 1}, headers=auth_headers
    )
    classe = await async_client.post(
        "/classes",
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
        "/salles",
        json={
            "classe_id": classe.json()["id"],
            "annee_scolaire_id": annee.json()["id"],
            "nom_salle": "CM2 A",
        },
        headers=auth_headers,
    )
    await async_client.post(
        "/matieres",
        json={"classe_id": classe.json()["id"], "nom": "Mathématiques", "coefficient": "2"},
        headers=auth_headers,
    )

    structure = await async_client.get("/etablissement/structure", headers=auth_headers)
    assert structure.status_code == 200
    data = structure.json()
    assert len(data["cycles"]) == 1
    assert data["cycles"][0]["nom"] == "Fondamental"
    assert len(data["cycles"][0]["classes"]) == 1
    assert len(data["cycles"][0]["classes"][0]["salles"]) == 1
    assert len(data["cycles"][0]["classes"][0]["matieres"]) == 1
    assert data["annee_active"]["libelle"] == "2025-2026"


@pytest.mark.asyncio
async def test_get_cycles_valeurs_systeme(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    response = await async_client.get("/valeurs/cycles", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3
    assert any(row["valeur"] == "1er Cycle" for row in data)


@pytest.mark.asyncio
async def test_get_classes_par_cycle_valeurs_systeme(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    response = await async_client.get(
        "/valeurs/classes",
        params={"cycle": "1er Cycle"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert all(row["metadata_json"].get("cycle") == "1er Cycle" for row in data)


@pytest.mark.asyncio
async def test_wizard_etablissement_complet(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    payload = {
        "annee_scolaire": "2025-2026",
        "periodes": [
            {
                "periode": "Trimestre 1",
                "date_debut": "2025-09-01",
                "date_fin": "2025-12-20",
            },
            {
                "periode": "Trimestre 2",
                "date_debut": "2026-01-05",
                "date_fin": "2026-03-31",
            },
        ],
        "cycles_selectionnes": ["1er Cycle"],
        "classes_selectionnees": [
            {"classe": "1ere Annee", "cycle": "1er Cycle"},
            {"classe": "2eme Annee", "cycle": "1er Cycle"},
        ],
        "salles": [
            {"classe": "1ere Annee", "nom_salle": "1A", "capacite": 35},
            {"classe": "2eme Annee", "nom_salle": "2A", "capacite": 40},
        ],
        "matieres": [
            {"classe": "1ere Annee", "nom": "Français", "coefficient": "2"},
            {"classe": "1ere Annee", "nom": "Mathématiques", "coefficient": "3"},
        ],
    }
    response = await async_client.post("/wizard", json=payload, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["periodes_creees"] == 2
    assert data["classes_creees"] == 2
    assert data["salles_creees"] == 2
    assert data["matieres_creees"] == 2

    structure = await async_client.get("/etablissement/structure", headers=auth_headers)
    assert structure.status_code == 200
    tree = structure.json()
    assert tree["annee_active"]["libelle"] == "2025-2026"


@pytest.mark.asyncio
async def test_isolation_tenant(
    async_client: AsyncClient,
    db_session,
    unique_ip_headers: dict[str, str],
) -> None:
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
    db_session.flush()
    grant_role_permissions(db_session, user_a)

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
