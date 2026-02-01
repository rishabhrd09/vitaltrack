#!/bin/sh

echo "==================================="
echo "VitalTrack API Starting..."
echo "Environment: ${ENVIRONMENT:-development}"
echo "==================================="

echo "Waiting for database..."
until pg_isready -h "${DATABASE_HOST:-db}" -p "${DATABASE_PORT:-5432}" > /dev/null 2>&1; do
  echo "Database not ready yet... waiting 2s"
  sleep 2
done

echo "Database is ready!"

echo "Running database migrations..."
alembic upgrade head
echo "Migrations complete."

echo "Starting Uvicorn server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
