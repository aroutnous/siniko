"""Tests module M5 — Comptabilité & Finance."""

import uuid
from datetime import date

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.models.auth import Utilisateur
from app.models.enums import (
    RoleUtilisateur,
    StatutPaiement,
    StatutTenant,
    StatutUtilisateur,
)
from app.models.tenant import Tenant
from app.services.finance_service import FinanceService
from tests.conftest import TEST_PASSWORD


async def _auth_headers_for_role(
    client: AsyncClient,
    db_session,
    role: RoleUtilisateur,
    unique_ip_headers: dict[str, str],
) -> dict[str, str]:
    tenant = Tenant(
        nom="École Finance",
        slug=f"ecole-fin-{uuid.uuid4().hex[:8]}",
        statut=StatutTenant.ACTIF,
    )
    db_session.add(tenant)
    db_session.flush()

    email = f"{role.value}-{uuid.uuid4().hex[:8]}@finance.ml"
    user = Utilisateur(
        tenant_id=tenant.id,
        nom="Test",
        prenom=role.value.title(),
        email=email,
        mot_de_passe_hash=hash_password(TEST_PASSWORD),
        role=role,
        statut=StatutUtilisateur.ACTIF,
    )
    db_session.add(user)
    db_session.flush()
    db_session.refresh(tenant)

    login = await client.post(
        "/auth/login",
        json={"email": email, "password": TEST_PASSWORD, "tenant_slug": tenant.slug},
        headers=unique_ip_headers,
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _create_finance_context(
    client: AsyncClient,
    setup_headers: dict[str, str],
    finance_headers: dict[str, str] | None = None,
) -> dict[str, str]:
    finance_headers = finance_headers or setup_headers
    cycle = await client.post(
        "/cycles", json={"nom": "Fondamental", "ordre": 1}, headers=setup_headers
    )
    niveau = await client.post(
        "/niveaux",
        json={"cycle_id": cycle.json()["id"], "nom": "6ème", "ordre": 1},
        headers=setup_headers,
    )
    annee = await client.post(
        "/annees-scolaires",
        json={
            "libelle": "2025-2026",
            "date_debut": "2025-09-01",
            "date_fin": "2026-06-30",
            "est_active": True,
        },
        headers=setup_headers,
    )
    classe = await client.post(
        "/classes",
        json={
            "niveau_id": niveau.json()["id"],
            "annee_scolaire_id": annee.json()["id"],
            "nom": "6ème A",
            "capacite_max": 40,
        },
        headers=setup_headers,
    )
    frais = await client.post(
        "/finance/frais",
        json={
            "niveau_id": niveau.json()["id"],
            "annee_scolaire_id": annee.json()["id"],
            "libelle": "Frais de scolarité",
            "montant": "50000",
            "est_obligatoire": True,
        },
        headers=finance_headers,
    )
    inscrit = await client.post(
        "/eleves/inscrire",
        json={
            "nom": "Diarra",
            "prenom": "Moussa",
            "classe_id": classe.json()["id"],
            "annee_scolaire_id": annee.json()["id"],
        },
        headers=setup_headers,
    )
    assert inscrit.status_code == 201
    assert frais.status_code == 201
    return {
        "niveau_id": niveau.json()["id"],
        "annee_id": annee.json()["id"],
        "classe_id": classe.json()["id"],
        "frais_id": frais.json()["id"],
        "eleve_id": inscrit.json()["eleve"]["id"],
    }


async def _headers_same_tenant(
    client: AsyncClient,
    db_session,
    tenant: Tenant,
    role: RoleUtilisateur,
    unique_ip_headers: dict[str, str],
) -> dict[str, str]:
    email = f"{role.value}-{uuid.uuid4().hex[:8]}@finance.ml"
    user = Utilisateur(
        tenant_id=tenant.id,
        nom="Test",
        prenom=role.value.title(),
        email=email,
        mot_de_passe_hash=hash_password(TEST_PASSWORD),
        role=role,
        statut=StatutUtilisateur.ACTIF,
    )
    db_session.add(user)
    db_session.flush()

    login = await client.post(
        "/auth/login",
        json={"email": email, "password": TEST_PASSWORD, "tenant_slug": tenant.slug},
        headers=unique_ip_headers,
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.fixture
async def comptable_headers(
    async_client: AsyncClient,
    db_session,
    seed_auth_data: tuple[Tenant, Utilisateur],
    unique_ip_headers: dict[str, str],
) -> dict[str, str]:
    tenant, _ = seed_auth_data
    return await _headers_same_tenant(
        async_client, db_session, tenant, RoleUtilisateur.COMPTABLE, unique_ip_headers
    )


@pytest.fixture
async def secretaire_headers(
    async_client: AsyncClient,
    db_session,
    seed_auth_data: tuple[Tenant, Utilisateur],
    unique_ip_headers: dict[str, str],
) -> dict[str, str]:
    tenant, _ = seed_auth_data
    return await _headers_same_tenant(
        async_client, db_session, tenant, RoleUtilisateur.SECRETAIRE, unique_ip_headers
    )


@pytest.mark.asyncio
async def test_enregistrement_paiement(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
    comptable_headers: dict[str, str],
    secretaire_headers: dict[str, str],
) -> None:
    ctx = await _create_finance_context(
        async_client, auth_headers, comptable_headers
    )
    response = await async_client.post(
        "/finance/paiements",
        json={
            "eleve_id": ctx["eleve_id"],
            "frais_id": ctx["frais_id"],
            "annee_scolaire_id": ctx["annee_id"],
            "montant_paye": "25000",
            "mode_paiement": "especes",
        },
        headers=secretaire_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["statut"] == "valide"
    assert data["reference_transaction"].startswith("PAY-")
    assert float(data["montant_paye"]) == 25000.0


def test_paiement_immutable_no_update_delete() -> None:
    """Aucune méthode de modification/suppression métier sur les paiements."""
    forbidden = {"update_paiement", "modifier_paiement", "delete_paiement", "supprimer_paiement"}
    service_methods = {m for m in dir(FinanceService) if not m.startswith("_")}
    assert forbidden.isdisjoint(service_methods)
    assert "valider_paiement" in service_methods


@pytest.mark.asyncio
async def test_validation_paiement(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
    comptable_headers: dict[str, str],
    secretaire_headers: dict[str, str],
) -> None:
    ctx = await _create_finance_context(
        async_client, auth_headers, comptable_headers
    )
    paiement = await async_client.post(
        "/finance/paiements",
        json={
            "eleve_id": ctx["eleve_id"],
            "frais_id": ctx["frais_id"],
            "annee_scolaire_id": ctx["annee_id"],
            "montant_paye": "10000",
            "mode_paiement": "mobile_money",
        },
        headers=secretaire_headers,
    )
    assert paiement.status_code == 201
    assert paiement.json()["statut"] == "en_attente"
    paiement_id = paiement.json()["id"]

    valider = await async_client.put(
        f"/finance/paiements/{paiement_id}/valider",
        headers=comptable_headers,
    )
    assert valider.status_code == 200
    assert valider.json()["statut"] == "valide"


@pytest.mark.asyncio
async def test_reference_unique_par_tenant(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
    comptable_headers: dict[str, str],
    secretaire_headers: dict[str, str],
) -> None:
    ctx = await _create_finance_context(
        async_client, auth_headers, comptable_headers
    )
    p1 = await async_client.post(
        "/finance/paiements",
        json={
            "eleve_id": ctx["eleve_id"],
            "frais_id": ctx["frais_id"],
            "annee_scolaire_id": ctx["annee_id"],
            "montant_paye": "5000",
            "mode_paiement": "especes",
        },
        headers=secretaire_headers,
    )
    p2 = await async_client.post(
        "/finance/paiements",
        json={
            "eleve_id": ctx["eleve_id"],
            "frais_id": ctx["frais_id"],
            "annee_scolaire_id": ctx["annee_id"],
            "montant_paye": "5000",
            "mode_paiement": "especes",
        },
        headers=secretaire_headers,
    )
    assert p1.status_code == 201
    assert p2.status_code == 201
    assert p1.json()["reference_transaction"] != p2.json()["reference_transaction"]


@pytest.mark.asyncio
async def test_situation_financiere_eleve(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
    comptable_headers: dict[str, str],
    secretaire_headers: dict[str, str],
) -> None:
    ctx = await _create_finance_context(
        async_client, auth_headers, comptable_headers
    )
    await async_client.post(
        "/finance/paiements",
        json={
            "eleve_id": ctx["eleve_id"],
            "frais_id": ctx["frais_id"],
            "annee_scolaire_id": ctx["annee_id"],
            "montant_paye": "20000",
            "mode_paiement": "especes",
        },
        headers=secretaire_headers,
    )

    situation = await async_client.get(
        f"/finance/eleves/{ctx['eleve_id']}/situation",
        params={"annee_id": ctx["annee_id"]},
        headers=comptable_headers,
    )
    assert situation.status_code == 200
    data = situation.json()
    assert float(data["total_du"]) == 50000.0
    assert float(data["total_paye"]) == 20000.0
    assert float(data["reste_a_payer"]) == 30000.0


@pytest.mark.asyncio
async def test_isolation_tenant_paiements(
    async_client: AsyncClient,
    db_session,
    unique_ip_headers: dict[str, str],
) -> None:
    headers_a = await _auth_headers_for_role(
        async_client, db_session, RoleUtilisateur.PROMOTEUR, unique_ip_headers
    )
    ctx = await _create_finance_context(async_client, headers_a)
    paiement = await async_client.post(
        "/finance/paiements",
        json={
            "eleve_id": ctx["eleve_id"],
            "frais_id": ctx["frais_id"],
            "annee_scolaire_id": ctx["annee_id"],
            "montant_paye": "5000",
            "mode_paiement": "especes",
        },
        headers=headers_a,
    )
    paiement_id = paiement.json()["id"]

    headers_b = await _auth_headers_for_role(
        async_client, db_session, RoleUtilisateur.COMPTABLE, unique_ip_headers
    )
    valider = await async_client.put(
        f"/finance/paiements/{paiement_id}/valider",
        headers=headers_b,
    )
    assert valider.status_code == 404


@pytest.mark.asyncio
async def test_enregistrement_depense(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
    comptable_headers: dict[str, str],
) -> None:
    response = await async_client.post(
        "/finance/depenses",
        json={
            "categorie": "Fournitures",
            "libelle": "Achat cahiers",
            "montant": "15000",
            "date_depense": "2025-10-01",
        },
        headers=comptable_headers,
    )
    assert response.status_code == 201
    assert float(response.json()["montant"]) == 15000.0


@pytest.mark.asyncio
async def test_paiement_salaire(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
    comptable_headers: dict[str, str],
) -> None:
    await _create_finance_context(async_client, auth_headers, comptable_headers)
    headers = comptable_headers

    login_resp = await async_client.get("/auth/me", headers=headers)
    employe_id = login_resp.json()["id"]

    response = await async_client.post(
        "/finance/salaires",
        json={
            "employe_id": employe_id,
            "mois": "2025-10-01",
            "montant_brut": "150000",
            "montant_net": "120000",
        },
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["statut"] == "paye"
    assert float(response.json()["montant_net"]) == 120000.0


@pytest.mark.asyncio
async def test_caisse_jour(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
    comptable_headers: dict[str, str],
    secretaire_headers: dict[str, str],
) -> None:
    ctx = await _create_finance_context(
        async_client, auth_headers, comptable_headers
    )
    await async_client.post(
        "/finance/paiements",
        json={
            "eleve_id": ctx["eleve_id"],
            "frais_id": ctx["frais_id"],
            "annee_scolaire_id": ctx["annee_id"],
            "montant_paye": "8000",
            "mode_paiement": "especes",
        },
        headers=secretaire_headers,
    )

    caisse = await async_client.get(
        "/finance/caisse",
        params={"date": date.today().isoformat()},
        headers=comptable_headers,
    )
    assert caisse.status_code == 200
    assert float(caisse.json()["caisse"]["total_entrees"]) == 8000.0
    assert float(caisse.json()["solde_actuel"]) == 8000.0


@pytest.mark.asyncio
async def test_situation_financiere_globale(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
    comptable_headers: dict[str, str],
    secretaire_headers: dict[str, str],
) -> None:
    ctx = await _create_finance_context(
        async_client, auth_headers, comptable_headers
    )

    await async_client.post(
        "/finance/paiements",
        json={
            "eleve_id": ctx["eleve_id"],
            "frais_id": ctx["frais_id"],
            "annee_scolaire_id": ctx["annee_id"],
            "montant_paye": "30000",
            "mode_paiement": "especes",
        },
        headers=secretaire_headers,
    )
    await async_client.post(
        "/finance/depenses",
        json={
            "categorie": "Entretien",
            "libelle": "Nettoyage",
            "montant": "5000",
            "date_depense": "2025-10-05",
        },
        headers=comptable_headers,
    )

    situation = await async_client.get(
        "/finance/situation",
        params={"annee_id": ctx["annee_id"]},
        headers=comptable_headers,
    )
    assert situation.status_code == 200
    data = situation.json()
    assert float(data["total_recettes"]) == 30000.0
    assert float(data["total_depenses"]) == 5000.0
    assert float(data["solde"]) == 25000.0
