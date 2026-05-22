#!/bin/sh
set -e

echo "SINIKO — application des migrations Alembic..."
alembic upgrade head

echo "SINIKO — démarrage de l'API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
