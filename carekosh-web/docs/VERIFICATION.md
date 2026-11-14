## Backend dependency upgrade re-verification — 27 October 2026 (current)

After the FastAPI 0.162 / Starlette 1.10 / PyJWT upgrade: **875 backend tests (migrated disposable PostgreSQL, real Redis, zero skipped), 465 Android/mobile tests, 84 web unit tests and 20 Chromium browser tests passed**, including the real local API flow against a two-worker Gunicorn server. pip-audit reported zero known Python dependency advisories. No web source changed in this round. The current record is [the independent final review](../../docs/security-review-2026-10-27/INDEPENDENT_FINAL_REVIEW.txt).

## P3 review — 27 October 2026 (historical)

Local results at the time (superseded by the section above): **84 web unit tests, 20 Chromium browser tests, 870 backend tests with migrated disposable PostgreSQL and real Redis, and 465 Android/mobile tests passed**. TypeScript, ESLint, Ruff, dependency compatibility, the 55-route gate, both hosted build/artifact checks, both invalid-build guards, and local Cloudflare routing/header checks passed. The latter covered 20 deep links and four unknown paths. No Android application source or hosted service was changed.

The browser suite includes the opt-in real local API flow as well as demo/mocked API coverage, mobile order closure, saved consent/error behavior and both registration messages. An earlier rerun had an unusual 15-minute execution gap and timed out; the trace was inspected and an unchanged full rerun passed in 20.3 seconds. No timeout was raised or test disabled to obtain that result.

Production and staging artifacts now use separate `dist-production/` and `dist-staging/` directories; the route manifest is `routes.json`. See the [full P3 review and next actions](../../docs/CAREKOSH_P3_REVIEW_AND_NEXT_STEPS.txt) for the 13 local fixes, pending registration-enumeration work, dependency advisories and hosted acceptance limits. **Nothing was deployed.** Earlier results below are historical, including statements that previews were running at the time.

# Implementation verification

## Ask CareKosh naming correction — 25 October 2026

Applied the clarified product name across the web UI and landing page: assistant entries, bottom navigation and dialog now read “Ask CareKosh”. Updated help text, accessible labels, screenshot captions and all six landing-page app captures. No visible “Care Coach” wording remains in either source UI. Existing internal component names and API contracts are retained.

Verified the dashboard card and bottom navigation at 320px and 390px widths, with no horizontal overflow, and opened the renamed dialog. A stock-summary prompt still returned the expected demo totals. TypeScript/production build and landing-page static checks passed. This correction changes copy and screenshots only; Android and backend code remain untouched and nothing was deployed.

Evidence: [Ask CareKosh on mobile](screenshots/ask-carekosh-dashboard-mobile.png), [renamed dialog](screenshots/ask-carekosh-mobile.png).

## Ask Care Coach text-only web update — 25 October 2026

Simplified the dashboard entry, navigation, launcher and dialog to “Ask Care Coach”. Removed the introductory marketing paragraphs and all web read-aloud controls/browser speech calls. The question field now says “Type your question…”. Android voice code and backend contracts were unchanged. Updated all six landing-page app captures using fictional local demo data, with light appearance still the default.

Verified the compact card, bottom navigation and dialog at 320px and 390px phone widths, including a 480px short viewport, plus the desktop dialog. The preview reported no horizontal overflow. Typed item lookup returned the expected 12 packets of sterile gloves; an eight-packet request produced the correct unsaved order draft. No microphone or read-aloud controls appeared. Also inspected the refreshed landing-page Coach screenshot.

ESLint, all 71 unit tests, TypeScript/production build, production artifact checks and landing-page local/staging/production static checks passed. No deployment, external provider calls, stock mutations or saved orders were performed for this update.

Evidence: [compact dashboard entry](screenshots/ask-care-coach-dashboard-mobile.png), [text-only mobile dialog](screenshots/ask-care-coach-mobile.png). Local preview: `http://127.0.0.1:5174/scripts/mobile-flow-preview.html?start=/inventory`.

## Mobile Care Coach flow — 25 October 2026

Tested typed local understanding in the demo and against the existing API using the isolated local account/database from the inventory check (web 5189, API 8019). No external AI provider, microphone or email service was used.

### Repairs

- Partial-name lookups now reach the existing exact-item choice flow instead of a generic clarification. Unknown names still return no invented stock.
- Ambiguous draft requests now display selectable items/options. Selecting one resumes the original plan, including its quantity, filters and previous-result context.
- Follow-up draft edits use the proposal currently shown, instead of losing it or editing an older workspace draft. “2 oxygen” → choose Oxygen Cylinder → “Add 3 more” produces five units. “Review draft” transfers that proposal to the order editor; replacing an existing draft still requires confirmation.
- New answers receive focus and scroll their heading into view. Clarifications appear inside the conversation; other errors use the focused error component. Empty draft results explain that no supplies matched and omit the review button.
- Short follow-ups such as “How many are left?” use only a previously resolved item. Draft parsing now recognizes packets, singular/plural boxes, sets and cylinders consistently between parser versions, with existing unit-mismatch checks preserved.

### Checks

- Exact/partial lookup, touch choice, unknown item, result link to item details, stock summary, low-stock and out-of-stock filters, and manual inventory refresh.
- Demo totals matched inventory: 32 active items, five low-stock and three out-of-stock. The API-backed account returned its own two items at six pieces each, with zero low/out-of-stock results.
- Suggested low-stock draft contained five lines/21 units. Explicit quantities, ambiguity resolution, follow-up addition, typed review, and cancel/confirm replacement were exercised. Cancelling kept the original five-cylinder draft; confirming replaced it with the reviewed suggestion.
- The API-backed flow transferred a five-piece glove draft to Create Order. Saved orders stayed at two and stock stayed at six/six. Coach did not save an order or change stock.
- Wrong units requested clarification without conversion; direct stock-edit requests were refused; empty replenishment did not offer an empty review action.
- Exercised 320, 390 and 414px phone widths, including a 480px height. No horizontal overflow was reported on the tested views. Answers, choices, question input, review buttons and replacement confirmations remained reachable.
- **71 unit tests passed** across seven files, including 18 new Coach regressions. ESLint, TypeScript/production build and production artifact verification passed after the final parser repair.

Evidence: [mobile Coach preview](screenshots/coach-mobile-preview.png), [local-account draft](screenshots/coach-mobile-local-account.png). The normal preview remains at `http://127.0.0.1:5174/scripts/mobile-flow-preview.html?start=/inventory`, with Care Coach open. Android and backend source were not edited. Nothing deployed. These are browser viewport/local-understanding checks; physical keyboards, local voice playback and opt-in provider understanding still require separate acceptance.

## Mobile inventory and order flow — 25 October 2026

Exercised the real web UI against the existing local FastAPI code and disposable PostgreSQL database used for the preceding authentication check. The test web app ran on 5189 and the API on 8019. All item and order mutations used the browser and synthetic records; no supplier purchase, production data, email delivery or hosted service was involved.

### Repairs

- Fixed the item quantity stepper becoming stuck after its number field was cleared. The plus/minus controls now recover from an empty value and respect the existing 0–999,999 limits. Number fields also render an empty value safely while editing.
- Item submission errors now receive focus and scroll into view. Reproduced a duplicate-name rejection on mobile, verified the feedback is visible, then corrected the name and saved without losing the form. Order submission/action errors use the same opt-in behavior.
- Replaced the misleading blank-order-quantity message about a missing minimum with the actual whole-number range. The field exposes `aria-invalid` and is associated with its hint. Blank, zero and fractional quantities keep Save disabled.

### Verified workflows

- Empty inventory → Add item → create the required category → add an item → edit its name, stock, minimum and notes. Saved details persisted when revisited after completing an order.
- Suggested replenishment: gauze stock 3/minimum 6 generated quantity 3; gloves stock 1/minimum 4 generated quantity 3, manually changed to 5. Cancelling confirmation preserved the draft; confirming created one eight-unit order.
- Pending → Ordered → Received left stock at **3 gauze pads and 1 glove**. Cancelling Apply preserved Received. Confirming Apply changed stock to **6 and 6**, with both items now in stock.
- A fresh page load restored the account and completed order. The order showed Stock updated with no Apply action, and inventory remained **6 and 6**. Dashboard activity reported the eight-unit stock update.
- Manual order: opened the blank-order picker, searched for gauze, selected it and saved a two-unit pending order. Stock remained **6 and 6**.
- Checked Inventory, the item editor, order lists/details, picker and confirmation dialogs across 320, 390 and 414px widths. The 480px short-height check kept quantity controls, modal actions and bottom navigation reachable. No horizontal overflow was reported on the exercised screens.
- **53 unit tests passed** across six files, including eight new quantity-stepper boundary/recovery cases. ESLint, TypeScript/production build and production artifact verification passed.

Evidence: [actual local API stock after receipt](screenshots/mobile-inventory-received-local.png), [delivered mobile preview](screenshots/mobile-inventory-preview.png). The interactive demo remains at `http://127.0.0.1:5174/scripts/mobile-flow-preview.html?start=/inventory`; the landing preview remains on 5175. Browser viewport tests do not replace physical-device keyboard or hosted staging acceptance. Android and backend source were unchanged by this task. Nothing deployed.

## Mobile landing-to-dashboard flow — 25 October 2026

Tested the actual landing Get Started and Sign In links at phone widths, then registration, verification, login and protected workspace navigation against the existing FastAPI code using a new disposable PostgreSQL database. The isolated test used ports 5176 (landing), 5189 (web) and 8019 (API). Test emails were captured locally, with email verification still required. No real emails or external AI requests were sent.

### Repairs

- Removed automatic focus from authentication inputs so entering registration does not jump past the first fields or request the mobile keyboard immediately.
- Authentication errors and success messages now receive focus and scroll into view after submission. Existing form values remain available for correction.
- The API client now understands the backend's structured 422 `details[].message` response. A weak password now reports the missing uppercase letter instead of only “Request validation failed”. Messages are bounded; submitted input and arbitrary diagnostic fields are not displayed.
- Closed mobile drawer links no longer receive keyboard focus. The menu exposes its expanded state, and Escape closes it and returns focus to the menu button.

### Checks

- Landing mobile menu → Get Started → registration, and menu → Sign In → login; normal demo links on 5175 → 5174 were rechecked as well.
- Empty required fields, a rejected password, password visibility, successful registration, visible success feedback, and back-to-sign-in navigation.
- Sign-in blocked before verification; the captured verification link succeeded. Username and email sign-in both reached the new account's empty dashboard; an incorrect password stayed on login with visible feedback.
- Reload restored the authenticated session. Cancelling sign-out kept the account open; confirmed sign-out returned to login, and reload of the protected root remained blocked.
- Dashboard / Inventory / Orders / Care Coach navigation at 320, 390 and 414px, including active-page semantics, stock-summary results, closing the Coach dialog, and returning focus to its launcher. No horizontal overflow was reported. A 480px-tall viewport also kept the bottom bar and dialog controls reachable.
- Keyboard focus skips the closed drawer. Opening it, using Escape, and opening the account profile worked on mobile.
- **45 unit tests passed**, including two regressions for the backend validation response shape and malformed/bounded details. ESLint, TypeScript/production build, production artifact guards, and all three landing-build checks passed.

Evidence: [real local account dashboard](screenshots/mobile-flow-real-account.png), [delivered demo mobile preview](screenshots/mobile-flow-preview.png). The development-only `scripts/mobile-flow-preview.html` provides 320/390/414px frames plus a short-height check; it is not included in production builds. Cross-origin landing pages remain usable, but layout measurement is available only when the frame is on the helper's origin.

Temporary test services were stopped after verification. The standard demo previews remain on 5174 and 5175. Backend and Android source were not changed. These are local browser viewport and isolated API checks; physical-device keyboards, hosted TLS/cookies and real email delivery still require staging acceptance. Nothing deployed.

## Item editing and API contract repair — 25 October 2026

An independent review reproduced a cross-client stock overwrite: a browser form held quantity 2 from version 1, then a background refresh supplied version 2 after another client changed stock to 9. The form could submit the old quantity with the new version. The editor now keeps editable values and their expected version together. A detected change blocks save/delete; an unseen change is rejected by the existing server version check. Unsaved text stays intact. Loading current details requires confirmation that the edits will be replaced, followed by a fresh workspace fetch and review. A duplicate-name rejection remains editable and is not mistaken for a version conflict.

Description, notes and purchase links now enforce the existing API limits of 1,000, 1,000 and 500 characters. Local validation reports oversized text without truncating it. No backend schema, Android behavior, stock rule or authentication transport was changed by these web repairs.

| Check | Result |
| --- | --- |
| TypeScript / ESLint | Passed after the final implementation changes. |
| Web unit tests | **43 passed** across six files, including structured conflict handling and exact/one-over API text boundaries. |
| Chromium workflows | **12 passed**; one existing opt-in live API test was skipped. Includes all eight demo workflows and four API-mode browser regressions with every API request intercepted. |
| Cross-client browser regression | Quantity 2/version 1 remains unsaved after a simulated quantity 9/version 2 update and background refetch. Cancelled reload retains edits; confirmed reload displays quantity 9 and permits a reviewed save with version 2. A separate unseen-update case submits version 1, receives 409 and keeps quantity 9 unchanged. |
| Boundary browser regression | Text saves at the API boundaries; typing cannot exceed the limits. Duplicate-name correction remains available after 409. |
| Regression sensitivity | The background-refresh and text-boundary browser regressions both failed against a temporary copy of the pre-fix item form, then passed with the repair. |
| Hosted builds / build guards | Staging and production builds and artifact checks passed; invalid environment/demo/public-variable configurations were rejected. Nothing deployed. |

The API-mode browser project uses a separate local Vite server on port 5190 and a fully mocked API. It runs through `npm run test:e2e` without a database or credentials. Physical-device behavior, actual hosted domains and live provider calls remain staging acceptance tasks. Earlier verification history below is retained.

## Final typography and responsive review — 25 October 2026

- Brought Recent Activity, missing-page messages, and the fatal-error fallback onto the shared reading scale. Activity keeps its event type visible on phones, with wrapping details and readable dates. Corrected the Activity breadcrumb.
- Moved the phone Care Coach launcher into the bottom navigation so it no longer overlaps content or form controls. The desktop launcher remains available. Verified opening Coach, generating a local stock summary, Escape dismissal, and focus returning to its button.
- Reviewed 18 routes at 320, 390, 768, 1024, and 1440px: sign-in, registration, dashboard, inventory, orders, builder, profile, help, activity, add/edit item, create/detail order, forgot/reset password, verify/resend email, and not found. All reported no horizontal document overflow. These are browser viewport checks, not physical-device or hosted acceptance tests.
- Visually inspected representative cards, forms, navigation, and dialogs, including light/dark inventory and Coach. Verified the landing page's Get Started link opens registration, its sign-in link reaches login, and local demo entry reaches the dashboard. No real account, password, order, or stock mutation was submitted.
- ESLint, TypeScript/production build, all **42 frontend regression tests**, and production artifact guards passed. Landing local/staging/production link, asset, font, metadata, and static-header checks passed.
- Expanded both development-only responsive helpers with a 1024px breakpoint and added the remaining app routes. Deployment, DNS, backend, and Android source are outside this change.

The app remains available at `http://127.0.0.1:5174/`, and the public-site preview at `http://127.0.0.1:5175/`.

## Visual and security foundation review — 25 October 2026

The landing page now defaults to fresh light-theme dashboard, inventory, order, Coach and mobile screenshots. An optional dark dashboard remains available. CareKosh's brand mark is larger, and Care Coach uses a shared, larger icon in navigation, the launcher, dashboard and dialog. Compact emergency panels now stack the description/action; phone form controls use larger text.

The implemented security changes and the still-pending Cloudflare/backend launch gates are detailed in [SECURITY_AND_SCALE.md](SECURITY_AND_SCALE.md). No hosted security setting, backend source, Android source, production data, DNS record or public deployment was changed during this review.

| Check | Result |
| --- | --- |
| TypeScript / ESLint | Passed |
| Frontend regression tests | **38 passed** across five files; includes oversized responses, hostile print content, API path boundaries, cooldowns, response types and bounded/complete pagination |
| Dependency advisory audit | `npm audit --audit-level=high`: **0 known vulnerabilities** at verification time |
| Build guard tests | Production rejects demo mode, mismatched environment/API and unexpected public `VITE_` settings |
| Hosted build artifacts | Staging and production passed API/fixture isolation, header, route and source-map checks |
| Local Cloudflare runtime | 17 deep links and four real 404 cases passed with security/cache headers; no deployment |
| Landing checks | Local, staging and production links, images, metadata, default light appearance and security headers passed |
| Browser layouts | Six app routes at 320, 390, 768 and 1440px plus landing at all four widths: no horizontal document overflow. Compact navigation, Coach dialog/summary, landing menu, screenshot tabs and enlargement were exercised |
| Real local API compatibility | Disposable-account login, session restoration after reload, existing inventory/order loading and confirmed logout passed after hardening. Temporary services stopped afterward |

Screenshots: [light landing showcase](../../carekosh-site/docs/light-theme-showcase.jpg), [light desktop dashboard](../../carekosh-site/assets/app-overview-light.jpg), [Care Coach on a 320px viewport](screenshots/coach-mobile-2026-10-25.jpg). Browser viewport checks are not a substitute for physical-device and embedded-WebView acceptance. Hosted DNS/DDoS/WAF/origin protections and capacity have **not** been proven by these local tests.

## Final flow and Android review — 25 October 2026

Reviewed against Android commit `08e292e` (`fix: improve voice queries and order recovery`) and the current local source. This verification changed only web source, tests, and documentation. Existing Android/backend edits in the working tree were preserved. No deployment, DNS change, public staging mutation, real email delivery, or paid AI request was performed.

### Fixes

- Emergency orders now include only active critical equipment with one or no units. Ordinary out-of-stock supplies remain in the regular replenishment flow. The dashboard lists the affected equipment with quantities, units, and out-of-stock/low-reserve counts.
- Entering emergency review with an existing cart offers keep, add missing emergency items, or replace. Merging retains manual quantities. Bulk selection/removal is available.
- Order saving has distinct inventory-check, confirmation, and submission progress. Stale inventory requires review; changed units require removing and re-adding the line. Refresh retains requested quantities.
- Unknown submissions retain the original ID and exact payload. A rejected retry does not unlock the uncertain original submission. Navigation, account changes, stale confirmation, and late responses cannot overwrite another cart. A late first-request rejection cannot unlock a newer retry.
- Supplier, image, and purchase-link references survive order creation. Completed and cancelled order colors match Android's status meanings.
- Landing, authentication, and dashboard use `CareKosh — Home ICU Inventory` and `Your home care supplies, organized.` Browser titles retain the full brand. Authentication includes an environment-aware Back to CareKosh link.

### Checks performed in this session

| Check | Result |
| --- | --- |
| Frontend typecheck and lint | Passed after the final code changes. |
| Frontend regression tests | **26 passed**, including fresh-stock review, changed units, exact retry payload, late-response races, and preservation of manual quantities. |
| Android reference tests | **36 passed** across `dashboard-order-ui`, `order-draft-screen`, and `order-feedback`; Android source unchanged. |
| Backend auth/browser-auth/order regressions | **125 passed**, using a separate disposable PostgreSQL database and `--migrated-schema`. These are focused suites, not a rerun of the historical full backend suite below. |
| Staging and production web builds | Passed; artifact checks confirmed API environment isolation, fixture exclusion, headers, route rules, and no source maps. Builds were not deployed. |
| Landing checks | Production, staging, and local links, assets, metadata, static headers, and environment separation passed. |
| Responsive browser checks | Dashboard, registration, login, and populated emergency cart at **320, 390, 768, and 1440px**: no horizontal document overflow. Compact login/registration/cart and desktop login/dashboard visually inspected. |

### Real local API flow

Used the existing FastAPI application with an isolated local PostgreSQL database and synthetic account. Only the local test harness replaced email delivery with a capture file; application email-verification rules remained enabled. Temporary test instances used ports 5176 (landing), 5189 (web), and 8019 (API). They are not hosted staging.

1. Landing Get Started opened registration. Registration succeeded; signing in before verification was rejected.
2. Followed the actual link from the captured verification email. The backend confirmed verification. Landing Sign In then accepted the username/password and opened the empty real-account dashboard.
3. Reload restored the browser session. Real accounts displayed their own inventory rather than demo counts.
4. Added five fictional inventory records through the existing API. Emergency selection excluded ordinary and inactive items. Merging into a manual cart retained its edited quantity of nine; bulk removal removed only selected draft lines.
5. Saved the reviewed emergency order after confirmation. Marking it received left inventory unchanged. Applying it added quantities once. Reload removed the apply action; a repeated API apply did not double stock.
6. Print/Save PDF did not create another order. This session did not visually inspect the print document; that rendering check belongs to the earlier verification below.
7. Sign out in one tab signed out the other tab and blocked protected dashboard navigation. Browser login used an HttpOnly, SameSite=Strict refresh cookie, without returning a refresh token in the JSON response.
8. The independent Android-style access/refresh session continued working after browser logout.

The delivered demo links were also followed directly: `5175/` → `5174/register` → Back to CareKosh → Sign In → demo dashboard. The normal local previews remain running at [landing](http://127.0.0.1:5175/) and [web app](http://127.0.0.1:5174/). They use fictional data; the temporary real-API test services were stopped after verification.

Evidence: [updated dashboard](screenshots/verified-dashboard-2026-10-25.png), [login](screenshots/verified-login-desktop.png), [real local account dashboard](screenshots/verified-local-account.png).

Android's latest typed Coach parser/query changes are already present in the web equivalents. Native Android speech engines and the other browser differences in [PARITY.md](PARITY.md) remain deliberate limitations. Public TLS, Secure-cookie/CORS behavior on the actual domains, real email delivery, provider-backed Coach calls, and additional browser engines still require hosted staging before release.

## Initial implementation — 24 October 2026

Validated locally during the 24 October 2026 implementation session. These checks establish local behavior, not a public deployment.

## Results

| Check | Result |
| --- | --- |
| TypeScript and ESLint | Passed, including the final accessible names for mobile icon controls. |
| Frontend unit/regression suite | 14 passed: stock/order rules, assistant behavior, session refresh and logout boundaries. |
| Chromium end-to-end suite with local API enabled | 9 passed. |
| Final responsive regression pass | 4 passed at 320, 390, 768 and 1440 CSS pixels after the final accessible-label adjustment. |
| Backend integration and unit suites | 686 passed in 37.22 seconds, using the disposable PostgreSQL test database and `--migrated-schema`. Includes 15 browser-auth tests. |
| API route gate | Historical 24 October result: 51 route objects, including four additive browser-auth routes. The current 27 October gate is 55. |
| Staging and production builds | Passed; each bundle uses its exact API host, excludes fictional fixtures and source maps, and includes security headers and route rules. |
| Invalid production environment | A production build with `VITE_DATA_MODE=demo` correctly failed with the environment mismatch guard. |
| Cloudflare production deployment dry-run | Passed against the final production build; 22 static files discovered. Nothing uploaded or published. |
| Cloudflare routing regression check | Passed: 17 application URLs respond directly with 200 and no Location header; four unknown paths respond with 404. Both ordinary and browser-navigation requests were checked. |
| Dependency audit after the locked Undici update | 0 vulnerabilities reported at implementation time. |

The full browser suite exercised item creation/editing, category creation and protection, catalog suggestions, backed-up resets, order creation/receipt/application, persisted stock totals, Coach drafts without saved-order side effects, print popup rendering, backup download, search dismissal, and responsive routing. The local API test verified authentication, the HttpOnly refresh cookie, item/order persistence, reload restoration and cross-tab logout against FastAPI and PostgreSQL. No shared database was used.

The final label-only adjustment was followed by typecheck, lint, all four responsive browser tests, both hosted builds, both artifact checks, and the Cloudflare dry-run. A subsequent hosting correction disabled automatic HTML redirects and added the routing regression script to CI; both hosted builds and runtime checks passed afterward. Backend and business logic were unchanged after their passing suites.

## Static hosting behavior

The production assets were served through Wrangler's local runtime on loopback port 8787. HTTP checks confirmed:

- All 17 tested application URLs, including `/inventory`, `/orders/example`, `/item/example` and `/reset-password?token=example`, return the app document directly with status 200, no Location header, and revalidation caching. The checks do not follow redirects.
- A real hashed JavaScript asset returns JavaScript with `max-age=31536000, immutable`.
- `/assets/missing.js`, `/missing.js`, `/api/v1/items` and `/unknown-route` return status 404 with revalidation caching, rather than the app entry document with status 200.
- All inspected responses include the configured Content Security Policy.

The frontend does not provide an API proxy in production. Hosted business requests go directly to the environment's explicit API hostname.

## Visual review and preview

The dashboard was visually inspected in dark and light appearances and at desktop and mobile sizes. Browser checks also visited inventory, builder, orders, item editor, profile and sign-in at all four tested widths, with no horizontal page overflow. Mobile search, Add item and Coach controls retain accessible names when their text is hidden.

- [Desktop dashboard](screenshots/dashboard-desktop.png)
- [Mobile dashboard](screenshots/dashboard-mobile.png)
- [Light dashboard](screenshots/dashboard-light.png)

The delivered local demo is `http://127.0.0.1:5174/`. It uses fictional sample records and makes no live API calls. Restart it with `npm run dev:demo -- --port 5174 --strictPort` from `carekosh-web` if the development process is stopped.

## Checks still required for launch

No Cloudflare deployment, DNS mutation, provider purchase, real email dispatch or paid AI request was performed. Cloudflare zone/account ownership, DNS conflicts, public TLS, hosted Secure/SameSite/CORS behavior, real verification/reset email delivery, online Coach consent/provider behavior, and Safari/Firefox testing belong to staging before launch. Follow [DEPLOYMENT.md](DEPLOYMENT.md).

Browser printing was checked through report rendering, not through a physical printer. Native Android voice engines and image upload are documented browser gaps in [PARITY.md](PARITY.md), not passing parity claims. The frontend CI workflow is supplied but has not run on GitHub in this task.
