# CareKosh backend

FastAPI serves the Android app and browser app. Both clients use the same owner-scoped inventory, order and activity data in PostgreSQL. Start the API and database with the [local quick start](../docs/NEW_DEVELOPER_QUICKSTART.md). It includes browser authentication, Docker startup and a check that the database schema matches the checkout.

## Follow a request

| Open this file | Question it answers |
| --- | --- |
| [Application entry point](app/main.py) | Where are routers and middleware installed? What does the readiness check query? |
| [API dependencies](app/api/deps.py) and [database sessions](app/core/database.py) | How does a handler obtain the current user and async SQLAlchemy session? Where does a transaction commit or roll back? |
| [Item schema](app/schemas/item.py) and [item handlers](app/api/v1/items.py) | What input can the client send? How do ownership and version checks prevent an old edit overwriting a newer one? |
| [ORM models](app/models/) and [Alembic revisions](alembic/versions/) | How are objects stored, and how does an existing database reach the schema the code expects? |
| [Mobile auth](app/api/v1/auth.py) and [browser auth](app/api/v1/web_auth.py) | Where do authentication flows differ? Browser refresh uses a host-only HttpOnly cookie and the handler checks the request origin. |
| [Settings](app/core/config.py) and [Render blueprint](render.yaml) | Which values are validated on startup? Which settings must the hosting service supply privately? |

For a worked example, trace an existing item’s Save operation. The client sends the version it opened. The update checks the owner and version, increments the version, and records activity and audit data in the transaction. A stale version can produce HTTP 409. Reload the item and review the new quantity before retrying. [Stock-edit walkthrough](../docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#stock-edit) · [FastAPI concepts and examples](../interview/backendfastapi.html) · [Authentication and security](../interview/authsecurity.html)

## Test a backend change

The integration fixtures drop and recreate tables. Use a fresh disposable **local** database. For example, with the dev Compose stack running, issue this command once from `vitaltrack-backend/` to create a separate database for your tests.

```sh
docker compose -f docker-compose.dev.yml exec db createdb -U postgres carekosh_local_test
```

On a machine with Python 3.12 and FFmpeg, open a terminal in this directory. The commands below use a POSIX shell. On Windows use the equivalent virtual-environment activation and environment variables in your shell.

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
export ENVIRONMENT=testing
export DATABASE_URL=postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/carekosh_local_test
export SECRET_KEY=local-test-only-key-for-disposable-database
export RATE_LIMIT_STORAGE_URI=memory://
python -m pytest tests/test_items.py -q
```

Run Ruff and the full suites before changing a shared contract. CI exercises both a schema created from models and a schema built by applying migrations. It supplies a separate disposable Redis service through `TEST_REDIS_URL` for integration cases. Use the workflow for the full commands, coverage thresholds and route checks. [Backend CI](../.github/workflows/ci.yml) · [Fixture safeguards](tests/conftest.py)

## Deploy and diagnose

- **Local Docker.** The [dev Compose file](docker-compose.dev.yml) starts PostgreSQL and the reloadable API. Compare `alembic current` with `alembic heads` inside the container. The [Docker guide](DOCKER_GUIDE.md) explains ports, volumes and networking.
- **Hosted API.** The production [container entrypoint](docker-entrypoint.sh) stops startup if the migration fails. Inspect the Render Live commit, service-specific configuration and database identity on staging before promoting a compatible revision. [Release workflow](../docs/GIT_WORKFLOW_GUIDE.md)
- **Health.** `GET /live` checks the running process. `GET /health` also checks database connectivity. Test the actual authenticated journey as well, since these endpoints do not exercise session refresh or an inventory write. [Deployment and rollback](../docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#operate)
