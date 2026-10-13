# Documentation tooling

> **AI voice source update — 11 October 2026:** Android AudioRecord and Moonshine live words/offline recognition, separately opted-in Groq Whisper final transcription, reviewed Send and local/Groq bounded interpretation retain their existing wiring. Answers and unsaved drafts use validated inventory facts; only touch confirmation saves an order. Device speech stays the default. Alba selection/new downloads are paused after failed OnePlus acceptance; code and notices remain. Optional Sarvam English narration now uses separate answer-text consent, a backend-only key, fixed model/voice validation and per-reply Expo playback. Sarvam does not process microphone recordings in this path or select inventory actions. Matching staging deployment, provider credits and a new APK/phone sound test remain pending. Earlier dated evidence retains its original scope. [Sarvam activation, costs and device checks](../SARVAM_ENGLISH_VOICE.md) · [Complete voice architecture](../VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

Small, isolated tools that build and verify the documentation. None of them is imported by the application, and none adds a dependency to `vitaltrack-backend/requirements.txt` or `vitaltrack-mobile/package.json`.

| Tool | What it does | Needs | Safe to run? |
|---|---|---|---|
| [build_docs.py](build_docs.py) | Generates the HTML companions from the canonical Markdown guides (`docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md`, `docs/POCKET_TTS_ALBA.md`, `docs/SARVAM_ENGLISH_VOICE.md`, `docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md`, `docs/API_TRACEABILITY.md`, and a local audit README when present). | `markdown==3.7` (run through `uv`) | Yes — writes only the listed `.html` files. |
| [check_docs.py](check_docs.py) | Finds broken local links, missing anchors, duplicate HTML ids, unbalanced HTML tags and missing images in every first-party `.md`/`.html`. No network requests. | Python 3.10+ | Yes — read-only. |
| [route_inventory.py](route_inventory.py) | Imports the FastAPI app, lists every registered route and checks that each one has a row in `docs/API_TRACEABILITY.md`. | Backend dependencies | Yes — imports the app; never connects to a database. |
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
python ../docs/tools/route_inventory.py
```

For `api_walkthrough.py`, start a throwaway PostgreSQL 16 first (for example `docker run --rm -p 55432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=carekosh_docs_test postgres:16`), point `DATABASE_URL` at it, and read the safety notes at the top of the script. Never point it at staging, production or any shared database.

## What these tools do not prove

They check the documentation and replay behaviour in one local process. They do not exercise a real phone, Render's proxy, several Gunicorn workers, Neon, Brevo, Groq, Moonshine downloads or Play Store builds.
