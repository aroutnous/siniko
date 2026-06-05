"""Tests module M6 — Reporting & Documents."""

import uuid

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.models.auth import Utilisateur
from app.models.enums import RoleUtilisateur, StatutTenant, StatutUtilisateur
from app.models.tenant import Tenant
from app.services.reporting_service import ReportingService
from tests.conftest import TEST_PASSWORD
from tests.test_finance import _auth_headers_for_role, _create_finance_context


async def _headers_same_tenant(
    client: AsyncClient,
    db_session,
    tenant: Tenant,
    role: RoleUtilisateur,
    unique_ip_headers: dict[str, str],
) -> dict[str, str]:
    email = f"{role.value}-{uuid.uuid4().hex[:8]}@report.ml"
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
async def test_tableau_bord_promoteur(
    async_client: AsyncClient,
    db_session,
    unique_ip_headers: dict[str, str],
) -> None:
    headers = await _auth_headers_for_role(
        async_client, db_session, RoleUtilisateur.PROMOTEUR, unique_ip_headers
    )
    await _create_finance_context(async_client, headers)

    response = await async_client.get("/reporting/tableau-bord", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "promoteur"
    assert "nb_eleves" in data["donnees"]
    assert "nb_classes" in data["donnees"]
    assert "taux_paiement" in data["donnees"]
    assert "ca_mois" in data["donnees"]


@pytest.mark.asyncio
async def test_tableau_bord_directeur(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
    comptable_headers: dict[str, str],
) -> None:
    await _create_finance_context(async_client, auth_headers, comptable_headers)
    response = await async_client.get("/reporting/tableau-bord", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "directeur"
    assert "taux_reussite" in data["donnees"]
    assert "nb_bulletins_valides" in data["donnees"]
    assert "nb_absences" in data["donnees"]


@pytest.mark.asyncio
async def test_statistiques_globales(
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
            "montant_paye": "25000",
            "mode_paiement": "especes",
        },
        headers=secretaire_headers,
    )

    response = await async_client.get(
        "/reporting/statistiques",
        params={"annee_id": ctx["annee_id"]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["eleves"]["total_eleves"] >= 1
    assert "financieres" in data
    assert float(data["financieres"]["total_recettes"]) >= 25000.0


def test_taux_reussite(db_session, seed_auth_data) -> None:
    tenant, _ = seed_auth_data
    service = ReportingService(db=db_session, tenant_id=tenant.id)
    taux = service.get_taux_reussite(uuid.uuid4(), uuid.uuid4())
    assert taux == 0.0


def test_taux_paiement(db_session, seed_auth_data) -> None:
    tenant, _ = seed_auth_data
    service = ReportingService(db=db_session, tenant_id=tenant.id)
    taux = service.get_taux_paiement(uuid.uuid4())
    assert taux == 0.0


@pytest.mark.asyncio
async def test_export_pdf_rapport_financier(
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
            "montant_paye": "10000",
            "mode_paiement": "especes",
        },
        headers=secretaire_headers,
    )

    response = await async_client.get(
        "/reporting/exports/rapport-financier",
        params={"annee_id": ctx["annee_id"], "format": "pdf"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


@pytest.mark.asyncio
async def test_export_excel_resultats_classe(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
    comptable_headers: dict[str, str],
) -> None:
    ctx = await _create_finance_context(
        async_client, auth_headers, comptable_headers
    )

    periode = await async_client.post(
        "/periodes",
        json={
            "annee_scolaire_id": ctx["annee_id"],
            "nom": "1er Trimestre",
            "date_debut": "2025-09-01",
            "date_fin": "2025-12-20",
            "ordre": 1,
        },
        headers=auth_headers,
    )
    matiere = await async_client.post(
        "/matieres",
        json={"niveau_id": ctx["niveau_id"], "nom": "Maths", "coefficient": "2"},
        headers=auth_headers,
    )
    await async_client.post(
        "/pedagogie/notes/batch",
        json={
            "notes": [
                {
                    "eleve_id": ctx["eleve_id"],
                    "matiere_id": matiere.json()["id"],
                    "periode_id": periode.json()["id"],
                    "classe_id": ctx["classe_id"],
                    "valeur": "14",
                }
            ]
        },
        headers=auth_headers,
    )
    await async_client.post(
        "/pedagogie/bulletins/generer",
        json={
            "classe_id": ctx["classe_id"],
            "periode_id": periode.json()["id"],
        },
        headers=auth_headers,
    )

    response = await async_client.get(
        "/reporting/exports/resultats-classe",
        params={
            "classe_id": ctx["classe_id"],
            "periode_id": periode.json()["id"],
            "format": "excel",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert "spreadsheetml" in response.headers["content-type"]
    assert response.content[:2] == b"PK"


@pytest.mark.asyncio
async def test_isolation_tenant_reporting(
    async_client: AsyncClient,
    db_session,
    unique_ip_headers: dict[str, str],
) -> None:
    headers_a = await _auth_headers_for_role(
        async_client, db_session, RoleUtilisateur.PROMOTEUR, unique_ip_headers
    )
    ctx = await _create_finance_context(async_client, headers_a)

    headers_b = await _auth_headers_for_role(
        async_client, db_session, RoleUtilisateur.PROMOTEUR, unique_ip_headers
    )

    response = await async_client.get(
        "/reporting/statistiques",
        params={"annee_id": ctx["annee_id"]},
        headers=headers_b,
    )
    assert response.status_code == 404
