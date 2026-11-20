# CareKosh security and growth foundation

Reviewed 25 October 2026. This is an implementation record and a release gate, not a certification or a claim of attack-proof operation. No public deployment, DNS change, production load test, or hosted security setting change was made in this work.

## Boundaries and responsibilities

| Layer | Responsibility | Current status |
| --- | --- | --- |
| `carekosh.com` | Public static product page and local screenshots; no account data or API calls | Implemented locally; deployment deferred |
| `homeicuinventory.carekosh.com` | Responsive browser interface, input handling, session isolation, bounded requests | Implemented and locally checked |
| Cloudflare edge | TLS, DDoS mitigation, WAF, API abuse limits, DNS integrity, static caching | Configuration and hosted evidence still required |
| Existing FastAPI service | Authentication, authorization, account ownership, validation, version checks, transactions and authoritative limits | Existing implementation; focused compatibility tests recorded in VERIFICATION.md |
| PostgreSQL and hosting | Durable data, backups, connection budgets, shared coordination, recovery and capacity | Local behavior checked; hosted operational evidence still required |

Client-side checks improve safety and user experience. Attackers can bypass a browser entirely, so authorization, account ownership, payload limits and abuse controls must also be enforced by the API and edge. This follows the boundary described in the [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html).

## Implemented frontend controls

| Control | Implementation / evidence |
| --- | --- |
| Account credentials | Access token stays in module memory. Refresh is cookie-only. No real inventory, orders, tokens, or account profiles are persisted to Web Storage. Demo storage is excluded from hosted builds. |
| Browser session | Refresh is single-flight and coordinated across tabs with Web Locks. Account changes abort requests and clear query/draft state. Cross-tab sign out invalidates access. Failed server logout leaves a local signed-out marker. |
| Existing browser-auth boundary | API source checks exact Origin and `X-CareKosh-Web`, rejects cross-site browser auth, uses host-only HttpOnly/SameSite=Strict cookies, and enables Secure in staging/production. Hosted enforcement must still be verified. |
| Request destination | Build-time API/origin allowlist; relative API path validation; `redirect: error` prevents silently following API redirects. `credentials: omit` for bearer requests; credentials included only for browser-auth routes. |
| Request privacy | `cache: no-store`, `referrerPolicy: no-referrer`, no telemetry SDK or third-party fonts. Passwords are cleared after successful registration/reset; consumed web verification/reset tokens are removed from the current history entry. Mail links handled by the backend retain their existing behavior. |
| XSS and links | React text rendering; no `dangerouslySetInnerHTML`. Printable fields are HTML-escaped, image protocols restricted, and print windows have their opener removed. Regression tests include hostile item names and order IDs. |
| Response bounds | JSON content type required; a 5 MiB decoded response limit applies even without Content-Length. HTML challenge pages are not accepted as successful API data. Generic 5xx messages avoid displaying server diagnostics. |
| Overload behavior | 30-second request deadline; abort on session changes. 429/503 honor Retry-After with a visible wait message and an in-tab cooldown; logout can still be attempted. Missing/invalid Retry-After defaults to 30 seconds, parsed values are bounded to 1–86,400 seconds. |
| Retry discipline | Reads retry a network failure at most once, after 1–2 seconds of jitter. HTTP errors are not automatically retried. A single 401 can replay after successful refresh. Mutations have no generic automatic retry. Unknown order submissions require confirmation and reuse the original idempotency key/payload. |
| Pagination safety | 100 records per API page, sequential page requests, at most 10,000 items or orders in the current complete-workspace model. Invalid/changing totals, incomplete results and oversized workspaces fail explicitly. No partial backup or bulk-operation review is silently accepted. Sibling loads abort when a workspace load fails. This is a browser safety bound, not a demonstrated capacity figure. |
| Hosted response headers | CSP, nosniff, frame denial, no-referrer, same-origin opener/resource policies, disabled camera/microphone/geolocation/payment/USB permissions, and host-only HSTS. Browser app has no microphone dictation at present. HSTS does not add includeSubDomains or preload. |
| Build isolation | Production/staging must match their declared environment, API host, app origin and API data mode. Unexpected public `VITE_` keys fail the build. No source maps or demo repository ship. Development helper pages are not build entries. |
| Delivery checks | Locked npm dependencies, audit failure at high/critical severity, typecheck/lint/tests, build guards, artifact inspection, local hosting checks, bounded CI runtime and concurrent-run cancellation. CI has read-only repository permissions and does not retain checkout credentials. No automatic production deployment is configured. |

Session storage choices follow [OWASP HTML5 guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html). Static headers use Cloudflare's [_headers mechanism](https://developers.cloudflare.com/workers/static-assets/headers/). The app permits inline **styles** for React layout and printable reports; scripts remain self-hosted, with no inline script attributes or eval. External HTTPS item images remain supported, so they can contact their image hosts when explicitly displayed/printed. A future first-party image service can narrow this policy further.

## Required before a public release

The following are pending gates. They are not enabled merely by building the frontend.

1. **Account and DNS ownership:** verify the actual registrar and authoritative DNS service; use MFA, least-privilege deployment tokens, recovery access and change history. Enable DNSSEC and validate its DS chain through the registrar. Do not guess or replace existing DS records. DNSSEC authenticates DNS answers; it does not replace DDoS mitigation. [Cloudflare DNSSEC documentation](https://developers.cloudflare.com/registrar/get-started/enable-dnssec/).
2. **Cloudflare edge:** verify traffic is proxied through the intended zone; inspect available DDoS managed protections and WAF/rate-limiting capabilities for the account's plan. Use staged rules and inspect false positives before enforcement. Do not blanket-enable browser challenges on API routes used by Android. API clients should receive controlled JSON 429/503 responses and Retry-After. Preserve OPTIONS/preflight and existing mobile authentication. [DDoS managed rules](https://developers.cloudflare.com/ddos-protection/managed-rulesets/), [rate-limiting practices](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/).
3. **Origin and proxy trust — implemented locally; hosted evidence required:** the backend now authenticates ingress metadata before using client identity, checks exact hosts, rejects ambiguous forwarding chains, and uses a Gunicorn worker that preserves the socket peer. Cloudflare/Render can use an edge-injected secret; a controlled proxy can use explicit trusted CIDRs. Configure and prove staging before enforcement. Confirm API URLs in supported installed Android releases before blocking direct-origin traffic. See [backend ingress implementation](../../vitaltrack-backend/app/services/ingress.py).
4. **Shared abuse limits — implemented locally; Redis provisioning required:** hosted startup requires shared Redis. Counters are namespaced by environment, browser/native login and registration share quotas, and AI retains account keys and PostgreSQL budgets. Store failure returns 503 with Retry-After and no local fallback. Tests use real Redis across separate processes and worker restarts. Configure private transport, persistence, noeviction, monitoring and recovery; local tests do not prove hosted failover.
5. **API admission limits — implemented locally; staging calibration required:** requests have the existing body caps, a new 60-second ordinary upload deadline and a per-worker admission bound (32 by default). Excess work returns 503 with Retry-After. AI keeps its tighter caps. Liveness stays independent and does not buffer bypass bodies. These are not a network DDoS defense or a measured capacity guarantee. Validate slow mobile use, NAT/shared IP quotas, database deadlines and overload recovery on staging; Android sync has no new blanket quota.
6. **HTTPS and cache isolation:** verify certificates, strict origin TLS, exact browser origins, Secure refresh-cookie scope, same-site behavior and blocked untrusted origins on actual staging hostnames. Never cache `/api/v1/*`, authenticated responses, Set-Cookie responses, or account-specific data at the edge. Cache only public static assets; fingerprinted app assets can be immutable and HTML must revalidate.
7. **Data and operations:** verify secret handling, least-privilege database access, encrypted transport, backup retention, a demonstrated restore, migrations/rollback, error alerts, log redaction and an incident owner. Logs must not include passwords, tokens, complete request bodies or inventory contents. Validate email verification/reset delivery and online Coach consent/provider budgets independently.
8. **Device and security acceptance:** test Android and browser sessions simultaneously, cross-account access denial, stale versions, duplicate order retries, logout races and rate-limited recovery. Test Chrome, Safari/iOS and Firefox on devices. CSS viewport tests are not native WebView certification; embedded WebViews must support HTTPS and Web Locks or the app deliberately refuses unsafe session coordination.

## Growth path without a rewrite

- Keep the public site and browser build independent of API deployments. Cloudflare can serve public static resources without sending every page visit to FastAPI. Do not proxy private API data through a cacheable static route.
- Preserve the repository boundary in `src/services/workspace.ts` and pure rules under `src/domain`. These allow server-side search/pagination or a different transport without rewriting the views' business rules.
- Before large individual workspaces, replace full-workspace refreshes with server-filtered/cursor-paginated inventory/order views and server aggregates. Introduce a snapshot/revision contract for exports and destructive reviews. Do not simply increase the browser record cap or silently truncate data.
- Use measured endpoint latency, request rate, 429/5xx rate, active database connections, query time and queue depth to set capacity targets. Starting database defaults are pool size 5 plus overflow 10 **per process**; two workers can consume 30 connections before additional replicas or jobs. Budget the whole deployment against the database connection limit before scaling worker count.
- Make distributed rate limits and idempotency authoritative before adding API replicas. Move slow email/export/provider jobs to bounded workers with idempotent retries and dead-letter handling when measurements justify it. Keep the UI's save receipt distinct from later background work.
- Add caching only for proven hotspots with account-scoped keys, authorization checks and explicit invalidation. Prefer database indexes and query improvements before extra infrastructure.
- Run a stepped staging load test with synthetic accounts and owner-approved limits. Record read/write mix, concurrent users, duration, p50/p95/p99 latency, database saturation, errors and recovery after overload. Set acceptance thresholds before the test. No maximum supported user count or DDoS resistance has been established by this local verification.

## Maintenance and evidence

Review dependencies and advisory output with each change; keep the lockfile reviewed. Changes to auth, order recovery, export rendering or API policy require the corresponding regression suites. Re-run environment/build/hosting checks for every release and inspect the generated headers in the deployed environment. Update this document when an operational gate has evidence; do not mark a planned control as implemented.

Run from `carekosh-web`:

```sh
npm run typecheck
npm run lint
npm test
npm audit --audit-level=high
npm run test:build-guards
npm run build:staging && node scripts/verify-build.mjs staging
npm run build && node scripts/verify-build.mjs production
npm run test:hosting
```

Run `npm run check` from `carekosh-site`. See [VERIFICATION.md](VERIFICATION.md) for actual results and [DEPLOYMENT.md](DEPLOYMENT.md) for the staging and manual production release process. No hosting or backend capability should be inferred from a passing frontend build.
