"""Configuration Alembic — migrations synchrones (psycopg2)."""

import os
from logging.config import fileConfig

from alembic import context
from app.db.base import Base
from sqlalchemy import engine_from_config, pool

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_database_url() -> str:
    """Retourne l'URL synchrone pour Alembic (variable d'environnement)."""
    url = os.getenv(
        "ALEMBIC_DATABASE_URL",
        "postgresql+psycopg2://siniko:siniko@localhost:5432/siniko",
    )
    return url


def run_migrations_offline() -> None:
    """Exécute les migrations en mode hors ligne."""
    context.configure(
        url=get_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Exécute les migrations avec connexion active."""
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_database_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
