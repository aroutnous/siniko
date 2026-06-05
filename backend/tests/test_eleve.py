"""Tests module M3 — Gestion des élèves."""

import uuid

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.models.auth import Utilisateur
from app.models.eleve import Eleve
from app.models.enums import (
    RoleUtilisateur,
    StatutEleve,
    StatutTenant,
    StatutUtilisateur,
)
from app.models.tenant import Tenant
from tests.conftest import TEST_PASSWORD


async def _create_structure(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    classe_nom: str = "6ème A",
    capacite_max: int = 40,
) -> dict[str, str]:
    """Crée cycle → niveau → année → classe et retourne les IDs."""
    cycle = await client.post(
        "/cycles",
        json={"nom": "Fondamental", "ordre": 1},
        headers=headers,
    )
    assert cycle.status_code == 201
    niveau = await client.post(
        "/niveaux",
        json={"cycle_id": cycle.json()["id"], "nom": "6ème", "ordre": 1},
        headers=headers,
    )
    assert niveau.status_code == 201
    annee = await client.post(
        "/annees-scolaires",
        json={
            "libelle": "2025-2026",
            "date_debut": "2025-09-01",
            "date_fin": "2026-06-30",
            "est_active": True,
        },
        headers=headers,
    )
    assert annee.status_code == 201
    classe = await client.post(
        "/classes",
        json={
            "niveau_id": niveau.json()["id"],
            "annee_scolaire_id": annee.json()["id"],
            "nom": classe_nom,
            "capacite_max": capacite_max,
        },
        headers=headers,
    )
    assert classe.status_code == 201
    return {
        "classe_id": classe.json()["id"],
        "annee_id": annee.json()["id"],
        "niveau_id": niveau.json()["id"],
    }


def _eleve_payload(classe_id: str, annee_id: str, **overrides) -> dict:
    payload = {
        "nom": "Traoré",
        "prenom": "Fatoumata",
        "date_naissance": "2012-03-15",
        "lieu_naissance": "Bamako",
        "sexe": "F",
        "nom_parent": "Traoré Moussa",
        "telephone_parent": "+22370123456",
        "adresse": "Hippodrome, Bamako",
        "classe_id": classe_id,
        "annee_scolaire_id": annee_id,
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_inscription_eleve_succes(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    structure = await _create_structure(async_client, auth_headers)
    response = await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(structure["classe_id"], structure["annee_id"]),
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["eleve"]["nom"] == "Traoré"
    assert data["eleve"]["prenom"] == "Fatoumata"
    assert data["eleve"]["statut"] == "actif"
    assert data["eleve"]["matricule"].startswith("ECO-")
    assert data["inscription"]["classe_id"] == structure["classe_id"]
    assert data["inscription"]["statut"] == "inscrit"


@pytest.mark.asyncio
async def test_inscription_classe_pleine(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    structure = await _create_structure(
        async_client, auth_headers, capacite_max=1
    )
    first = await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(
            structure["classe_id"],
            structure["annee_id"],
            nom="Premier",
            prenom="Élève",
        ),
        headers=auth_headers,
    )
    assert first.status_code == 201

    second = await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(
            structure["classe_id"],
            structure["annee_id"],
            nom="Deuxième",
            prenom="Élève",
        ),
        headers=auth_headers,
    )
    assert second.status_code == 409
    assert second.json()["detail"] == "Classe complète"


@pytest.mark.asyncio
async def test_matricule_unique_par_tenant(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    structure = await _create_structure(async_client, auth_headers)
    e1 = await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(
            structure["classe_id"],
            structure["annee_id"],
            nom="Alpha",
            prenom="Un",
        ),
        headers=auth_headers,
    )
    e2 = await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(
            structure["classe_id"],
            structure["annee_id"],
            nom="Beta",
            prenom="Deux",
        ),
        headers=auth_headers,
    )
    assert e1.status_code == 201
    assert e2.status_code == 201
    mat1 = e1.json()["eleve"]["matricule"]
    mat2 = e2.json()["eleve"]["matricule"]
    assert mat1 != mat2
    assert mat1.startswith("ECO-")
    assert mat2.startswith("ECO-")


@pytest.mark.asyncio
async def test_isolation_tenant_eleves(
    async_client: AsyncClient,
    db_session,
    unique_ip_headers: dict[str, str],
) -> None:
    tenant_a = Tenant(
        nom="École A",
        slug=f"ecole-a-{uuid.uuid4().hex[:8]}",
        statut=StatutTenant.ACTIF,
    )
    tenant_b = Tenant(
        nom="École B",
        slug=f"ecole-b-{uuid.uuid4().hex[:8]}",
        statut=StatutTenant.ACTIF,
    )
    db_session.add_all([tenant_a, tenant_b])
    db_session.flush()

    user_a = Utilisateur(
        tenant_id=tenant_a.id,
        nom="User",
        prenom="A",
        email=f"user-a-{uuid.uuid4().hex[:8]}@test.ml",
        mot_de_passe_hash=hash_password(TEST_PASSWORD),
        role=RoleUtilisateur.DIRECTEUR,
        statut=StatutUtilisateur.ACTIF,
    )
    db_session.add(user_a)

    eleve_b = Eleve(
        tenant_id=tenant_b.id,
        matricule="ECO-2025-0001",
        nom="Élève",
        prenom="B",
        statut=StatutEleve.ACTIF,
    )
    db_session.add(eleve_b)
    db_session.flush()
    db_session.refresh(user_a)
    db_session.refresh(eleve_b)

    login = await async_client.post(
        "/auth/login",
        json={
            "email": user_a.email,
            "password": TEST_PASSWORD,
            "tenant_slug": tenant_a.slug,
        },
        headers=unique_ip_headers,
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = await async_client.get(f"/eleves/{eleve_b.id}", headers=headers)
    assert response.status_code == 404

    listing = await async_client.get("/eleves/", headers=headers)
    assert listing.status_code == 200
    assert all(e["nom"] != "Élève" for e in listing.json())


@pytest.mark.asyncio
async def test_transfert_eleve(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    structure = await _create_structure(async_client, auth_headers, classe_nom="6ème A")
    inscrit = await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(structure["classe_id"], structure["annee_id"]),
        headers=auth_headers,
    )
    eleve_id = inscrit.json()["eleve"]["id"]

    classe_b = await async_client.post(
        "/classes",
        json={
            "niveau_id": structure["niveau_id"],
            "annee_scolaire_id": structure["annee_id"],
            "nom": "6ème B",
            "capacite_max": 40,
        },
        headers=auth_headers,
    )
    assert classe_b.status_code == 201

    transfert = await async_client.post(
        f"/eleves/{eleve_id}/transferer",
        json={"classe_id": classe_b.json()["id"]},
        headers=auth_headers,
    )
    assert transfert.status_code == 201
    assert transfert.json()["classe_id"] == classe_b.json()["id"]
    assert transfert.json()["statut"] == "inscrit"

    dossier = await async_client.get(
        f"/eleves/{eleve_id}/dossier", headers=auth_headers
    )
    inscriptions = dossier.json()["inscriptions"]
    statuts = {i["statut"] for i in inscriptions}
    assert "transfere" in statuts
    assert "inscrit" in statuts


@pytest.mark.asyncio
async def test_enregistrement_absence(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    structure = await _create_structure(async_client, auth_headers)
    inscrit = await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(structure["classe_id"], structure["annee_id"]),
        headers=auth_headers,
    )
    eleve_id = inscrit.json()["eleve"]["id"]

    response = await async_client.post(
        f"/eleves/{eleve_id}/absences",
        json={
            "classe_id": structure["classe_id"],
            "date_absence": "2025-10-10",
            "type": "absence",
            "justifiee": False,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["eleve_id"] == eleve_id
    assert data["type"] == "absence"
    assert data["justifiee"] is False


@pytest.mark.asyncio
async def test_justification_absence(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    structure = await _create_structure(async_client, auth_headers)
    inscrit = await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(structure["classe_id"], structure["annee_id"]),
        headers=auth_headers,
    )
    eleve_id = inscrit.json()["eleve"]["id"]

    absence = await async_client.post(
        f"/eleves/{eleve_id}/absences",
        json={
            "classe_id": structure["classe_id"],
            "date_absence": "2025-10-11",
            "type": "retard",
            "justifiee": False,
        },
        headers=auth_headers,
    )
    assert absence.status_code == 201
    absence_id = absence.json()["id"]

    justifier = await async_client.put(
        f"/eleves/absences/{absence_id}/justifier",
        json={"motif": "Certificat médical"},
        headers=auth_headers,
    )
    assert justifier.status_code == 200
    assert justifier.json()["justifiee"] is True
    assert justifier.json()["motif"] == "Certificat médical"


@pytest.mark.asyncio
async def test_recherche_eleve(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    structure = await _create_structure(async_client, auth_headers)
    await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(
            structure["classe_id"],
            structure["annee_id"],
            nom="Konaté",
            prenom="Ibrahim",
        ),
        headers=auth_headers,
    )

    by_nom = await async_client.get(
        "/eleves/",
        params={"query": "Konaté"},
        headers=auth_headers,
    )
    assert by_nom.status_code == 200
    assert len(by_nom.json()) == 1
    assert by_nom.json()[0]["nom"] == "Konaté"

    by_classe = await async_client.get(
        "/eleves/",
        params={"classe_id": structure["classe_id"]},
        headers=auth_headers,
    )
    assert by_classe.status_code == 200
    assert len(by_classe.json()) >= 1


@pytest.mark.asyncio
async def test_dossier_complet(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    structure = await _create_structure(async_client, auth_headers)
    inscrit = await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(structure["classe_id"], structure["annee_id"]),
        headers=auth_headers,
    )
    eleve_id = inscrit.json()["eleve"]["id"]

    await async_client.post(
        f"/eleves/{eleve_id}/absences",
        json={
            "classe_id": structure["classe_id"],
            "date_absence": "2025-11-01",
            "type": "absence",
        },
        headers=auth_headers,
    )

    dossier = await async_client.get(
        f"/eleves/{eleve_id}/dossier", headers=auth_headers
    )
    assert dossier.status_code == 200
    data = dossier.json()
    assert data["eleve"]["id"] == eleve_id
    assert len(data["inscriptions"]) == 1
    assert len(data["absences"]) == 1


@pytest.mark.asyncio
async def test_statistiques_absences(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    structure = await _create_structure(async_client, auth_headers)
    e1 = await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(
            structure["classe_id"],
            structure["annee_id"],
            nom="Un",
            prenom="Élève",
        ),
        headers=auth_headers,
    )
    e2 = await async_client.post(
        "/eleves/inscrire",
        json=_eleve_payload(
            structure["classe_id"],
            structure["annee_id"],
            nom="Deux",
            prenom="Élève",
        ),
        headers=auth_headers,
    )
    eleve1_id = e1.json()["eleve"]["id"]
    eleve2_id = e2.json()["eleve"]["id"]

    await async_client.post(
        f"/eleves/{eleve1_id}/absences",
        json={
            "classe_id": structure["classe_id"],
            "date_absence": "2025-10-01",
            "type": "absence",
            "justifiee": True,
        },
        headers=auth_headers,
    )
    await async_client.post(
        f"/eleves/{eleve2_id}/absences",
        json={
            "classe_id": structure["classe_id"],
            "date_absence": "2025-10-02",
            "type": "retard",
            "justifiee": False,
        },
        headers=auth_headers,
    )

    response = await async_client.get(
        f"/eleves/classes/{structure['classe_id']}/absences",
        headers=auth_headers,
    )
    assert response.status_code == 200
    stats = response.json()["statistiques"]
    assert stats["total"] == 2
    assert stats["absences"] == 1
    assert stats["retards"] == 1
    assert stats["justifiees"] == 1
    assert stats["non_justifiees"] == 1
    assert len(response.json()["absences"]) == 2
