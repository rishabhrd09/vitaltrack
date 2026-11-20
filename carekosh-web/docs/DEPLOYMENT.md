# Deployment and rollback

Before promoting any release, complete the pending gates in [SECURITY_AND_SCALE.md](SECURITY_AND_SCALE.md), especially trusted ingress, shared rate limits, DNS/TLS, cache isolation, and measured capacity. Frontend build success is not evidence that these hosted controls are enabled.

## Release order

1. Record the reviewed candidate SHA. Check the production Worker Git integration's build/deploy command and Render's native auto-deploy setting before relying on a manual release. The backend CI deploy hook additionally requires `ENABLE_RENDER_AUTO_DEPLOY=true` and `RENDER_DEPLOY_HOOK`.
2. Advance staging to the candidate. Match the Worker deployment and Render live revision to the affected components. Confirm the staging API uses its own database, origin secret and signing key.
3. Complete the [hosted staging checklist](STAGING_RELEASE_CHECKLIST.md). Use a staging account to sign in, edit a quantity, reload and confirm persistence. Exercise Android if the API contract changed.
4. For a shared change deploy the tested, backward-compatible API before publishing dependent clients. For a web release run **Release CareKosh web** on main. If main has advanced, test that revision before publishing. The job validates and publishes the checked assets and checks the public deployment.
5. Record the Worker version, Render commit and applicable Play version with the acceptance result. See the [Deployment Atlas](../../docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html) for rollback and component ownership.

## Layout

| Environment | Frontend | API |
| --- | --- | --- |
| Production | `https://homeicuinventory.carekosh.com` | `https://api.carekosh.com/api/v1` |
| Staging | `https://staging-app.carekosh.com` | `https://staging-api.carekosh.com/api/v1` |
| Local demo | Vite loopback URL | None |
| Local API | Vite loopback URL | `/api/v1`, proxied to local FastAPI |

Frontend assets are served by Cloudflare Workers Static Assets. Existing FastAPI services stay on Render and PostgreSQL stays on Neon. No database credentials, provider keys, email credentials, or JWT signing keys belong in the frontend or Cloudflare asset environment.

The owner confirmed that the domain is managed through Cloudflare. Verify that the `carekosh.com` zone is active in the intended account before executing any domain association. No zone ownership, billing plan, or existing DNS record was changed or assumed verified during this implementation.

## Prepare the backend first

The four `/api/v1/web-auth` endpoints are opt-in through `WEB_AUTH_ENABLED`. They reuse the same account registration, password verification, token claims, account activation checks, refresh rotation, and revocation generation as Android. Existing mobile JSON bearer-token endpoints are unchanged.

### Required ingress and shared Redis

The current backend also introduces mandatory hosted ingress and shared rate-limit settings. This applies even when browser authentication is disabled. Missing settings intentionally prevent hosted startup; deploying with the old Render environment unchanged is not a supported rollout.

Follow the [backend ingress implementation](../../vitaltrack-backend/app/services/ingress.py) on staging first:

1. Verify the API URLs used by supported installed Android releases. The current preview uses `staging-api.carekosh.com`. An APK calling a direct `*.onrender.com` URL cannot pass the proposed edge-secret boundary; resolve that endpoint migration before enforcing it.
2. Provision a separate private staging Redis and set `RATE_LIMIT_STORAGE_URI` to its credentialed connection URI. Use verified private transport or certificate-verified `rediss://`; never put this URI in a frontend variable. All workers in one environment must use the same store and namespace.
3. For the documented Cloudflare → Render topology, configure `INGRESS_MODE=edge_secret` and exact `ALLOWED_HOSTS`. Include the intended staging API hostname and, only if needed by verified health-check behavior, the exact staging Render hostname. Do not guess a hostname or allow wildcards.
4. Configure an independently generated `ORIGIN_VERIFY_SECRET` of at least 32 URL-safe characters on the staging backend and a controlled Cloudflare rule. The rule must overwrite `X-CareKosh-Origin-Verify` for that API hostname, preserve the real `CF-Connecting-IP`, enforce HTTPS and use Full (strict) origin TLS. Establish this rule before enabling the backend boundary. Android and browser clients never send this secret.
5. Retain `RATE_LIMIT_KEY_PREFIX=carekosh`, initially `MAX_INFLIGHT_REQUESTS=32` and `API_BODY_TIMEOUT_SECONDS=60`, and the production Docker command using `app.worker.CareKoshUvicornWorker`. Alternative Uvicorn launches must use `--no-proxy-headers` so application ingress checks see the socket peer.
6. Apply the browser settings below, then manually deploy staging and test Android and web together. Verify direct-origin rejection, allowed API access, shared limits and recovery from staging Redis failure before planning production. Never disable these checks merely to make a missed configuration deploy.

Production needs its own reviewed Redis, edge rule, secret and exact hosts. Staging credentials, stores and settings must not be reused for production. These instructions configure existing server boundaries; no additional Android request header or authentication transport change is required.

### Browser origins

Production browser settings (also represented in `vitaltrack-backend/render.yaml`). These complement the ingress settings above. The CORS list shown is the minimum for this app; preserve other already-authorized exact origins if the existing service has additional browser clients. Remove a wildcard before enabling browser auth:

```dotenv
ENVIRONMENT=production
WEB_AUTH_ENABLED=true
WEB_APP_ORIGINS=["https://homeicuinventory.carekosh.com"]
CORS_ORIGINS=["https://homeicuinventory.carekosh.com"]
FRONTEND_URL=https://api.carekosh.com/api/v1/auth
```

Staging settings on its separate Render service, again retaining any other required explicit staging origins:

```dotenv
ENVIRONMENT=staging
WEB_AUTH_ENABLED=true
WEB_APP_ORIGINS=["https://staging-app.carekosh.com"]
CORS_ORIGINS=["https://staging-app.carekosh.com"]
FRONTEND_URL=https://staging-api.carekosh.com/api/v1/auth
```

Retain each service's existing database, signing key, mail, AI, health-check, and runtime configuration. **FRONTEND_URL remains the backend HTML email-action base.** Changing it to the app would break existing password-reset and verification links. No database migration is introduced for browser auth: existing refresh-token device metadata identifies browser token families.

With browser auth enabled, startup rejects wildcard CORS, missing origin lists, and hosted HTTP origins. Cookie endpoints require an exact allowed Origin plus `X-CareKosh-Web: 1`, and reject cross-site fetches. Hosted refresh cookies are Secure, HttpOnly, SameSite=Strict, host-only, scoped to `/api/v1/web-auth`. Refresh JWTs never appear in browser JSON. Credentialed requests are limited to the cookie endpoints; business requests use an in-memory access token.

Web Locks serialize refresh/login/logout across same-origin tabs; BroadcastChannel clears account state on sign-out/account changes. A server-side browser family marker lets logout revoke a just-rotated child when presented with the previous cookie. A non-sensitive local sign-out marker blocks silent restoration after a failed logout. Access JWTs retain the existing short-lived bearer semantics until expiry or account session-version revocation.

## Build and stage

From `carekosh-web`:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build:staging
node scripts/verify-build.mjs staging
npm run test:hosting
npx wrangler deploy --env staging --dry-run
```

Use a Cloudflare account with the zone and a scoped deployment credential. Keep credentials in the provider/CI secret store, never in `.env.*` committed files. Inspect current `staging-app` and `homeicuinventory` DNS records, Worker routes, and Custom Domains for conflicts before association. Wrangler's custom-domain configuration lets Cloudflare manage that hostname's DNS/TLS binding; do not invent an IP address or use a Pages CNAME recipe. See [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

The following are release actions to execute only as part of an authorized launch:

```sh
npm run deploy:staging
```

Staging must pass real browser sign-in, reload restoration, simultaneous-tab refresh, logout/reload, registration/verification email, password reset, item/version conflicts, order save/retry/receive/apply, and exports. Confirm account boundaries using separate staging accounts. Test Safari and Firefox on the custom staging domain, where Secure/SameSite/CORS behavior is real; local Chromium tests do not prove that boundary.

## Publish production

Record the frontend commit/build and current Cloudflare deployment version. Complete the staging checks and confirm the current production API is healthy before:

```sh
npm run build
node scripts/verify-build.mjs production
npm run test:hosting
npx wrangler deploy --env production --dry-run
```

Publish the accepted revision in GitHub Actions → **Release CareKosh web** → **Run workflow** on main. The environment guard refuses a production build containing the staging API or demo mode. Both hosted environments disable workers.dev and version-preview URLs. A workers.dev origin is intentionally not allowed to call the cookie API. Do not add wildcard preview origins to work around this.

Verify certificate/HTTPS, the exact API host in browser requests, credentialed preflight, cookie flags, deep-link reloads, and JSON/print exports. Test `/inventory`, `/orders/<id>`, `/item/<id>`, all auth routes, and a nonexistent `/assets/missing.js`. Explicit `_redirects` proxy rules serve the SPA document only for known application paths. Unrecognized assets return 404. Hashed build assets receive immutable caching only for filenames actually in the build; HTML revalidates. Security headers include CSP, no framing, no sniffing, no referrer, and no indexing. [Static Assets routing](https://developers.cloudflare.com/workers/static-assets/redirects/) and [headers](https://developers.cloudflare.com/workers/static-assets/headers/) document the mechanisms used.

HTML handling is explicitly disabled in each Wrangler environment so the `/index.html` proxy target does not redirect deep links back to `/`. The root URL has its own explicit rewrite. `npm run test:hosting` starts a temporary loopback Wrangler server, checks responses with automatic redirect following disabled, and stops the server afterward. See [Cloudflare HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).

## Domain scope

The production hostname selected on 27 October 2026 is `homeicuinventory.carekosh.com`. Staging remains `staging-app.carekosh.com`. Only these two Custom Domain associations are declared in Wrangler. The local production environment, build allowlist, landing-page links, and Render Blueprint origin examples use the new production hostname. No hosted setting was changed.

| Visitor address | Intended behavior | Status |
| --- | --- | --- |
| `carekosh.com` | Landing page; Get Started and Sign In link to the canonical app | Links prepared locally; release deferred |
| `www.carekosh.com` | Public-site entry point; serve the landing page or use its reviewed apex redirect | Inspect existing hosting/routing before changing it |
| `homeicuinventory.carekosh.com` | Canonical production app | Local configuration ready; DNS/TLS/deployment deferred |
| `www.homeicuinventory.carekosh.com` | Redirect to the canonical app, preserving path and query string | Future edge configuration; not provisioned or tested |

The landing page uses absolute app links, so the same production page works from `carekosh.com` or `www.carekosh.com`. The public-site origins do not need permission to call the API merely to link to the app.

For the future app alias, configure DNS/TLS for the exact `www.homeicuinventory.carekosh.com` hostname and an edge redirect whose host match is restricted to that alias. For example, `/login?next=%2Finventory` must become `https://homeicuinventory.carekosh.com/login?next=%2Finventory`. Keep sign-in on the canonical origin; do not add the redirect-only alias to `WEB_APP_ORIGINS` or `CORS_ORIGINS`. [Workers Static Assets redirects](https://developers.cloudflare.com/workers/static-assets/redirects/) do not support domain-level redirects, so do not add a blanket `/*` redirect to the app artifact. Verify the alias certificate, path/query preservation, and absence of redirect loops during later hosted acceptance.

Preserve existing privacy, account-deletion, support, and email-action paths and query strings. Do not blanket-redirect the apex to the app. Preserve existing API records, MX, SPF, DKIM, DMARC, email routing, Brevo verification, and unrelated subdomains. No nameserver transfer or mail migration is required by this frontend.

## Rollback

Use Cloudflare's deployment history to roll the affected Worker back to the recorded good version, or rebuild/redeploy the known-good commit with that environment's public settings. Keep the production API host and cookie origin stable. If browser auth must be disabled, set `WEB_AUTH_ENABLED=false`; Android bearer endpoints continue working. Do not rotate the existing JWT signing key or change FRONTEND_URL as a frontend rollback.

If a new Custom Domain association was created, restore the captured before-state for that hostname only. Keep the last good deployment available while verifying DNS/TLS. Database rollback is not part of this frontend release.

## Known launch work

The code and local checks are complete. Cloudflare account/zone access, current DNS conflict inspection, hosted TLS/SameSite checks, staging email delivery and real provider consent checks, and production release approval remain external launch steps. Nothing has been published by this task.

As of the 25 October 2026 follow-up, both existing API health endpoints returned 200 with the expected environment and connected database. The then-planned `app.carekosh.com` and `staging-app.carekosh.com` did not resolve from this machine, Wrangler was not authenticated, and no Render deployment credential was configured. Those historical observations do not establish current health or DNS for the newly selected hostname. The staging build, 14 frontend tests, lint/typecheck, local Cloudflare routing checks and staging deployment dry-run passed again in that earlier session. The owner chose to deploy later; no hosted acceptance test is recorded as passed. See the checklist for the remaining release gate.

### Local release safeguards — 27 October 2026

`npm run build:staging` writes and verifies `dist-staging/`; `npm run build` writes and verifies `dist-production/`. Wrangler's environments point at those distinct directories. The root local hosting emulator serves the production artifact for header and routing checks. Demo builds continue to use `dist/`.

`npm run deploy:staging` and `npm run deploy:production` now run type checks, lint, unit tests, environment build guards, the matching build, and artifact verification before publishing. These commands are for a later approved release; adding the safeguards does not deploy anything. Do not bypass them with a raw Wrangler publish command.

`routes.json` supplies the application route paths, generated `_redirects`, and local hosting probes. Add routes there when introducing a screen. Both hosted environments are tested against invalid API, environment, demo mode, and unexpected public settings. No build test proves the absence of all possible secrets; inspect code and artifacts too.

### Local hostname verification — 27 October 2026

After selecting `homeicuinventory.carekosh.com`, typecheck, lint, all 84 unit tests, the existing build guards, both hosted-mode builds and their artifact checks passed locally. The 19 demo/mocked-API browser tests passed; no live API test was run. The local Workers emulator passed 20 deep-link and four missing-path checks plus security/cache header checks. All three landing-page builds passed their link/asset checks, and all nine account links in each build use its intended environment. Production links resolve to the canonical app when the public page is based at either `carekosh.com` or `www.carekosh.com`.

The production landing page was also checked locally at 320, 390 and 1440 CSS pixels: the longer hostname fits, the screenshot control remains 44 pixels wide, and there is no horizontal page overflow. The former app origin and redirect-only `www` app alias were both rejected by the production build guard. Staging settings and API targets remain unchanged; the local Render Blueprint update changes only its two production browser-origin values. These checks do not activate DNS, validate hosted sessions, or provision either `www` address.
