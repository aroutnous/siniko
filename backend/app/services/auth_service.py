"""Logique métier authentification multi-tenant (M1)."""

import logging
import secrets
import string
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import set_tenant_context
from app.core.security import (
    create_access_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.auth import ResetToken, Session as UserSession, Utilisateur
from app.models.enums import RoleUtilisateur, StatutTenant, StatutUtilisateur
from app.models.tenant import Tenant
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginResponse,
    ResetPasswordResponse,
    UtilisateurCreate,
    UtilisateurCreateResponse,
    UtilisateurListItem,
    UserProfile,
)
from app.services.audit_service import log_audit

logger = logging.getLogger(__name__)

RESET_TOKEN_MINUTES = 15


class AuthService:
    """Service d'authentification : login, sessions, reset password."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def login(
        self,
        email: str,
        password: str,
        tenant_slug: str,
        ip_address: str | None,
    ) -> LoginResponse:
        email = email.lower()
        tenant = (
            self.db.query(Tenant).filter(Tenant.slug == tenant_slug).first()
        )

        if tenant is None:
            log_audit(
                self.db,
                action="auth.login",
                resultat="failure",
                ip_address=ip_address,
                details={"reason": "unknown_tenant", "tenant_slug": tenant_slug},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Identifiants invalides",
            )

        if tenant.statut == StatutTenant.SUSPENDU:
            log_audit(
                self.db,
                action="auth.login",
                resultat="failure",
                tenant_id=tenant.id,
                ip_address=ip_address,
                details={"reason": "tenant_suspended"},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant suspendu",
            )

        user = (
            self.db.query(Utilisateur)
            .filter(
                Utilisateur.tenant_id == tenant.id,
                Utilisateur.email == email.lower(),
            )
            .first()
        )

        if (
            user is None
            or user.statut != StatutUtilisateur.ACTIF
            or not verify_password(password, user.mot_de_passe_hash)
        ):
            log_audit(
                self.db,
                action="auth.login",
                resultat="failure",
                tenant_id=tenant.id,
                utilisateur_id=user.id if user else None,
                ip_address=ip_address,
                details={"reason": "invalid_credentials"},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Identifiants invalides",
            )

        # Active le contexte RLS PostgreSQL pour la suite de la requête
        set_tenant_context(self.db, tenant.id)

        expires_delta = timedelta(minutes=settings.jwt_expire_minutes)
        access_token = create_access_token(
            data={
                "sub": str(user.id),
                "tenant_id": str(tenant.id),
                "role": user.role.value,
                "email": user.email,
            },
            expires_delta=expires_delta,
        )
        expire_at = datetime.now(UTC) + expires_delta

        self.db.add(
            UserSession(
                utilisateur_id=user.id,
                token_hash=hash_token(access_token),
                ip_address=ip_address,
                expire_at=expire_at,
            )
        )
        user.derniere_connexion = datetime.now(UTC)
        self.db.commit()

        log_audit(
            self.db,
            action="auth.login",
            resultat="success",
            tenant_id=tenant.id,
            utilisateur_id=user.id,
            ip_address=ip_address,
            table_cible="sessions",
        )

        return LoginResponse(
            access_token=access_token,
            expires_in=int(expires_delta.total_seconds()),
            role=user.role,
            tenant_slug=tenant.slug,
        )

    def logout(
        self,
        token: str,
        user: Utilisateur,
        ip_address: str | None,
    ) -> None:
        token_digest = hash_token(token)
        deleted = (
            self.db.query(UserSession)
            .filter(
                UserSession.utilisateur_id == user.id,
                UserSession.token_hash == token_digest,
            )
            .delete()
        )
        self.db.commit()

        log_audit(
            self.db,
            action="auth.logout",
            resultat="success" if deleted else "failure",
            tenant_id=user.tenant_id,
            utilisateur_id=user.id,
            ip_address=ip_address,
            table_cible="sessions",
        )

    def refresh(
        self,
        token: str,
        user: Utilisateur,
        ip_address: str | None,
    ) -> LoginResponse:
        token_digest = hash_token(token)
        session = (
            self.db.query(UserSession)
            .filter(
                UserSession.utilisateur_id == user.id,
                UserSession.token_hash == token_digest,
                UserSession.expire_at > datetime.now(UTC),
            )
            .first()
        )
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session invalide ou expirée",
            )

        tenant = self.db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if tenant is None or tenant.statut != StatutTenant.ACTIF:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant inactif",
            )

        set_tenant_context(self.db, tenant.id)

        expires_delta = timedelta(minutes=settings.jwt_expire_minutes)
        access_token = create_access_token(
            data={
                "sub": str(user.id),
                "tenant_id": str(tenant.id),
                "role": user.role.value,
                "email": user.email,
            },
            expires_delta=expires_delta,
        )
        expire_at = datetime.now(UTC) + expires_delta

        session.token_hash = hash_token(access_token)
        session.expire_at = expire_at
        session.ip_address = ip_address
        self.db.commit()

        log_audit(
            self.db,
            action="auth.refresh",
            resultat="success",
            tenant_id=tenant.id,
            utilisateur_id=user.id,
            ip_address=ip_address,
            table_cible="sessions",
        )

        return LoginResponse(
            access_token=access_token,
            expires_in=int(expires_delta.total_seconds()),
            role=user.role,
            tenant_slug=tenant.slug,
        )

    def request_reset(
        self,
        email: str,
        tenant_slug: str,
        ip_address: str | None,
    ) -> ResetPasswordResponse:
        """
        Demande de réinitialisation — toujours HTTP 200 (anti-énumération).
        """
        tenant = (
            self.db.query(Tenant)
            .filter(
                Tenant.slug == tenant_slug,
                Tenant.statut == StatutTenant.ACTIF,
            )
            .first()
        )
        user = None
        if tenant is not None:
            user = (
                self.db.query(Utilisateur)
                .filter(
                    Utilisateur.tenant_id == tenant.id,
                    Utilisateur.email == email.lower(),
                    Utilisateur.statut == StatutUtilisateur.ACTIF,
                )
                .first()
            )

        if user is not None:
            raw_token = str(uuid.uuid4())
            expire_at = datetime.now(UTC) + timedelta(minutes=RESET_TOKEN_MINUTES)

            self.db.query(ResetToken).filter(
                ResetToken.utilisateur_id == user.id
            ).delete()

            self.db.add(
                ResetToken(
                    utilisateur_id=user.id,
                    token_hash=hash_token(raw_token),
                    expire_at=expire_at,
                )
            )
            self.db.commit()

            # Simulation envoi email en développement
            logger.info(
                "RESET_PASSWORD_DEV tenant=%s email=%s token=%s expire=%s",
                tenant_slug,
                email,
                raw_token,
                expire_at.isoformat(),
            )

            log_audit(
                self.db,
                action="auth.reset_password.request",
                resultat="success",
                tenant_id=tenant.id if tenant else None,
                utilisateur_id=user.id,
                ip_address=ip_address,
                table_cible="reset_tokens",
            )
        else:
            log_audit(
                self.db,
                action="auth.reset_password.request",
                resultat="success",
                tenant_id=tenant.id if tenant else None,
                ip_address=ip_address,
                details={"note": "no_user_matched"},
            )

        return ResetPasswordResponse()

    def confirm_reset(
        self,
        token: str,
        new_password: str,
        tenant_slug: str,
        ip_address: str | None,
    ) -> None:
        tenant = (
            self.db.query(Tenant)
            .filter(
                Tenant.slug == tenant_slug,
                Tenant.statut == StatutTenant.ACTIF,
            )
            .first()
        )
        if tenant is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Demande invalide ou expirée",
            )

        token_digest = hash_token(token)
        reset_row = (
            self.db.query(ResetToken)
            .join(Utilisateur)
            .filter(
                ResetToken.token_hash == token_digest,
                ResetToken.expire_at > datetime.now(UTC),
                Utilisateur.tenant_id == tenant.id,
            )
            .first()
        )
        if reset_row is None:
            log_audit(
                self.db,
                action="auth.reset_password.confirm",
                resultat="failure",
                tenant_id=tenant.id,
                ip_address=ip_address,
                details={"reason": "invalid_or_expired_token"},
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Demande invalide ou expirée",
            )

        user = (
            self.db.query(Utilisateur)
            .filter(Utilisateur.id == reset_row.utilisateur_id)
            .first()
        )
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Demande invalide ou expirée",
            )

        user.mot_de_passe_hash = hash_password(new_password)
        self.db.query(ResetToken).filter(
            ResetToken.utilisateur_id == user.id
        ).delete()
        self.db.query(UserSession).filter(
            UserSession.utilisateur_id == user.id
        ).delete()
        self.db.commit()

        log_audit(
            self.db,
            action="auth.reset_password.confirm",
            resultat="success",
            tenant_id=tenant.id,
            utilisateur_id=user.id,
            ip_address=ip_address,
            table_cible="utilisateurs",
            enregistrement_id=user.id,
        )

    @staticmethod
    def _generer_mot_de_passe_temporaire() -> str:
        alphabet = string.ascii_letters + string.digits + "!@#$%"
        return "".join(secrets.choice(alphabet) for _ in range(12))

    def list_tenant_users(self, actor: Utilisateur) -> list[UtilisateurListItem]:
        """Liste les utilisateurs du tenant courant."""
        set_tenant_context(self.db, actor.tenant_id)
        users = (
            self.db.query(Utilisateur)
            .filter(Utilisateur.tenant_id == actor.tenant_id)
            .order_by(Utilisateur.nom, Utilisateur.prenom)
            .all()
        )
        return [UtilisateurListItem.model_validate(u) for u in users]

    def create_tenant_user(
        self,
        actor: Utilisateur,
        data: UtilisateurCreate,
        ip_address: str | None,
    ) -> UtilisateurCreateResponse:
        """Crée un utilisateur dans le tenant du promoteur."""
        set_tenant_context(self.db, actor.tenant_id)
        email = str(data.email).lower()

        existing = (
            self.db.query(Utilisateur)
            .filter(
                Utilisateur.tenant_id == actor.tenant_id,
                Utilisateur.email == email,
            )
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email déjà utilisé pour cet établissement",
            )

        mot_de_passe = data.mot_de_passe or self._generer_mot_de_passe_temporaire()
        utilisateur = Utilisateur(
            tenant_id=actor.tenant_id,
            nom=data.nom,
            prenom=data.prenom,
            email=email,
            mot_de_passe_hash=hash_password(mot_de_passe),
            role=data.role,
            statut=StatutUtilisateur.ACTIF,
        )
        self.db.add(utilisateur)
        self.db.commit()
        self.db.refresh(utilisateur)

        log_audit(
            self.db,
            action="auth.user.create",
            resultat="success",
            tenant_id=actor.tenant_id,
            utilisateur_id=actor.id,
            ip_address=ip_address,
            table_cible="utilisateurs",
            enregistrement_id=utilisateur.id,
            details={"email": email, "role": data.role.value},
        )

        return UtilisateurCreateResponse(
            id=utilisateur.id,
            tenant_id=utilisateur.tenant_id,
            email=utilisateur.email,
            nom=utilisateur.nom,
            prenom=utilisateur.prenom,
            role=utilisateur.role,
            mot_de_passe_temporaire=None if data.mot_de_passe else mot_de_passe,
        )

    def update_user_statut(
        self,
        actor: Utilisateur,
        user_id: uuid.UUID,
        statut: StatutUtilisateur,
        ip_address: str | None,
    ) -> UtilisateurListItem:
        """Active ou désactive un utilisateur du tenant."""
        if actor.id == user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vous ne pouvez pas modifier votre propre statut",
            )

        set_tenant_context(self.db, actor.tenant_id)
        utilisateur = (
            self.db.query(Utilisateur)
            .filter(
                Utilisateur.id == user_id,
                Utilisateur.tenant_id == actor.tenant_id,
            )
            .first()
        )
        if utilisateur is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Utilisateur introuvable",
            )

        if utilisateur.role == RoleUtilisateur.PROMOTEUR:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le statut du promoteur ne peut pas être modifié",
            )

        ancien_statut = utilisateur.statut
        utilisateur.statut = statut

        if statut == StatutUtilisateur.INACTIF:
            self.db.query(UserSession).filter(
                UserSession.utilisateur_id == utilisateur.id
            ).delete()

        self.db.commit()
        self.db.refresh(utilisateur)

        log_audit(
            self.db,
            action="auth.user.statut",
            resultat="success",
            tenant_id=actor.tenant_id,
            utilisateur_id=actor.id,
            ip_address=ip_address,
            table_cible="utilisateurs",
            enregistrement_id=utilisateur.id,
            anciennes_valeurs={"statut": ancien_statut.value},
            nouvelles_valeurs={"statut": statut.value},
        )

        return UtilisateurListItem.model_validate(utilisateur)

    def change_password(
        self,
        user: Utilisateur,
        body: ChangePasswordRequest,
        current_token: str,
        ip_address: str | None,
    ) -> None:
        """Change le mot de passe de l'utilisateur connecté."""
        if not verify_password(body.ancien_mot_de_passe, user.mot_de_passe_hash):
            log_audit(
                self.db,
                action="auth.change_password",
                resultat="failure",
                tenant_id=user.tenant_id,
                utilisateur_id=user.id,
                ip_address=ip_address,
                details={"reason": "invalid_current_password"},
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mot de passe actuel incorrect",
            )

        user.mot_de_passe_hash = hash_password(body.nouveau_mot_de_passe)
        token_digest = hash_token(current_token)
        self.db.query(UserSession).filter(
            UserSession.utilisateur_id == user.id,
            UserSession.token_hash != token_digest,
        ).delete()
        self.db.commit()

        log_audit(
            self.db,
            action="auth.change_password",
            resultat="success",
            tenant_id=user.tenant_id,
            utilisateur_id=user.id,
            ip_address=ip_address,
            table_cible="utilisateurs",
            enregistrement_id=user.id,
        )

    def get_current_user_profile(
        self,
        user: Utilisateur,
    ) -> UserProfile:
        tenant = self.db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if tenant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant introuvable",
            )
        return UserProfile(
            id=user.id,
            tenant_id=user.tenant_id,
            tenant_slug=tenant.slug,
            email=user.email,
            nom=user.nom,
            prenom=user.prenom,
            role=user.role,
            statut=user.statut,
            derniere_connexion=user.derniere_connexion,
        )


def get_auth_service(db: Session) -> AuthService:
    return AuthService(db)
