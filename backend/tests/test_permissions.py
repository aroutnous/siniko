"""Tests du système de permissions dynamiques (M1)."""

import uuid

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.auth import Utilisateur
from app.models.enums import Permission, RoleUtilisateur, StatutTenant, StatutUtilisateur
from app.models.tenant import Tenant
from app.services.permissions import PermissionService
from tests.conftest import TEST_PASSWORD
from tests.permission_helpers import grant_role_permissions


def _create_user(
    db: Session,
    tenant: Tenant,
    role: RoleUtilisateur,
    *,
    grant_defaults: bool = False,
) -> Utilisateur:
    user = Utilisateur(
        tenant_id=tenant.id,
        nom="Test",
        prenom=role.value.title(),
        email=f"{role.value}-{uuid.uuid4().hex[:8]}@perm.ml",
        mot_de_passe_hash=hash_password(TEST_PASSWORD),
        role=role,
        statut=StatutUtilisateur.ACTIF,
    )
    db.add(user)
    db.flush()
    if grant_defaults:
        grant_role_permissions(db, user)
    db.refresh(user)
    return user


def _create_tenant(db: Session, slug_suffix: str | None = None) -> Tenant:
    tenant = Tenant(
        nom="École Permissions",
        slug=f"ecole-perm-{slug_suffix or uuid.uuid4().hex[:8]}",
        statut=StatutTenant.ACTIF,
    )
    db.add(tenant)
    db.flush()
    db.refresh(tenant)
    return tenant


def test_promoteur_acces_total(db_session: Session) -> None:
    tenant = _create_tenant(db_session)
    promoteur = _create_user(db_session, tenant, RoleUtilisateur.PROMOTEUR)
    service = PermissionService(db_session)

    assert service.get_permissions(promoteur.id, tenant.id) == ["*"]
    assert service.verifier_permission(promoteur, Permission.ELEVES_CONSULTER.value) is True
    assert service.verifier_permission(promoteur, "any.permission") is True


def test_permission_accordee(db_session: Session) -> None:
    tenant = _create_tenant(db_session)
    admin = _create_user(db_session, tenant, RoleUtilisateur.DIRECTEUR, grant_defaults=True)
    cible = _create_user(db_session, tenant, RoleUtilisateur.SECRETAIRE)
    service = PermissionService(db_session)

    service.accorder_permission(
        cible.id,
        Permission.PAIEMENTS_CONSULTER.value,
        admin.id,
        tenant.id,
    )

    assert Permission.PAIEMENTS_CONSULTER.value in service.get_permissions(
        cible.id, tenant.id
    )
    assert service.verifier_permission(cible, Permission.PAIEMENTS_CONSULTER.value) is True


def test_permission_refusee(db_session: Session) -> None:
    tenant = _create_tenant(db_session)
    user = _create_user(db_session, tenant, RoleUtilisateur.SECRETAIRE)
    service = PermissionService(db_session)

    assert service.verifier_permission(user, Permission.NOTES_SAISIR.value) is False


def test_set_permissions_remplace_tout(db_session: Session) -> None:
    tenant = _create_tenant(db_session)
    admin = _create_user(db_session, tenant, RoleUtilisateur.DIRECTEUR, grant_defaults=True)
    cible = _create_user(db_session, tenant, RoleUtilisateur.COMPTABLE)
    service = PermissionService(db_session)

    service.accorder_permission(
        cible.id, Permission.PAIEMENTS_CONSULTER.value, admin.id, tenant.id
    )
    service.accorder_permission(
        cible.id, Permission.FRAIS_CONSULTER.value, admin.id, tenant.id
    )

    service.set_permissions(
        cible.id,
        [Permission.DEPENSES_CONSULTER.value, Permission.DEPENSES_GERER.value],
        admin.id,
        tenant.id,
    )

    perms = service.get_permissions(cible.id, tenant.id)
    assert Permission.PAIEMENTS_CONSULTER.value not in perms
    assert Permission.FRAIS_CONSULTER.value not in perms
    assert Permission.DEPENSES_CONSULTER.value in perms
    assert Permission.DEPENSES_GERER.value in perms


def test_revoquer_permission(db_session: Session) -> None:
    tenant = _create_tenant(db_session)
    admin = _create_user(db_session, tenant, RoleUtilisateur.DIRECTEUR, grant_defaults=True)
    cible = _create_user(db_session, tenant, RoleUtilisateur.SECRETAIRE)
    service = PermissionService(db_session)

    service.accorder_permission(
        cible.id, Permission.PAIEMENTS_ENREGISTRER.value, admin.id, tenant.id
    )
    assert service.verifier_permission(cible, Permission.PAIEMENTS_ENREGISTRER.value)

    service.revoquer_permission(
        cible.id,
        Permission.PAIEMENTS_ENREGISTRER.value,
        tenant.id,
        accordee_par_id=admin.id,
    )
    assert not service.verifier_permission(cible, Permission.PAIEMENTS_ENREGISTRER.value)


def test_isolation_tenant_permissions(db_session: Session) -> None:
    tenant_a = _create_tenant(db_session, "a")
    tenant_b = _create_tenant(db_session, "b")
    admin_a = _create_user(db_session, tenant_a, RoleUtilisateur.DIRECTEUR, grant_defaults=True)
    user_b = _create_user(db_session, tenant_b, RoleUtilisateur.SECRETAIRE)
    service = PermissionService(db_session)

    service.accorder_permission(
        user_b.id,
        Permission.ELEVES_CONSULTER.value,
        admin_a.id,
        tenant_b.id,
    )

    with pytest.raises(HTTPException) as exc_info:
        service.get_permissions(user_b.id, tenant_a.id)
    assert exc_info.value.status_code == 404

    assert service.get_permissions(user_b.id, tenant_b.id) == [
        Permission.ELEVES_CONSULTER.value
    ]


def test_platform_owner_acces_platform_admin(db_session: Session) -> None:
    tenant = _create_tenant(db_session)
    owner = _create_user(db_session, tenant, RoleUtilisateur.PLATFORM_OWNER)
    service = PermissionService(db_session)

    assert service.verifier_permission(owner, Permission.PLATFORM_ADMIN.value) is True
    assert service.verifier_permission(owner, Permission.ELEVES_CONSULTER.value) is False
    assert service.get_permissions(owner.id, tenant.id) == [Permission.PLATFORM_ADMIN.value]


@pytest.mark.asyncio
async def test_me_permissions_sans_utilisateurs_read(
    async_client: AsyncClient,
    db_session: Session,
    unique_ip_headers: dict[str, str],
) -> None:
    tenant = _create_tenant(db_session)
    promoteur = _create_user(db_session, tenant, RoleUtilisateur.PROMOTEUR)
    directeur = _create_user(db_session, tenant, RoleUtilisateur.DIRECTEUR)
    service = PermissionService(db_session)

    for permission in (
        Permission.NOTES_CONSULTER.value,
        Permission.RESULTATS_CONSULTER.value,
        Permission.STATISTIQUES_PEDAGOGIE.value,
    ):
        service.accorder_permission(
            directeur.id,
            permission,
            promoteur.id,
            tenant.id,
        )

    login = await async_client.post(
        "/auth/login",
        json={
            "email": directeur.email,
            "password": TEST_PASSWORD,
            "tenant_slug": tenant.slug,
        },
        headers=unique_ip_headers,
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    me_perms = await async_client.get("/auth/me/permissions", headers=headers)
    assert me_perms.status_code == 200
    assert me_perms.json()["permissions"] == [
        Permission.NOTES_CONSULTER.value,
        Permission.RESULTATS_CONSULTER.value,
        Permission.STATISTIQUES_PEDAGOGIE.value,
    ]

    admin_perms = await async_client.get(
        f"/auth/utilisateurs/{directeur.id}/permissions",
        headers=headers,
    )
    assert admin_perms.status_code == 403


@pytest.mark.asyncio
async def test_utilisateur_sans_permission_bloque(
    async_client: AsyncClient,
    db_session: Session,
    unique_ip_headers: dict[str, str],
) -> None:
    tenant = _create_tenant(db_session)
    user = _create_user(db_session, tenant, RoleUtilisateur.SECRETAIRE)

    login = await async_client.post(
        "/auth/login",
        json={
            "email": user.email,
            "password": TEST_PASSWORD,
            "tenant_slug": tenant.slug,
        },
        headers=unique_ip_headers,
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = await async_client.get("/cycles", headers=headers)
    assert response.status_code == 403
