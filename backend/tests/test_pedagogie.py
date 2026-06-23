"""Tests module M4 — Gestion pédagogique."""

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.models.auth import Utilisateur
from app.models.eleve import Eleve
from app.models.enums import RoleUtilisateur, StatutEleve, StatutTenant, StatutUtilisateur
from app.models.pedagogie import BulletinLigne
from app.models.tenant import Tenant
from app.services.calcul_service import CalculService
from app.services.pedagogie_service import agreger_statut_competence
from tests.conftest import TEST_PASSWORD
from tests.establishment_helpers import create_test_structure
from tests.permission_helpers import grant_role_permissions


async def _create_pedagogie_context(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    nb_eleves: int = 2,
) -> dict[str, object]:
    """Structure complète : cycle → classe → période → matières → élèves."""
    structure = await create_test_structure(client, headers, matiere_nom=None)
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
    periode = await client.post(
        "/periodes",
        json={
            "annee_scolaire_id": structure["annee_id"],
            "nom": "1er Trimestre",
            "date_debut": "2025-09-01",
            "date_fin": "2025-12-20",
            "ordre": 1,
        },
        headers=headers,
    )
    maths = await client.post(
        "/matieres",
        json={
            "classe_id": structure["niveau_id"],
            "nom": "Mathématiques",
            "coefficient": "3",
        },
        headers=headers,
    )
    francais = await client.post(
        "/matieres",
        json={"classe_id": structure["niveau_id"], "nom": "Français", "coefficient": "2"},
        headers=headers,
    )

    eleve_ids: list[str] = []
    for i in range(nb_eleves):
        inscrit = await client.post(
            "/eleves/inscrire",
            json={
                "nom": f"Élève{i}",
                "prenom": "Test",
                "classe_id": structure["classe_id"],
                "annee_scolaire_id": structure["annee_id"],
            },
            headers=headers,
        )
        assert inscrit.status_code == 201
        eleve_ids.append(inscrit.json()["eleve"]["id"])

    return {
        "classe_id": structure["classe_id"],
        "periode_id": periode.json()["id"],
        "matiere_maths_id": maths.json()["id"],
        "matiere_francais_id": francais.json()["id"],
        "eleve_ids": eleve_ids,
    }


def _note_item(
    ctx: dict[str, object],
    eleve_id: str,
    matiere_id: str,
    valeur: str,
) -> dict:
    return {
        "eleve_id": eleve_id,
        "matiere_id": matiere_id,
        "periode_id": ctx["periode_id"],
        "classe_id": ctx["classe_id"],
        "valeur": valeur,
    }


@pytest.mark.asyncio
async def test_saisie_notes_batch(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    ctx = await _create_pedagogie_context(async_client, auth_headers)
    response = await async_client.post(
        "/pedagogie/notes/batch",
        json={
            "notes": [
                _note_item(ctx, ctx["eleve_ids"][0], ctx["matiere_maths_id"], "15"),
                _note_item(ctx, ctx["eleve_ids"][0], ctx["matiere_francais_id"], "14"),
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert len(data) == 2
    assert data[0]["appreciation"] == "Bien"


@pytest.mark.asyncio
async def test_upsert_note_existante(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    ctx = await _create_pedagogie_context(async_client, auth_headers, nb_eleves=1)
    note = _note_item(ctx, ctx["eleve_ids"][0], ctx["matiere_maths_id"], "12")
    first = await async_client.post(
        "/pedagogie/notes/batch",
        json={"notes": [note]},
        headers=auth_headers,
    )
    assert first.status_code == 201
    note_id = first.json()[0]["id"]

    note["valeur"] = "16"
    second = await async_client.post(
        "/pedagogie/notes/batch",
        json={"notes": [note]},
        headers=auth_headers,
    )
    assert second.status_code == 201
    assert second.json()[0]["id"] == note_id
    assert float(second.json()[0]["valeur"]) == 16.0


def test_calcul_moyenne_ponderee() -> None:
    lignes = [
        BulletinLigne(
            bulletin_id=uuid.uuid4(),
            matiere_id=uuid.uuid4(),
            note=Decimal("15"),
            coefficient=Decimal("3"),
        ),
        BulletinLigne(
            bulletin_id=uuid.uuid4(),
            matiere_id=uuid.uuid4(),
            note=Decimal("10"),
            coefficient=Decimal("2"),
        ),
    ]
    moyenne = CalculService.calculer_moyenne_generale(lignes)
    assert round(moyenne, 2) == 13.0


def test_calcul_rang() -> None:
    e1, e2, e3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    moyennes = {e1: 15.0, e2: 12.0, e3: 18.0}
    assert CalculService.calculer_rang(e3, moyennes) == 1
    assert CalculService.calculer_rang(e1, moyennes) == 2
    assert CalculService.calculer_rang(e2, moyennes) == 3


@pytest.mark.parametrize(
    ("moyenne", "mention"),
    [
        (16.0, "Très Bien"),
        (14.5, "Bien"),
        (12.0, "Assez Bien"),
        (10.0, "Passable"),
        (9.5, "Insuffisant"),
    ],
)
def test_get_mention(moyenne: float, mention: str) -> None:
    assert CalculService.get_mention(moyenne) == mention


def _note_item_qualitative(
    ctx: dict[str, object],
    eleve_id: str,
    matiere_id: str,
    valeur_qualitative: str,
) -> dict:
    return {
        "eleve_id": eleve_id,
        "matiere_id": matiere_id,
        "periode_id": ctx["periode_id"],
        "classe_id": ctx["classe_id"],
        "valeur_qualitative": valeur_qualitative,
    }


async def _create_pedagogie_context_qualitative(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    nb_eleves: int = 1,
) -> dict[str, object]:
    cycle = await client.post(
        "/cycles",
        json={"nom": "Jardins d enfants", "ordre": 1, "type_evaluation": "qualitative"},
        headers=headers,
    )
    assert cycle.status_code == 201

    classe = await client.post(
        "/classes",
        json={
            "cycle_id": cycle.json()["id"],
            "nom": "Petite Section",
            "ordre": 1,
        },
        headers=headers,
    )
    assert classe.status_code == 201

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

    salle = await client.post(
        "/salles",
        json={
            "classe_id": classe.json()["id"],
            "annee_scolaire_id": annee.json()["id"],
            "nom_salle": "A",
            "capacite": 25,
        },
        headers=headers,
    )
    assert salle.status_code == 201

    periode = await client.post(
        "/periodes",
        json={
            "annee_scolaire_id": annee.json()["id"],
            "nom": "1er Trimestre",
            "date_debut": "2025-09-01",
            "date_fin": "2025-12-20",
            "ordre": 1,
        },
        headers=headers,
    )
    assert periode.status_code == 201

    langage = await client.post(
        "/matieres",
        json={"classe_id": classe.json()["id"], "nom": "Langage", "coefficient": "1"},
        headers=headers,
    )
    assert langage.status_code == 201

    motricite = await client.post(
        "/matieres",
        json={"classe_id": classe.json()["id"], "nom": "Motricité", "coefficient": "1"},
        headers=headers,
    )
    assert motricite.status_code == 201

    eleve_ids: list[str] = []
    for i in range(nb_eleves):
        inscrit = await client.post(
            "/eleves/inscrire",
            json={
                "nom": f"Quali{i}",
                "prenom": "Test",
                "classe_id": salle.json()["id"],
                "annee_scolaire_id": annee.json()["id"],
            },
            headers=headers,
        )
        assert inscrit.status_code == 201
        eleve_ids.append(inscrit.json()["eleve"]["id"])

    return {
        "classe_id": salle.json()["id"],
        "periode_id": periode.json()["id"],
        "matiere_langage_id": langage.json()["id"],
        "matiere_motricite_id": motricite.json()["id"],
        "eleve_ids": eleve_ids,
    }


@pytest.mark.parametrize(
    ("statuts", "attendu"),
    [
        (["acquis", "acquis"], "acquis"),
        (["acquis", "non_acquis"], "non_acquis"),
        (["acquis", "en_cours_acquisition"], "en_cours_acquisition"),
        ([], None),
    ],
)
def test_agreger_statut_competence(statuts: list[str], attendu: str | None) -> None:
    assert agreger_statut_competence(statuts) == attendu


@pytest.mark.asyncio
async def test_generation_bulletins_classe(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    ctx = await _create_pedagogie_context(async_client, auth_headers)
    await async_client.post(
        "/pedagogie/notes/batch",
        json={
            "notes": [
                _note_item(ctx, ctx["eleve_ids"][0], ctx["matiere_maths_id"], "16"),
                _note_item(ctx, ctx["eleve_ids"][0], ctx["matiere_francais_id"], "14"),
                _note_item(ctx, ctx["eleve_ids"][1], ctx["matiere_maths_id"], "12"),
                _note_item(ctx, ctx["eleve_ids"][1], ctx["matiere_francais_id"], "10"),
            ]
        },
        headers=auth_headers,
    )

    response = await async_client.post(
        "/pedagogie/bulletins/generer",
        json={
            "classe_id": ctx["classe_id"],
            "periode_id": ctx["periode_id"],
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    bulletins = response.json()
    assert len(bulletins) == 2
    assert all(b["statut"] == "brouillon" for b in bulletins)
    assert all(b["type_bulletin"] == "chiffre" for b in bulletins)
    assert all(b["rang"] is not None for b in bulletins)
    assert all(len(b["lignes"]) == 2 for b in bulletins)


@pytest.mark.asyncio
async def test_generation_bulletins_competences_qualitatif(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    ctx = await _create_pedagogie_context_qualitative(async_client, auth_headers)
    eleve_id = ctx["eleve_ids"][0]

    await async_client.post(
        "/pedagogie/notes/batch",
        json={
            "notes": [
                _note_item_qualitative(
                    ctx, eleve_id, ctx["matiere_langage_id"], "non_acquis"
                ),
                _note_item_qualitative(
                    ctx, eleve_id, ctx["matiere_motricite_id"], "acquis"
                ),
            ]
        },
        headers=auth_headers,
    )

    response = await async_client.post(
        "/pedagogie/bulletins/generer",
        json={
            "classe_id": ctx["classe_id"],
            "periode_id": ctx["periode_id"],
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    bulletins = response.json()
    assert len(bulletins) == 1
    bulletin = bulletins[0]
    assert bulletin["type_bulletin"] == "competences"
    assert bulletin["moyenne_generale"] is None
    assert bulletin["rang"] is None
    assert bulletin["mention"] is None
    assert bulletin["effectif_classe"] == 1
    assert len(bulletin["lignes"]) == 2
    statuts = {l["statut_competence"] for l in bulletin["lignes"]}
    assert statuts == {"non_acquis", "acquis"}
    for ligne in bulletin["lignes"]:
        assert ligne["note"] is None
        assert ligne["moyenne_classe"] is None
        assert ligne["coefficient"] is None


@pytest.mark.asyncio
async def test_validation_bulletin_par_directeur(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    ctx = await _create_pedagogie_context(async_client, auth_headers, nb_eleves=1)
    await async_client.post(
        "/pedagogie/notes/batch",
        json={
            "notes": [_note_item(ctx, ctx["eleve_ids"][0], ctx["matiere_maths_id"], "15")]
        },
        headers=auth_headers,
    )
    generer = await async_client.post(
        "/pedagogie/bulletins/generer",
        json={"classe_id": ctx["classe_id"], "periode_id": ctx["periode_id"]},
        headers=auth_headers,
    )
    bulletin_id = generer.json()[0]["id"]

    valider = await async_client.put(
        f"/pedagogie/bulletins/{bulletin_id}/valider",
        headers=auth_headers,
    )
    assert valider.status_code == 200
    assert valider.json()["statut"] == "valide"
    assert valider.json()["valide_par"] is not None


@pytest.mark.asyncio
async def test_publication_bulletin_impossible_si_brouillon(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    ctx = await _create_pedagogie_context(async_client, auth_headers, nb_eleves=1)
    await async_client.post(
        "/pedagogie/notes/batch",
        json={
            "notes": [_note_item(ctx, ctx["eleve_ids"][0], ctx["matiere_maths_id"], "11")]
        },
        headers=auth_headers,
    )
    generer = await async_client.post(
        "/pedagogie/bulletins/generer",
        json={"classe_id": ctx["classe_id"], "periode_id": ctx["periode_id"]},
        headers=auth_headers,
    )
    bulletin_id = generer.json()[0]["id"]

    publier = await async_client.put(
        f"/pedagogie/bulletins/{bulletin_id}/publier",
        headers=auth_headers,
    )
    assert publier.status_code == 409
    assert "validés" in publier.json()["detail"]


@pytest.mark.asyncio
async def test_isolation_tenant_notes(
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
    db_session.flush()
    grant_role_permissions(db_session, user_a)

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

    response = await async_client.get(
        f"/pedagogie/notes/{eleve_b.id}", headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_resultats_classe(
    async_client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    ctx = await _create_pedagogie_context(async_client, auth_headers)
    await async_client.post(
        "/pedagogie/notes/batch",
        json={
            "notes": [
                _note_item(ctx, ctx["eleve_ids"][0], ctx["matiere_maths_id"], "16"),
                _note_item(ctx, ctx["eleve_ids"][0], ctx["matiere_francais_id"], "14"),
                _note_item(ctx, ctx["eleve_ids"][1], ctx["matiere_maths_id"], "8"),
                _note_item(ctx, ctx["eleve_ids"][1], ctx["matiere_francais_id"], "9"),
            ]
        },
        headers=auth_headers,
    )
    await async_client.post(
        "/pedagogie/bulletins/generer",
        json={"classe_id": ctx["classe_id"], "periode_id": ctx["periode_id"]},
        headers=auth_headers,
    )

    response = await async_client.get(
        f"/pedagogie/classes/{ctx['classe_id']}/resultats",
        params={"periode_id": ctx["periode_id"]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["effectif"] == 2
    assert len(data["moyennes_par_matiere"]) == 2
    assert len(data["classement"]) == 2
    assert float(data["taux_reussite"]) == 50.0
