# Run CareKosh locally

From a fresh clone, choose the client you need. The browser demo only needs Node.js 24 and npm. For a saved change shared between clients, start Docker and run the local API. Use fictional accounts and inventory.

## Explore the browser demo

From the repository root, run the following in a terminal.

```sh
cd carekosh-web
npm ci
npm run dev:demo
```

Open the URL Vite prints. Change a fictional item and reload. This exercises the UI and browser storage. To test authentication or database persistence, stop the demo and use API mode below.

## Start the local API

Install Docker with Compose and start its engine. In a new terminal at the repository root, switch to the backend directory. For Android alone, the default dev configuration is sufficient.

```sh
cd vitaltrack-backend
docker compose -f docker-compose.dev.yml up --build -d
```

**For browser API mode**, the backend also needs browser authentication and an exact allowed origin. In the same directory, save the following as a local file named `compose.browser.local.yml`. Keep this override out of your commit.

```yaml
services:
  api:
    environment:
      WEB_AUTH_ENABLED: "true"
      WEB_APP_ORIGINS: '["http://127.0.0.1:5173"]'
      CORS_ORIGINS: '["http://127.0.0.1:5173"]'
```

```sh
docker compose -f docker-compose.dev.yml -f compose.browser.local.yml up --build -d
```

The dev image waits for PostgreSQL and runs Alembic before launching Uvicorn. Check that the database revision reported by `current` matches `heads` in this checkout, then open the local [readiness endpoint](http://localhost:8000/health) and [interactive API docs](http://localhost:8000/docs). Readiness should report a connected database and the development environment.

```sh
docker compose -f docker-compose.dev.yml exec api alembic current
docker compose -f docker-compose.dev.yml exec api alembic heads
```

If the container starts but the revisions differ, inspect `docker compose -f docker-compose.dev.yml logs api` for a migration error. The dev entrypoint can continue after a failed upgrade. Compose publishes ports 8000 and 5432 on the host. Use a trusted local network. [Dev Compose configuration](../vitaltrack-backend/docker-compose.dev.yml) · [Dev image entrypoint](../vitaltrack-backend/Dockerfile.dev)

## Connect the browser to FastAPI

In a new terminal at the repository root, run the following. Skip the install if you already ran it for the demo.

```sh
cd carekosh-web
npm ci
npm run dev:api -- --port 5173 --strictPort
```

Open `http://127.0.0.1:5173`. Keep this exact hostname and port so the origin matches the backend configuration. Vite forwards `/api` to the local API on port 8000. Register a local account and sign in. With the default local Compose settings and no mail credential, email verification does not block login. [Browser configuration](../carekosh-web/vite.config.ts) · [Browser authentication checks](../vitaltrack-backend/app/api/v1/web_auth.py)

## Connect an Android phone

Use Node.js 22, npm and an Expo Go build compatible with the SDK pinned in the [mobile package](../vitaltrack-mobile/package.json). From the repository root, run `bash setup-local-dev.sh` on macOS/Linux or `setup-local-dev.bat` on Windows. This installs mobile dependencies and prepares local environment files. Check `vitaltrack-mobile/.env` if you have changed Wi-Fi since setup. Its `EXPO_PUBLIC_API_URL` must point to your laptop’s LAN IP and port 8000.

```sh
cd vitaltrack-mobile
npm start
```

With the phone on the same network, open the laptop’s `/health` URL on the phone, then scan Metro’s QR code in Expo Go. For USB, use the [ADB instructions](USB_ADB_REVERSE_GUIDE.md). Features that depend on custom native code, including the microphone listener, need an installed native build. The [preview APK](../vitaltrack-mobile/eas.json) uses the staging API.

## Verify one real write

1. In browser API mode or the connected local Android client, create a test item with quantity 10. Reopen it, set the quantity to 8 and save.
2. Reload or refetch. The item should still show 8. If testing both clients, sign into the same account on the same local API and refresh the other client.
3. Follow the [stock-edit walkthrough](deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#stock-edit) to find the request, version check and commit. For example, an editor that submits an old version should receive HTTP 409.
4. Before opening a PR, run the [checks for your change](GIT_WORKFLOW_GUIDE.md). The backend pytest fixtures drop and recreate tables. Give them a separate disposable PostgreSQL database whose name contains `test`. Keep your development data in its own database. [Test database guard](../vitaltrack-backend/tests/conftest.py)

To stop the API and database while retaining local data, run `docker compose -f docker-compose.dev.yml down` from `vitaltrack-backend/`. Stop Vite or Metro with Ctrl+C.
