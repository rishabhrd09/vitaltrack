# Hosted staging release acceptance

Use a fresh copy of this checklist for each release candidate. Record the results in the PR or release record, alongside the Git SHA. The [change workflow](../../docs/GIT_WORKFLOW_GUIDE.md) explains when to run these checks.

## Record before acceptance

| Field | Value to record |
| --- | --- |
| Frontend source revision / Cloudflare deployment version | Pending |
| Staging backend revision / Render deployment | Pending |
| Staging and production database identities verified distinct | Pending; record identifiers only, never credentials |
| Staging migration head and pending revision review | Pending |
| Production previous revision and rollback compatibility | Pending |
| Test account A and test account B | Controlled staging accounts; do not store passwords here |
| Android client revision / APK and embedded backend | Pending |
| Browser/device/version and test date | Pending |

## Required hosted checks

For hosted release acceptance, record the result and evidence for each required row. Use `https://staging-app.carekosh.com` with `https://staging-api.carekosh.com`; use fictional records and email inboxes controlled by the testers.

Before any later backend rollout, confirm that `REQUIRE_EMAIL_VERIFICATION=true`
has a nonblank `MAIL_PASSWORD` (Brevo API key). The backend now refuses hosted
startup otherwise, including when browser auth is disabled. Do not disable
verification to bypass a missing credential. The guard checks presence only;
successful delivery to a controlled inbox remains a separate acceptance check.
See [the local guard verification](../../vitaltrack-backend/docs/HOSTED_EMAIL_STARTUP_GUARD.txt).

| Area | Test and required result |
| --- | --- |
| Domain and TLS | Valid HTTPS; direct navigation and reload retain `/inventory`, `/orders/<id>`, `/item/<id>` and authentication URLs with query strings. Missing assets return 404. No blanket apex redirect. |
| Environment | App starts at real sign-in; network requests use only the staging API. No production host or fictional demo fallback appears on errors. |
| Browser auth | Register, receive/complete verification, sign in, reload and remain signed in, allow access-token expiry/refresh, sign out, reload and remain signed out. Unverified/disabled accounts receive the expected rejection. |
| Cookies and CORS | Browser refresh cookie is `__Secure-carekosh_refresh`, HttpOnly, Secure, SameSite=Strict, host-only for the staging API, path `/api/v1/web-auth`. Refresh JWT is absent from JSON and browser storage. Credentialed preflight allows only approved origins and requested headers. Disallowed origins fail. |
| Multiple tabs | Open two tabs, refresh simultaneously, switch accounts and log out. No stale account data appears; sign-out reaches both tabs; no unexpected rotation failures. |
| Account isolation | Create data in A, sign out and sign into B. B cannot see A's inventory, orders or activity; protected direct links cannot bypass ownership. |
| Email and profile | Password reset email uses the staging backend HTML action URL, completes successfully, and applies expected session invalidation. Profile edits, password change, deletion-request email and cancellation behave as documented. Exercise final account deletion only on a disposable account explicitly approved for deletion. |
| Inventory | Create/edit/delete an item; verify quantity, minimum, units, critical flags, optional fields and category assignment. Search/filter/sort and deep links work. A stale edit from another tab gets a conflict rather than overwriting newer stock. |
| Builder | Add defaults, restore missing catalog suggestions, create/delete an allowed category, protect default categories, bulk-delete, Start Fresh and replace defaults. Backup downloads occur before destructive operations. Only disposable staging inventory is used. |
| Orders | Regular/emergency drafts, quantities without minimums, invalid quantities, save confirmation, saved history, status actions, receipt and stock application all match Android rules. Retry an uncertain save without creating duplicates. Apply twice and verify stock increments once. Concurrent stock/order changes produce actionable conflicts. |
| Coach | Local questions answer from loaded inventory; draft preparation does not save an order or change stock. Exercise online interpretation only with explicit test consent and a configured staging provider. No provider success is inferred from a local draft. |
| Export/print | Inventory JSON and workspace backup include expected data; printable inventory/order reports open, escape user text and handle blocked popups. Reprinting does not create a new order. |
| Offline/server failure | Disconnect network or use browser request blocking. Last-loaded state is labelled, writes fail visibly, no automatic demo fallback occurs, and reconnect recovers. No fault is injected into a shared service. |
| Android compatibility | Use a staging-configured build corresponding to the Android client currently shipped. Test login, token refresh, inventory CRUD, order creation/receive/apply, exports and relevant Coach flows against the new staging backend. If the existing production APK embeds the production URL, it cannot be used for staging simply by changing the Play track; use the matching client revision with the preview configuration. |
| Cross-client account | With one staging account, change inventory in the web app and refresh Android, then reverse. Receive/apply an order from one client and verify the other sees a single stock increment. Web logout must not revoke an unrelated Android refresh session. |
| Browsers/accessibility | Chromium, Firefox and Safari; keyboard navigation, visible focus, dialogs, errors, mobile/tablet layouts and both themes. Record actual devices; do not infer Safari compatibility from Chromium. |
| Production baseline | Read-only production health remains healthy throughout staging. Staging deployment must not change production DNS, Render environment groups, database, signing key or Android build configuration. |

## Useful public checks after staging deployment

```sh
curl --fail --silent --show-error https://staging-api.carekosh.com/health
curl --silent --show-error -D - -o /dev/null https://staging-app.carekosh.com/inventory
curl --silent --show-error -D - -o /dev/null https://staging-app.carekosh.com/assets/missing.js
curl --silent --show-error -D - -o /dev/null -X OPTIONS \
  https://staging-api.carekosh.com/api/v1/web-auth/login \
  -H 'Origin: https://staging-app.carekosh.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,x-carekosh-web'
```

Expected: healthy staging JSON, direct 200 for the inventory document with no redirect, 404 for the missing asset, and a successful preflight with the exact staging origin and `Access-Control-Allow-Credentials: true`. These public checks alone do not prove cookie login or account isolation; complete the browser and Android rows above.

The repository backend pytest suite drops/recreates tables and is restricted to disposable test databases. Do not point it at the hosted staging database. The existing `live-api.spec.ts` is a local-only harness on ports 5189/8019 and is not a hosted acceptance test.

## Release decision

Record a pass or hold decision for this candidate. Release only after the required checks have evidence and failures are resolved. Deploy through the sequence in [DEPLOYMENT.md](DEPLOYMENT.md), then record a separate production smoke result and previous-good rollback versions. Preserve database credentials and signing keys; do not use a database restore as a frontend rollback.
