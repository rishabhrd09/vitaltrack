# CareKosh — Home ICU Inventory

Your home care supplies, organized.

A responsive web companion to the Android home ICU inventory app. React, TypeScript, Vite, TanStack Query, React Router, Lucide icons, and locally served Inter. Dark and light appearances share the CareKosh palette and original brand assets.

## Run the local demo

Node 24 and npm are the tested toolchain.

```sh
cd carekosh-web
npm ci
npm run dev:demo
```

Open the URL printed by Vite (normally `http://127.0.0.1:5173`). The delivered preview uses **http://127.0.0.1:5174** because port 5173 was occupied. The demo starts signed in as a fictional caregiver. It supports item/category editing, order creation, receipt and stock application, Coach drafts, exports, and preferences. Demo records persist only in this browser. No live API request is made in demo mode.

For visual checks, open `/scripts/responsive-preview.html` on the same demo server. It provides all 18 app routes, including account recovery, activity, item/order details, and the missing-page state, at 320, 390, 768, 1024, and 1440px. Its horizontal-overflow readout also checks open dialogs. Detail shortcuts use fictional demo IDs. This development helper is outside `public/` and is not included in the production build.

## Connect to a local backend

Deploy the additive backend changes in this checkout before using browser authentication. Android bearer endpoints remain supported.

Run the backend with a disposable local database for development and these additional settings:

```dotenv
ENVIRONMENT=development
WEB_AUTH_ENABLED=true
WEB_APP_ORIGINS=["http://127.0.0.1:5173"]
CORS_ORIGINS=["http://127.0.0.1:5173"]
```

Keep the backend's existing DATABASE_URL, SECRET_KEY, and email configuration in its private environment. Never place them in Vite variables. Then:

```sh
npm run dev:api -- --port 5173 --strictPort
```

Vite proxies `/api` to `http://127.0.0.1:8000`. To use another local backend port:

```sh
CAREKOSH_DEV_API_TARGET=http://127.0.0.1:8019 npm run dev:api -- --port 5189 --strictPort
```

For that command, allow exactly `http://127.0.0.1:5189` on the backend. Use one hostname consistently; `localhost` and `127.0.0.1` are different origins. API mode starts at sign-in and never switches to sample data on a network error. Public `.env.production` and `.env.staging` contain only host configuration.

## Verification

For an interactive phone preview while the demo server is running on port 5174, open `http://127.0.0.1:5174/scripts/mobile-flow-preview.html?start=/`. It offers 320, 390 and 414px widths and a short-height check. The Start at landing page button opens the separate local site on port 5175 inside that frame; its real Get Started and Sign In links lead back to the app. This helper is development-only and is excluded from production builds.

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build:staging
node scripts/verify-build.mjs staging
npm run build
node scripts/verify-build.mjs production
npm run test:hosting
WRANGLER_SEND_METRICS=false npx wrangler deploy --env production --dry-run
```

The live API browser test is opt-in and uses only the documented disposable local services on ports 5189 and 8019:

```sh
CAREKOSH_LIVE_API_TEST=1 npm run test:e2e -- live-api.spec.ts
```

It creates fictional test accounts. Never point this test at a shared/staging/production database. Backend integration tests also require an explicitly disposable PostgreSQL database and drop/recreate its tables; see the backend test safety guard.

## Production build and hosting

The canonical app target is **https://homeicuinventory.carekosh.com**. Cloudflare Workers Static Assets serves the frontend; the existing Render API and Neon database remain in place. `npm run build` produces the production API configuration, not the demo. Staging uses `https://staging-app.carekosh.com` and its own API.

The public landing page at `carekosh.com` can also be served through `www.carekosh.com`; its production Get Started and Sign In links point to the canonical app. The optional `www.homeicuinventory.carekosh.com` address is planned as a redirect preserving the path and query string. Its DNS, certificate and edge redirect remain deferred; it is not a second browser-auth origin. See the domain scope in the deployment guide.

`wrangler.jsonc`, generated security/cache headers, explicit SPA rewrites, and a static 404 page are included. The build rejects mismatched API/origin/demo environment combinations. Sample records are excluded from hosted builds. There is no service worker caching authenticated data.

See [deployment and rollback](docs/DEPLOYMENT.md), [Android parity](docs/PARITY.md), and [verification](docs/VERIFICATION.md). **No public deployment or DNS change has been performed.**

## Source map

- `src/pages`: dashboard, inventory, builder, item editor, order cart/history/detail, account, and authentication.
- `src/components`: application shell, dialogs, category management, and CareKosh.
- `src/domain`: stock rules, exact starter catalog, and adapted pure Android assistant logic.
- `src/services`: typed API adapters, browser session coordination, exports, and builder operations.
- `src/demo`: isolated fictional fixture repository; production aliases exclude it.
- `src/styles/readability.css`: landing-page-aligned typography and spacing, scoped to account screens, the dashboard, and shared workspace navigation.
- `src/styles/workspace.css`: the same reading scale for inventory, orders, category management, profile settings, activity history, and their forms. Narrow screens reflow rows while retaining stock minimums, order dates, and statuses.
- `src/styles/overlays.css`: shared dialog typography and touch targets, CareKosh prompts and results, and Help & Support cards. Dialogs stay within the viewport, with reachable close buttons and wrapping content on small screens.
- `tests`: domain/session regression tests and browser workflows.

## Browser adaptations

Ask CareKosh is text-only on desktop and mobile web. It works locally against loaded inventory; optional online interpretation uses the existing capability/consent API and sends questions only after explicit consent. The web UI has no microphone, dictation or read-aloud controls and does not call browser speech APIs. Voice assistance remains an Android feature.

The API has no durable browser image-upload endpoint. Existing HTTPS photos can be viewed and printed; there is no pretend upload. Printing opens an escaped report and uses the browser's Print / Save as PDF dialog. A blocked popup is reported, and a saved order can be reprinted without creating another one.

Account data and access tokens stay in memory. Refresh tokens use a scoped HttpOnly cookie. Only appearance, a non-sensitive sign-out marker, and explicitly fictional demo data use browser storage. Keep an order tab open while an uncertain save is being resolved; its submission identity and unsaved draft are intentionally kept in memory.
