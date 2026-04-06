#!/bin/bash
# Railway startup script — runs migrations, seeds demo data, starts server
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Seeding demo data..."
python scripts/seed.py

echo "Starting server..."
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
