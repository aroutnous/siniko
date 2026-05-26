"""Modèle Role — rôles applicatifs (RBAC)."""

from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Enum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.associations import user_roles_table

if TYPE_CHECKING:
    from app.models.user import User


class RoleName(StrEnum):
    """Noms de rôles autorisés dans SINIKO."""

    ADMIN = "admin"
    DIRECTEUR = "directeur"
    SECRETARIAT = "secretariat"
    COMPTABILITE = "comptabilite"


class Role(Base):
    """Rôle métier assignable à un ou plusieurs utilisateurs."""

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[RoleName] = mapped_column(
        Enum(
            RoleName,
            name="role_name",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        unique=True,
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    users: Mapped[list["User"]] = relationship(
        secondary=user_roles_table,
        back_populates="roles",
    )
