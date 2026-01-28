#!/bin/bash
# VitalTrack Backend - Docker Entrypoint
# Runs database migrations before starting the application

set -e

echo "========================================"
echo "VitalTrack Backend Starting..."
echo "Environment: ${ENVIRONMENT:-development}"
echo "========================================"

# Wait for database to be ready
echo "Waiting for database..."
while ! pg_isready -h ${DATABASE_HOST:-db} -p ${DATABASE_PORT:-5432} -U ${DATABASE_USER:-postgres} -q; do
    echo "Database not ready, waiting..."
    sleep 2
done
echo "Database is ready!"

# Run Alembic migrations
echo "Running database migrations..."
alembic upgrade head
echo "Migrations complete!"

# Start the application
echo "Starting application server..."
exec "$@"
