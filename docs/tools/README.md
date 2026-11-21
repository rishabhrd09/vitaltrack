# Documentation tooling

Small, isolated tools that build and verify the documentation. None of them is imported by the application, and none adds a dependency to `vitaltrack-backend/requirements.txt` or `vitaltrack-mobile/package.json`.

| Tool | What it does | Needs | Safe to run? |
|---|---|---|---|
| [build_docs.py](build_docs.py) | Generates HTML from the Markdown sources listed in the script’s `GUIDES` table. | `markdown==3.7` (run through `uv`) | Yes — writes only the listed `.html` files. |
| [check_docs.py](check_docs.py) | Finds broken local links, missing anchors, duplicate HTML ids, unbalanced HTML tags and missing images in every first-party `.md`/`.html`. No network requests. | Python 3.10+ | Yes — read-only. |
| [route_inventory.py](route_inventory.py) | Legacy flat-router inventory. It misses included v1 routers in the current FastAPI version. Use the CI route checker below. | Backend dependencies | Yes — imports the app; never connects to a database. |
| [api_walkthrough.py](api_walkthrough.py) | Replays the documented API examples in-process and records status codes and database rows before/after. | Backend dependencies + a **disposable local** PostgreSQL | Only against a local database whose name contains `test`: it **drops and rebuilds the schema**. It refuses any other target. |
| [../diagrams/src/build_diagrams.py](../diagrams/src/build_diagrams.py) | Regenerates the teaching diagrams. | Python 3.10+ | Yes — writes `docs/diagrams/*.svg`. |

## Typical session

```bash
# from the repository root
uv run --no-project --with markdown==3.7 python docs/tools/build_docs.py
python3 docs/tools/check_docs.py --strict
python3 docs/diagrams/src/build_diagrams.py
```

The route and walkthrough tools need the backend's Python packages. Create a separate virtual environment for them (Python 3.12 matches CI and the Docker image), install `vitaltrack-backend/requirements.txt`, then run from `vitaltrack-backend/`:

```bash
ENVIRONMENT=testing SECRET_KEY=local-docs-only-secret-key-0123456789 \
DATABASE_URL=postgresql+asyncpg://postgres@127.0.0.1:5432/carekosh_docs_test \
python scripts/check_api_routes.py --expected 65
```

For `api_walkthrough.py`, start a throwaway PostgreSQL 16 first (for example `docker run --rm -p 127.0.0.1:55432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=carekosh_docs_test postgres:16`), point `DATABASE_URL` at it, and read the safety notes at the top of the script. Never point it at staging, production or any shared database.

## What these tools do not prove

They check the documentation and replay behaviour in one local process. They do not exercise a real phone, Render's proxy, several Gunicorn workers, Neon, Brevo, Groq, Moonshine downloads or Play Store builds.
