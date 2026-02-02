#!/bin/sh

echo "==================================="
echo "VitalTrack API Starting..."
echo "Environment: ${ENVIRONMENT:-development}"
echo "==================================="

# Parse DATABASE_URL if DATABASE_HOST is not set (Railway provides DATABASE_URL)
if [ -z "$DATABASE_HOST" ] && [ -n "$DATABASE_URL" ]; then
    echo "Parsing DATABASE_URL for connection details..."
    # Extract host from DATABASE_URL
    # Format: postgresql://user:pass@host:port/dbname
    DATABASE_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
    DATABASE_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
    
    # Fallback if parsing fails
    DATABASE_HOST=${DATABASE_HOST:-localhost}
    DATABASE_PORT=${DATABASE_PORT:-5432}
    
    echo "Extracted HOST: $DATABASE_HOST, PORT: $DATABASE_PORT"
fi

# Use defaults if still not set
DATABASE_HOST=${DATABASE_HOST:-db}
DATABASE_PORT=${DATABASE_PORT:-5432}

echo "Waiting for database at $DATABASE_HOST:$DATABASE_PORT..."

# Wait for database with timeout (max 60 seconds)
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" > /dev/null 2>&1; then
        echo "Database is ready!"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Database not ready yet... attempt $RETRY_COUNT/$MAX_RETRIES, waiting 2s"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "WARNING: Could not connect to database after $MAX_RETRIES attempts."
    echo "Proceeding anyway - the app might handle reconnection..."
fi

echo "Running database migrations..."
alembic upgrade head || echo "Migration warning (might already be up to date)"
echo "Migrations complete."

echo "Starting application server..."
exec "$@"
