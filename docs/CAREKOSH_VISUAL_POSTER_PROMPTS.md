# CareKosh Backend, Byte by Byte — 12 visual-poster prompts

This pack is a code-verified visual curriculum for learning CareKosh end to end and explaining it in backend/full-stack interviews. Generate one poster at a time. Do not ask an image model to combine all 12 into one image.

Every fenced block is deliberately self-contained. Copy one complete block—from `BEGIN STANDALONE POSTER PROMPT` through `END STANDALONE POSTER PROMPT`—into a new image-generation request. The image model does not need this repository, an uploaded PDF, another poster, or any earlier chat context. A prompt's `SOURCE MAP` is text to print as provenance on the poster; it is not an instruction to open those files.

The 12 posters form one connected course, but each poster must also make sense when viewed alone. The prompts therefore repeat the relevant project truth, define unfamiliar terms in place, prescribe the information hierarchy, and distinguish current implementation from future recommendations.

Verified on 2026-08-05 against the implementation in vitaltrack-mobile/ and vitaltrack-backend/. The existing Markdown and HTML guides were used for additional context, but code and current configuration win whenever a guide and implementation differ.

## Series order

1. The complete full-stack landscape
2. The mobile client and state ownership
3. One request from tap to PostgreSQL and back
4. The database model and tenant boundary
5. Registration and email verification
6. Login, access JWT, and authorization
7. Refresh-token rotation and session lifecycle
8. Password recovery, account deletion, and security layers
9. Inventory CRUD and optimistic concurrency
10. Orders as a state machine and atomic stock application
11. Environments, CI/CD, deployment, and operations
12. How to defend, test, and scale the design in an interview

## Visual-system contract for the whole series

Each prompt below is standalone and repeats the important art direction. Keep the series visually consistent:

- Portrait educational infographic, 4:5 aspect ratio, ideally 2400 × 3000 or higher.
- Warm cream canvas #F7F1E7, ivory cards #FFFDF8, subtle sand dividers #D8CBBB.
- Main ink #2F2924, deep teal #176B68 for successful data paths, muted sage #829985 for supporting systems, burnt amber #C47C3C for attention and configuration, restrained terracotta #B85C4B only for failures/security, slate blue #4F6D7A for infrastructure.
- Refined editorial information design: generous margins, consistent 12-column grid, fine-line technical icons, minimal shadows, rounded cards with 14–18 px radius.
- Heading style inspired by Fraunces or DM Serif Display; body style inspired by Inter or Source Sans 3; code labels inspired by JetBrains Mono. Render all text sharply and correctly.
- No neon, no rainbow palette, no glossy 3D, no cartoons, no mascots, no cyberpunk, no fake terminal wallpaper, no excessive gradients, no clip-art, no clutter.
- Use arrows only where direction matters. Number sequential flows. Use solid teal arrows for normal flow, dotted amber arrows for conditional flow, terracotta for rejected/error paths.
- Place the series mark “CAREKOSH BACKEND · BYTE BY BYTE” at top-left and “NN / 12” at top-right.
- Every poster ends with a narrow “INTERVIEW LENS” strip containing one memorable answer, plus a tiny one- or two-line “SOURCE MAP” naming exact files.
- Do not fabricate source code, endpoints, tables, services, queues, caches, or guarantees. Preserve exact capitalization and punctuation of technical labels.

---

## Poster 01 — The complete full-stack landscape

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository access, no uploaded source files, no previous poster, and no earlier conversation. Everything required to create this image is contained below. Do not ask for code or invent missing behavior. Treat the stated CareKosh implementation facts as authoritative. Generate exactly one finished educational poster—not a slide deck, mood board, wireframe, or generic architecture template. The `SOURCE MAP` is visible provenance text only; do not attempt to inspect those files.

AUTHORITATIVE PROJECT CONTEXT
CareKosh is a home-ICU medical-supply inventory product for family caregivers. Its current client is a React Native app built with Expo 54 and expo-router. The app calls a single FastAPI modular-monolith REST backend under `/api/v1`; FastAPI uses Pydantic validation and SQLAlchemy 2 asynchronous sessions; PostgreSQL 16 on Neon is the durable source of truth. The mobile app is deliberately server-first: it may display a persisted read snapshot while offline, but it never queues offline mutations. Current external infrastructure is a Render `starter` always-on Docker service in Singapore, Neon, EAS Build, and the Brevo v3 HTTPS email API. Production starts one Gunicorn master with exactly two `uvicorn.workers.UvicornWorker` processes. Redis, Kafka, Celery, Kubernetes, microservices, GraphQL, Firebase, object storage, and offline synchronization are not implemented.

TEACHING GOAL
In one glance, a learner should be able to name every runtime boundary, trace the normal request path from a caregiver's tap to committed data and back, and explain which layer owns each kind of state. This is the opening map for a backend interview discussion, so favor causal connections over decorative icons.

RENDERING CONTRACT
Render every quoted title, subtitle, caption, card label, endpoint, and footer exactly. Render the explicitly listed node labels, bullets, chips, and code-style terms. Do not render meta-headings such as `KNOWLEDGE CONTRACT`, `RENDERING CONTRACT`, `ART DIRECTION`, `LAYOUT`, or `VISUAL ACCURACY RULES`. Use short lines, never placeholder text, and never silently omit a numbered node. If space is tight, reduce decoration before reducing technical content.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“CAREKOSH — THE COMPLETE FULL-STACK LANDSCAPE”
Subtitle: “From caregiver tap to durable PostgreSQL state”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “01 / 12” at top-right.

ART DIRECTION
Use a warm cream background #F7F1E7, ivory cards #FFFDF8, espresso text #2F2924, deep teal #176B68 for the primary request path, muted sage #829985 for local state, slate blue #4F6D7A for infrastructure, amber #C47C3C for configuration, and terracotta #B85C4B only for errors. Elegant editorial infographic, precise grid, thin lines, gentle rounded cards, subtle paper texture, sophisticated typography, no neon, no 3D, no cartoons, no excessive color, no decorative clutter. Headings resemble Fraunces/DM Serif Display, body resembles Inter/Source Sans 3, code labels resemble JetBrains Mono. All labels must be crisp and spelled exactly.

LAYOUT
Use a 12-column grid with 5% outer margins. Reserve 12% for title/context, 50% for topology, 23% for concept cards, 12% for the environment rail plus interview/source footer, and the remaining 3% as inter-band gutters. Use thin tinted boundary backgrounds instead of separate bulky cards.

Top 12%: title and a one-line product definition:
“Home-ICU inventory management where the server is the source of truth.”

TOPOLOGY BAND: one large left-to-right system topology with seven numbered nodes. Place nodes 2–4 inside a thin boundary labeled `ANDROID / EXPO APP`; place nodes 5–6 inside a boundary labeled `RENDER DOCKER CONTAINER`; place node 7 in a separate `NEON` boundary so SQLAlchemy cannot be mistaken for a network service:
1. “Caregiver”
2. “React Native + Expo 54 UI” with tiny labels “expo-router screens”
3. “TanStack Query hooks” with tiny label “server-state orchestration”
4. “TypeScript services + ApiClient” with tiny labels “JSON · HTTP local · HTTPS preview/production · Bearer JWT”
5. “FastAPI /api/v1” with tiny labels “Pydantic · Depends · business rules”
6. “SQLAlchemy 2 async” with tiny labels “AsyncSession · transaction”
7. “PostgreSQL 16 on Neon” with a database-cylinder icon and label “authoritative state”

Connect the seven nodes with one continuous outbound deep-teal arrow. Directly below it, draw a thinner return arrow:
“PostgreSQL commit → SQLAlchemy/FastAPI response → TanStack Query cache → confirmed UI”

Under the mobile half, add two compact supporting storage cards:
• “Expo SecureStore” — “access token + refresh token + vitaltrack-auth = user + isAuthenticated”
• “AsyncStorage” — “persisted display snapshot; hydrated/written by Query persister; never pushed upstream”
Use a bold annotation: “Cached data is never pushed back as an offline write.”

Branch from FastAPI to a small external card:
“FastAPI BackgroundTasks → Brevo v3 HTTPS API” — “verification, reset, deletion email; not SMTP; not durable queue”
Branch around FastAPI with:
“Render starter · Singapore · always-on” — “Gunicorn master → 2 uvicorn.workers.UvicornWorker processes”
Above the mobile node add:
“EAS Build · build-time, not runtime” — “development APK · preview APK · production AAB”

Below the app boundary, add a small local-artifact card:
“Device filesystem” — “generated order/inventory PDFs + JSON backups”
“Not uploaded to PostgreSQL; item image URIs are stored as strings; no object-storage service.”

CONCEPT BAND: three equal concept cards.
CARD A — “STATE OWNERSHIP”
• useAuthStore: persisted auth snapshot
• useAppStore: volatile presentation state
• TanStack Query: server data
• SecureStore: credentials
• PostgreSQL: business truth

CARD B — “SERVER-FIRST”
Definition: “Every mutation must be confirmed by the backend. Offline mode may display the last safe snapshot, but it does not queue writes.”

CARD C — “WHY THIS DESIGN?”
“Life-critical inventory favors correctness and explicit failure over invisible merge conflicts.”

Add a small environment rail:
Local → http://localhost:8000
Preview → https://staging-api.carekosh.com
Production → https://api.carekosh.com

INTERVIEW LENS footer:
“CareKosh is a server-first mobile system: Expo renders and caches, FastAPI enforces identity and business rules, and PostgreSQL remains authoritative.”

SOURCE MAP footer in tiny mono text:
README.md · vitaltrack-mobile/app/_layout.tsx · vitaltrack-mobile/providers/QueryProvider.tsx · vitaltrack-mobile/services/api.ts · vitaltrack-backend/app/main.py · vitaltrack-backend/app/core/database.py · vitaltrack-backend/render.yaml · vitaltrack-mobile/eas.json

VISUAL ACCURACY RULES
Do not draw Redis, Kafka, Celery, Kubernetes, microservices, GraphQL, Firebase, or an offline sync queue; none is part of the current system. Show one FastAPI backend and one PostgreSQL source of truth.

FINAL IMAGE QA
Before finalizing, verify that all seven numbered nodes appear in order; outbound request and committed-response arrows are distinct; app/Render/Neon containment is unambiguous; PostgreSQL is authoritative; the complete SecureStore snapshot, bidirectionally maintained local Query snapshot, and device-filesystem card are present; the no-upstream-offline-write rule is legible; EAS is build-time; Brevo is background HTTPS; exactly two workers and Render starter are stated; and all concept cards are complete. Ensure no lorem ipsum, fake endpoints, or future technology.

END STANDALONE POSTER PROMPT
~~~~

---

## Poster 02 — The mobile client and state ownership

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository access, no uploaded source files, no previous poster, and no earlier conversation. Everything needed for this one image is below. Do not ask for files and do not apply generic React Native assumptions when this prompt states a CareKosh-specific behavior. Generate exactly one finished educational poster. The `SOURCE MAP` is a visible provenance line, not an external dependency.

AUTHORITATIVE PROJECT CONTEXT
CareKosh uses Expo 54 with expo-router. Its root order is `QueryProvider → ThemeProvider → GestureHandlerRootView → RootLayoutContent → Stack`, with a root-level `MutationResultDialog` and Toast. State is intentionally split: Zustand's `useAuthStore` owns user/session and cold-start state, but persists only user + isAuthenticated; Zustand's `useAppStore` owns volatile search/expansion presentation state; TanStack Query owns server-derived resources; Expo SecureStore owns JWT strings plus a minimal auth snapshot; AsyncStorage holds the persisted Query display snapshot and the non-secret light/dark preference. PostgreSQL remains authoritative. Reads can survive temporary disconnection, while mutations are never queued offline. Auth-related query keys are excluded from persistence, and login/logout clear both in-memory and persisted query data to prevent one caregiver seeing another caregiver's cached records on a shared device.

TEACHING GOAL
Teach the difference between client state, server state, credential storage, and a display cache. A viewer should be able to reconstruct both read and write paths and explain why cached inventory never becomes an offline write source.

RENDERING CONTRACT
Render all quoted copy and every listed route, key, setting, and flow label exactly; do not render prompt-instruction headings. Generate one poster only. Use filenames and code identifiers in mono type. Preserve the tree indentation visually. If content competes for space, simplify icons and borders—not the route tree or ownership rules.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“THE CAREKOSH MOBILE CLIENT”
Subtitle: “Routes, state, secure storage, cache, and network boundaries”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “02 / 12” at top-right.

STYLE
Warm cream #F7F1E7, ivory cards, espresso typography, deep teal primary flows, sage local state, amber conditional/cold-start paths, terracotta errors only, slate blue network components. Refined editorial systems diagram with generous spacing, elegant serif headline, clean sans-serif body, mono filenames. No glossy effects, no cartoons, no neon, no visual noise. Render exact technical text correctly.

LAYOUT
Use a 12-column grid with 5% outer margins. Header = 9%; full-width provider rail = 6%; main three-column system = 50%, with columns spanning 3.4, 4.0, and 4.6 grid columns; stress/cache-privacy band = 25%; interview/source footer = 7%; remaining 3% = gutters. Keep flows inside their responsible column until the explicit network crossing. Put defined-but-unused query notes in a compact side rail rather than another full card.

FULL-WIDTH PROVIDER RAIL
QueryProvider → ThemeProvider → GestureHandlerRootView → RootLayoutContent → Stack
Root overlays: MutationResultDialog + Toast

LEFT COLUMN — “ROUTE TREE”
Draw a restrained phone outline containing this exact route hierarchy:
RootLayout
├─ (auth)
│  ├─ login
│  ├─ register
│  ├─ verify-email-pending
│  ├─ forgot-password
│  └─ reset-password
├─ (tabs)
│  ├─ Dashboard
│  ├─ Inventory
│  └─ Orders
├─ item/[id]
├─ order/create
├─ profile
├─ builder
└─ search

Beside it place the route-guard rule:
“useProtectedRoute()”
Unauthenticated → /(auth)/login
Authenticated inside auth group → /(tabs)
Use a lock icon and two clean directional arrows.

CENTER COLUMN — “WHO OWNS WHAT?”
Create five stacked cards:
1. “Zustand · useAuthStore”
   persisted: user + isAuthenticated
   memory-only: loading + cold-start flags
2. “Zustand · useAppStore”
   searchQuery, selectedCategoryId, expandedCategories, expandedItems
   memory-only; reset on restart/logout
3. “TanStack Query”
   items, categories, orders, stats, activities
4. “Expo SecureStore”
   vitaltrack_access_token
   vitaltrack_refresh_token
   vitaltrack-auth = persisted user + isAuthenticated
5. “AsyncStorage”
   carekosh-query-cache
   persisted display snapshot; never an upstream write source
   @vitaltrack_theme = light/dark preference

Between TanStack Query and AsyncStorage show a dotted two-way local persistence link:
“persist query snapshot ↔ hydrate query snapshot”
From AsyncStorage toward the backend, place a crossed-out upstream mutation arrow:
“never persisted cache → backend write”
Keep the normal read path labeled:
“server → Query cache → screen”

RIGHT COLUMN — “READ AND WRITE PATHS”
READ:
Screen → useServerData → item/category/order service → ApiClient → GET /api/v1/... → Query cache → screen

WRITE:
Form → useServerMutations → service → ApiClient → backend mutation → invalidate query keys → refetch

Add exact query keys as small chips:
["items"] · ["categories"] · ["orders"] · ["items", "stats"] · ["activities"] · ["items", id]
Mark these chips with tiny notes:
`["items", "stats"]` and single-item query are defined but unused by current screens.
Dashboard computes its cards from useItems().
Search and item-detail screens read the existing all-items cache; they do not call getById().

BOTTOM BAND — “BEHAVIOR UNDER STRESS”
Use four compact cards:
• “Offline reads” — cached data may remain visible
• “Offline writes” — blocked; mutations are not queued
• “Login/logout” — clear memory cache + persisted cache for shared-device privacy
• “Cold start” — profile timeout can preserve cached auth; background retry and status pill explain server wake-up

Under `Cold start`, render the exact timeline:
read access token → GET /auth/me → race against 8-second timeout → cached-auth fallback → background profile retry after 5 seconds → authoritative 401 clears session

Add tiny implementation facts:
staleTime = 30 seconds
orders staleTime = 0
gcTime = 24 hours
queries retry = 3
mutations retry = 0
refetch on foreground and reconnect

Add a tiny `CACHE PRIVACY` note:
auth / user / me query keys are excluded from dehydration
app-version buster invalidates incompatible snapshots
login/logout clear QueryClient memory + carekosh-query-cache

INTERVIEW LENS:
“Zustand owns client/auth state; TanStack Query owns server state. SecureStore protects credentials; AsyncStorage holds a non-auth query snapshot plus the non-secret theme preference.”

SOURCE MAP:
vitaltrack-mobile/app/_layout.tsx · app/(auth)/* · app/(tabs)/* · store/useAuthStore.ts · providers/QueryProvider.tsx · theme/ThemeContext.tsx · hooks/useServerData.ts · hooks/useServerMutations.ts · services/api.ts

Do not imply that Zustand stores inventory, that AsyncStorage stores JWTs, or that the app supports offline mutations.

FINAL IMAGE QA
Verify the provider tree, both root overlays, complete route tree including `builder`, all five ownership cards, persisted versus memory-only auth fields, all three SecureStore entries, both AsyncStorage entries including `@vitaltrack_theme`, six ASCII query-key chips, defined-but-unused annotations, cold-start timing, privacy exclusions, version buster, default versus orders stale time, and both READ/WRITE paths. SecureStore and AsyncStorage must never be conflated; local Query persistence is two-way while the upstream cache-write arrow is crossed out; no optimistic cache mutation or offline write may appear.

END STANDALONE POSTER PROMPT
~~~~

---

## Poster 03 — One request from tap to PostgreSQL and back

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository access, no prior image, and no hidden implementation context. This prompt is the sole source for the poster. Do not ask for files, fill gaps with a typical architecture, or change the example request. Produce exactly one finished technical poster. Treat the `SOURCE MAP` only as a small provenance label to render.

AUTHORITATIVE PROJECT CONTEXT
This poster traces the actual current item-edit path. The Expo item form calls a TanStack Query mutation; the TypeScript item service sends an authenticated full-item `PUT`; FastAPI resolves an asynchronous database session and the current user; the route validates an `ItemUpdate`, scopes the item by both item ID and user ID, and performs an optimistic-concurrency compare-and-swap using the client's version. Activity and audit records share the transaction. The backend commits before the client invalidates and refetches its read cache. The current form can edit quantity through this `PUT`; do not substitute the separate stock `PATCH` path.

TEACHING GOAL
Make every boundary and responsibility explainable aloud: UI intent, mutation hook, service normalization, HTTP envelope, middleware/router, dependency injection, authorization, atomic SQL, transaction, response, cache invalidation, and visible UI confirmation.

RENDERING CONTRACT
All ten numbered steps are mandatory and must remain in order. Render quoted copy, exact endpoints, headers, statuses, filenames, function names, and the SQL block. Do not render instruction labels such as `KNOWLEDGE CONTRACT` or `MAIN LAYOUT`. Produce one poster, not ten panels on separate pages. Use the example values quantity 24, minimum stock 5, and version 7 consistently.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“ONE REQUEST, END TO END”
Subtitle: “PUT item edit: from a mobile action to an atomic database commit”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “03 / 12” at top-right.

STYLE
Warm cream #F7F1E7 editorial canvas, ivory #FFFDF8 rounded cards, espresso #2F2924 text, deep teal #176B68 numbered request arrows, slate blue #4F6D7A framework boundaries, sage #829985 supporting state, amber #C47C3C validation/conditional steps, terracotta #B85C4B rollback/error paths, sand #D8CBBB dividers. Thin precise connectors, clean icons, refined serif headline, modern sans body, mono code. No neon, no 3D, no crowded terminal aesthetic. Every filename, function, header, status, and code fragment must be legible and exact.

MAIN LAYOUT
Use a 12-column grid with 4.5% margins. Header = 9%; main trace = 59%; compact concept strip = 19%; footer = 7%; remaining 6% = inter-band and swimlane gutters. Create three lightly tinted vertical swimlanes—`MOBILE`, `FASTAPI`, `POSTGRESQL`—and one numbered sequence crossing them. Put the outgoing request on the upper half and the return on the lower half. Keep the Async definition as a one-line chip so the ten-step trace remains dominant. Use this exact example:

1. UI EVENT
“User saves an item edit”
ItemFormScreen.handleSave() calls useUpdateItem().mutate(...)
Then safeBack() returns immediately; hook-level mutation callbacks survive screen unmount.
Label: “No optimistic cache write.”

2. MUTATION HOOK
hooks/useServerMutations.ts
mutationFn → itemService.update(id, data including version)

3. SERVICE + CLIENT
services/items.ts
strip empty optional fields
api.put("/items/{id}", cleaned item data)

4. HTTP REQUEST
PUT /api/v1/items/{item_id}
Authorization: Bearer <access JWT>
Content-Type: application/json
Body includes: { "quantity": 24, "minimumStock": 5, "version": 7, ...edited fields }

5. MIDDLEWARE + ROUTING
main.py wrapping envelope
Inbound: security-header wrapper → request-ID wrapper → CORS/router → /api/v1 router → items router
Outbound: X-Request-ID + security headers + Cache-Control: no-store

6. DEPENDENCY GRAPH
FastAPI parses/validates ItemUpdate and resolves both dependencies before update_item():
get_db() yields AsyncSession
get_current_user(): verify_access_token() → SELECT users WHERE id = sub with noload("*")
missing user → 401 · inactive user → 403

7. ROUTE FUNCTION
items.py → update_item()
Load only WHERE Item.id == item_id AND Item.user_id == current_user.id

8. ATOMIC COMPARE-AND-SWAP
Show this short exact conceptual code block:
UPDATE items
SET quantity = 24,
    minimum_stock = 5,
    version = version + 1
WHERE id = :id
  AND user_id = :user_id
  AND version = 7

9. SAME TRANSACTION
Add ActivityLog
Add AuditLog old/new quantity
Route calls await db.commit() once
Exception before commit → dependency rollback
get_db() also commits any clean remaining transaction, rolls back exceptions, and closes the session

10. RESPONSE TO UI
200 ItemResponse with camelCase JSON such as minimumStock · isCritical · createdAt
→ invalidateQueries({ queryKey: ["items"] })
→ prefix invalidation also covers item/stat subkeys
→ invalidateQueries({ queryKey: ["activities"] })
→ refetch → screen shows confirmed stock

Place a dotted 401 interceptor loop beside steps 3–4:
401 → one shared refresh attempt → rotate token pair → retry original PUT once
refresh failure → clear session + auto-logout

Place a terracotta side branch from steps 6–9:
401 invalid/expired identity
404 item not owned or not found
409 stale version
409 body: error · message · server_version · server_quantity
Caption: “These are from the server snapshot loaded before CAS; refetch for authoritative latest state.”
422 invalid request shape
pre-commit 500 unexpected error → rollback

LOWER-LEFT CONCEPT CARD — “DEPENDENCY INJECTION”
CurrentUser = Depends(get_current_user)
DB = Depends(get_db)
Definition: “FastAPI resolves reusable prerequisites before the route body.”

LOWER-CENTER CONCEPT CARD — “TRANSACTION BOUNDARY”
get_db():
yield session
route commits the completed mutation
clean remainder → dependency commit
exception before route commit → rollback
finally → close

LOWER-RIGHT CONCEPT CARD — “ASYNC”
“await releases the event loop during network/database I/O. Argon2 password work is explicitly moved to a worker thread elsewhere.”

INTERVIEW LENS:
“I can trace a write across every boundary: UI intent, mutation orchestration, authenticated HTTP, dependency resolution, user-scoped atomic SQL, transaction, cache invalidation.”

SOURCE MAP:
vitaltrack-mobile/hooks/useServerMutations.ts · services/items.ts · services/api.ts · vitaltrack-backend/app/main.py · app/api/deps.py · app/api/v1/items.py · app/core/database.py · app/services/audit.py

Do not add a message queue, repository class, ORM auto-commit, or optimistic client-side write. The backend confirmation comes before the cache is refreshed.

FINAL IMAGE QA
Trace every teal arrow from step 1 through step 10 and back. Confirm safeBack plus surviving callbacks, no optimistic write, the three example body values, Bearer header, shared-refresh loop, middleware response headers, ItemUpdate/dependencies, noload user lookup, both ownership predicates, version check/increment, explicit route commit, pre-commit rollback wording, exact 409 fields plus pre-CAS snapshot caveat, camelCase response, ASCII prefix invalidation, and compact definition cards. The SQL must not imply a blind overwrite. Do not replace `PUT` with `PATCH`.

END STANDALONE POSTER PROMPT
~~~~

---

## Poster 04 — The database model and tenant boundary

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository or database schema access and no previous context. Everything needed to draw the accurate CareKosh model is stated here. Do not infer conventional foreign keys or security mechanisms that are not listed. Generate exactly one finished educational ER poster. Render the `SOURCE MAP` as provenance only.

AUTHORITATIVE PROJECT CONTEXT
The current PostgreSQL schema contains exactly eight application tables: `users`, `refresh_tokens`, `categories`, `items`, `orders`, `order_items`, `activity_logs`, and `audit_log`. IDs are UUID strings stored as `VARCHAR(36)`. CareKosh is logically multi-tenant by user: authentication supplies `current_user`; tenant-root queries use direct `user_id` predicates, while child `order_items` inherit ownership through their order. PostgreSQL row-level security is not implemented. `order_items.item_id` is an indexed logical historical reference rather than a database foreign key. Activity logs are user-facing events; audit rows store selected before/after JSON snapshots and do not cover every mutation. Order status is validated as an application/ORM string enum; the migration history does not prove a database membership `CHECK` for every enum value.

TEACHING GOAL
Show how relationships support ownership, inventory grouping, historical orders, renewable sessions, activity, audit, and account deletion. Make the distinction between authentication, SQL ownership authorization, foreign-key structure, and denormalized snapshots immediately clear.

RENDERING CONTRACT
Every one of the eight entity cards and every stated relationship is mandatory. Render table and field names in mono type, quoted copy exactly, and cardinalities as `1` and `many`. Do not render meta-instructions. Keep entity fields intentionally selective; never invent columns. Produce one ER poster, not a generic database dashboard.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“THE DATA MODEL IS THE SECURITY MODEL”
Subtitle: “PostgreSQL relationships, ownership, history, and deletion”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “04 / 12” at top-right.

STYLE
Warm cream #F7F1E7 background, ivory #FFFDF8 entity cards, espresso #2F2924 typography, deep teal #176B68 primary relationships, muted sage #829985 historical data, slate blue #4F6D7A framework structure, amber #C47C3C constraints, restrained terracotta #B85C4B cascade/delete paths, sand #D8CBBB dividers. Sophisticated ER-diagram poster, consistent line weights, high legibility, minimal iconography, no neon, no 3D, no crowded rainbow schema. Serif display title, sans body, mono table/field names.

LAYOUT
Use a 12-column grid with 4% margins. Header = 8%; ER diagram = 56%; four concept cards in a 2 × 2 compact band = 19%; database-guard rail = 7%; interview/source footer = 7%; remaining 3% = gutters. Place `users` upper-center, compact history/audit entities along the lower ER edge, and avoid crossing connectors. Draw a clear model centered on users as aggregate root; use short field rows rather than tall cards.

users
PK id
email · username
hashed_password
is_active · is_verified · is_email_verified
email_verification_token · email_verification_expiry
password_reset_token · password_reset_expiry
deletion_token · deletion_token_expires
Caption: “All email-link token columns store SHA-256 digests; passwords use Argon2.”

users 1 → many refresh_tokens
refresh_tokens:
PK id · unique jti
FK user_id
is_revoked · expires_at
device_name · ip_address

users 1 → many categories
categories:
PK id · FK user_id
name · display_order · is_default

categories 1 → many items
users 1 → many items
items:
PK id · FK user_id · FK category_id
name · quantity · minimum_stock
is_active · is_critical
version

users 1 → many orders
orders:
PK id · FK user_id
unique order_id
status · total_items · total_units
ordered_at · received_at · applied_at

orders 1 → many order_items
order_items:
PK id · FK order_id
item_id (logical reference, not a database FK)
name · brand · unit
quantity · current_stock · minimum_stock
supplier snapshot

users 1 → many activity_logs
activity_logs:
PK id · FK user_id
action · item_name · item_id · order_id · details

users 1 → many audit_log
audit_log:
PK id · FK user_id
entity_type · entity_id · action
old_values JSONB · new_values JSONB

Use a shield-shaped boundary around all user-owned rows and repeat the predicate:
“Tenant roots: WHERE user_id = current_user.id”
“order_items: ownership through its user-owned order FK”
Label it:
“Authorization continues inside SQL.”

CONCEPT BAND: four compact cards in a 2 × 2 grid.

CARD 1 — “ACTIVITY ≠ AUDIT”
ActivityLog: user-facing timeline
AuditLog: item create/update/stock/delete plus order-apply stock snapshots
Small caveat: “Categories and most order mutations are not audited.”

CARD 2 — “DENORMALIZED ORDER SNAPSHOT”
OrderItem keeps the product facts as ordered, even when the live Item changes later.

CARD 3 — “CASCADE DELETION”
user → categories · items · orders · activity · refresh · audit
category → items
order → order_items
Caption: “Deleting the user removes the owned aggregate through ORM/database cascades.”

CARD 4 — “FOUNDATION MIXINS”
UUIDMixin → id
TimestampMixin → created_at + updated_at
Alembic → controlled schema evolution

Add two amber constraint notes:
• Item.version enables optimistic concurrency.
• OrderStatus is an application/ORM string enum: pending, ordered, partially_received, received, stock_updated, declined. Do not imply a database enum-membership CHECK exists.

Add a compact “DATABASE GUARDS” rail:
CHECK items.quantity >= 0
CHECK order_items.quantity > 0
CHECK (users.email IS NOT NULL OR users.username IS NOT NULL)
UNIQUE users.email
UNIQUE users.username
UNIQUE refresh_tokens.jti
UNIQUE orders.order_id

Add an “HONEST EVENT COVERAGE” note:
“Category create/delete reuse item action values; order deletion writes no ActivityLog.”

INTERVIEW LENS:
“Authentication identifies the user; user_id predicates authorize data. The schema preserves ownership, concurrency metadata, and historical order context.”

SOURCE MAP:
vitaltrack-backend/app/models/user.py · category.py · item.py · order.py · refresh_token.py · activity.py · audit_log.py · app/api/v1/*.py · alembic/versions/*.py

Do not draw a direct category-to-order relationship. Do not claim order_items.item_id is a foreign key. Do not claim audit_log covers every mutation.

FINAL IMAGE QA
Count exactly eight tables. Verify all exact token fields and both verification flags; PK/FK ownership on both log tables; direct versus inherited ownership; `categories → items` and `orders → order_items`; logical non-FK `order_items.item_id`; all three cascade paths; seven database guards; selective audit/activity caveats; four concept cards; and the application-enum caveat. Do not depict row-level security (RLS), event sourcing, soft deletion, or universal audit coverage.

END STANDALONE POSTER PROMPT
~~~~

---

## Poster 05 — Registration and email verification

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository, uploaded files, previous posters, earlier conversation, or internet context. This prompt is the complete and authoritative content source for one image. Never ask for source files or infer missing architecture. CareKosh is a React Native/Expo home-ICU inventory app backed by FastAPI and PostgreSQL. Generate exactly one finished educational poster. The `SOURCE MAP` is literal footer copy for human provenance only, not an instruction to inspect files.

AUTHORITATIVE PROJECT CONTEXT
Registration creates a database identity but the current mobile product intentionally requires a later login. The public registration request carries no Bearer token. FastAPI validates the form, hashes the password with Argon2 off the async event loop, stores a user, persists only a SHA-256 digest of the email-verification secret, and asks Brevo through HTTPS to send the raw secret in a browser link. For backward compatibility the backend returns an access/refresh pair and creates a refresh-session row. The mobile auth store immediately clears those tokens and reports success; the Register screen then routes to pending verification. Production can enforce verified email through configuration; local configuration can leave it disabled.

TEACHING GOAL
Teach the separation among identity creation, mailbox-control proof, token-at-rest protection, renewable session creation, and the mobile decision to remain logged out. The viewer must understand why a successful 201 Created registration response is not the same as an authenticated app session.

RENDERING CONTRACT
Render the nine numbered stages, exact routes, configuration expression, schema facts, response fields, and failure paths below. Quoted copy and technical identifiers are locked. Do not render instruction headings such as `KNOWLEDGE CONTRACT`, `STYLE`, or `MAIN LAYOUT`. At 2400 × 3000, target at least 72 px title, 38 px section labels, 27 px body, 24 px mono code, and 19 px provenance. Reduce ornament before shrinking content.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“REGISTRATION IS NOT A SESSION”
Subtitle: “Account creation, hashed verification tokens, and proof of email ownership”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “05 / 12” at top-right.

STYLE
Warm cream #F7F1E7, ivory cards, espresso text, deep teal successful steps, sage stored state, amber configuration branches, terracotta rejection paths. Elegant editorial sequence diagram with restrained icons for phone, shield, envelope, and database. Serif headline, clear sans body, mono code/file labels. No neon, no gradients dominating the page, no cartoon people, no clutter. Render exact paths and names sharply.

MAIN LAYOUT
Use 5% outer margins. Header = 10% height. Under it, three exact vertical swimlanes = 54%: `MOBILE` = 30% width, `FASTAPI + POSTGRESQL` = 45%, `BREVO + BROWSER` = 25%. Reserve the next 24% for configuration, token rationale, and failure cards; reserve the final 12% for the interview and source footer. Percentages include internal gutters. Keep all sequence arrows inside or directly between their responsible lanes.

1. MOBILE FORM
RegisterScreen
Required in the current UI and UserRegister schema: name, email, password
Optional: username
Client checks password match and complexity.
UserRegister truth:
email, password, and name are required
username is optional
password length 8–128 with uppercase + lowercase + digit

2. CLIENT CALL CHAIN
RegisterScreen.handleRegister()
→ useAuthStore.register()
→ authService.register()
→ api.post("/auth/register", data, false)
Caption: “false = public request; do not attach an access JWT”

3. PUBLIC ENDPOINT
POST /api/v1/auth/register
Rate limit: 3 / hour / IP
Success: 201 Created
Pydantic UserRegister validates the request.

4. ACCOUNT CREATION
Check unique lowercased email and username.
Run Argon2 hashing off the event loop:
anyio.to_thread.run_sync(hash_password, password)
Insert User with:
is_active = true
is_email_verified = false

5. VERIFICATION SECRET
Show a split token graphic:
raw_token = secrets.token_urlsafe(32)
stored_value = SHA-256(raw_token)
expiry = 24 hours
Raw token → email link only
Hash + expiry → users table only

6. BACKEND COMPATIBILITY DETAIL
Create access + refresh JWTs and a refresh_tokens row.
Return AuthResponse.
Show this compact response card:
AuthResponse = {
  access_token,
  refresh_token,
  token_type: “bearer”,
  expires_in: 1800,
  user
}
Access JWT lifetime = 30 minutes
Refresh JWT lifetime = 30 days with unique jti
refresh_tokens row:
jti · user_id · is_revoked=false · expires_at · device_name · ip_address
Place an amber note:
“The backend still returns tokens for compatibility.”

7. MOBILE SECURITY DECISION
authService briefly receives/stores the token pair.
useAuthStore.register() immediately calls:
tokenStorage.clearTokens()
isAuthenticated = false
returns true
Then RegisterScreen.handleRegister() performs its delayed navigation:
router.replace("/(auth)/verify-email-pending")
Use a bold label:
“Successful registration deliberately does not log the user in.”

8. BACKGROUND EMAIL
If Brevo is configured:
FastAPI BackgroundTasks → Brevo HTTPS API
Link:
GET /api/v1/auth/verify-email?token=<raw_token>
Also show the JSON alternative:
GET /api/v1/auth/verify-email/{token}

9. VERIFICATION
Select users with a non-null verification hash and an unexpired verification timestamp.
verify_token() computes SHA-256 and uses secrets.compare_digest.
On success:
is_email_verified = true
clear token hash + expiry
User returns to app and logs in freshly.

Add a dotted amber side branch titled “RESEND”:
POST /api/v1/auth/resend-verification
Rate limit: 3 / hour / IP
Generic success wording
Replace the prior token hash + expiry

Add a small “CONFIGURATION TRUTH” card:
Login returns 403 EMAIL_NOT_VERIFIED only when:
REQUIRE_EMAIL_VERIFICATION
&& is_email_configured()
&& user.email
&& !user.is_email_verified
`is_email_configured()` means MAIL_PASSWORD is non-empty.
Settings default is false. Development Docker may set true, but enforcement still skips when email is unconfigured.

Add a “WHY HASH EMAIL TOKENS?” card:
“A database leak should not immediately reveal a live bearer link. The raw secret exists in application memory and the emailed browser URL, but is never persisted in PostgreSQL; only its SHA-256 digest is stored.”

Add terracotta branches:
400 duplicate identifier
422 invalid input
503 resend requested while email service unavailable
expired/invalid link → verification rejected

INTERVIEW LENS:
“Registration creates identity; email verification proves mailbox control; login later creates the usable app session.”

SOURCE MAP:
vitaltrack-mobile/app/(auth)/register.tsx · app/(auth)/verify-email-pending.tsx · store/useAuthStore.ts · services/auth.ts · vitaltrack-backend/app/api/v1/auth.py: register, verify_email_html, verify_email · app/utils/email.py · app/models/user.py · app/core/config.py

Do not show plaintext passwords or stored raw verification tokens. Do not imply the mobile app remains authenticated after registration. Label Brevo as an HTTPS API, not SMTP.

FINAL IMAGE QA
Verify all three lanes and all nine stages are present; the public-call `false` meaning is visible; required versus optional fields are correct; Argon2 and SHA-256 are not confused; the AuthResponse and refresh row are complete; the raw-token/hash split points in the correct directions; resend and both verification routes appear; the configuration expression is not paraphrased; and the mobile ends unauthenticated. No SMTP, plaintext password, or raw stored token may appear.

END STANDALONE POSTER PROMPT
~~~~

---

## Poster 06 — Login, access JWT, and authorization

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository, source uploads, prior poster, conversation history, or internet access. This is the complete closed-world specification for one CareKosh image. Never ask for files or add a conventional authorization layer not described below. Generate exactly one final educational poster. The `SOURCE MAP` is visible provenance text only.

AUTHORITATIVE PROJECT CONTEXT
CareKosh login accepts an email or username plus password. The public login request has no Bearer token. FastAPI finds the identity, verifies its Argon2 hash off the async event loop, applies active-account and configuration-dependent email-verification policy, creates a 30-minute access JWT and a 30-day refresh JWT, and stores the refresh `jti` as a server-side session row. The Expo client stores both JWT strings only in SecureStore. Thereafter, every protected resource request verifies an access JWT, reloads the user, and constrains the SQL query by that user's ID. Expo navigation guards improve UX but are not a backend security boundary.

TEACHING GOAL
Make the learner distinguish password authentication, signed-token authentication, refresh-session state, navigation UX, and application-generated SQL ownership authorization. The decisive interview insight is that a valid JWT identifies a subject but never grants access to every database row.

RENDERING CONTRACT
Render every numbered login step, both token cards, the complete protected-request pipeline, the authentication/authorization split, and every rejection branch. All quoted copy, identifiers, claims, and routes are locked. Do not print prompt meta-headings. At 2400 × 3000, use at least 72 px title, 38 px section labels, 27 px body, 24 px mono, and 19 px provenance; simplify decoration before shrinking text.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“LOGIN ESTABLISHES IDENTITY — SQL ENFORCES OWNERSHIP”
Subtitle: “From password verification to every protected request”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “06 / 12” at top-right.

STYLE
Warm cream background #F7F1E7, ivory cards #FFFDF8, espresso text #2F2924, deep teal #176B68 happy path, slate blue #4F6D7A framework boundaries, sage #829985 token/storage details, amber #C47C3C policy checks, terracotta #B85C4B denial paths. Clean sequence diagram plus JWT anatomy and authorization shield. Serif display title, sans body, mono code. Fine lines, sharp typography, no neon, no 3D, no stock cyber-security imagery.

LAYOUT GEOMETRY
Use 5% outer margins. Header = 10%. Login sequence = 45%, with sequence on the left 68% and JWT anatomy on the right 32%. Protected-request pipeline = 25% across full width. Authentication-versus-authorization and rejection cards = 8%. Final 12%: Interview Lens and Source Map. Percentages include internal gutters.

TOP HALF — LOGIN SEQUENCE
Draw Mobile, FastAPI, and PostgreSQL lanes with these numbered steps:

1. LoginScreen
identifier = email OR username
password

2. Client chain
useAuthStore.login(identifier, password)
→ authService.login()
→ api.post("/auth/login", data, false)
Caption: “false = public request; no Bearer token attached”

3. Endpoint
POST /api/v1/auth/login
Rate limit: 5 / minute / IP

4. Identity lookup
“@” present → lower(email)
otherwise → lower(username)

5. Password check
verify_password() with Argon2
executed through anyio.to_thread.run_sync

6. Policy checks
user exists
is_active = true
If REQUIRE_EMAIL_VERIFICATION && is_email_configured() && user.email && !user.is_email_verified:
→ 403 EMAIL_NOT_VERIFIED
Caption: “Configuration-dependent, not inherently tied to a named environment.”

7. Token/session creation
new jti
create_token_pair(user.id, jti)
insert refresh_tokens row
update last_login
append ActivityLog USER_LOGIN
commit
Refresh-session row:
jti · user_id · is_revoked=false · expires_at=now+30 days · device_name from User-Agent · ip_address

8. Client session
AuthResponse = access JWT + refresh JWT + “bearer” + expires_in=1800 + serialized user
SecureStore keys:
vitaltrack_access_token
vitaltrack_refresh_token
useAuthStore sets user + isAuthenticated
clear previous user’s Query cache
invalidate queries
route guard → /(tabs)

RIGHT-SIDE JWT ANATOMY
Draw two refined token cards:

ACCESS JWT
sub = user UUID
iat = issued at
exp = now + 30 minutes
type = “access”
Purpose: authorize normal API calls

REFRESH JWT
sub = user UUID
iat = issued at
exp = now + 30 days
type = “refresh”
jti = unique token ID
Purpose: rotate the session

Shared signature:
HS256 + SECRET_KEY
Small definition:
“JWTs are signed, not encrypted. Never place secrets in their payload.”

BOTTOM HALF — EVERY PROTECTED REQUEST
Show this exact flow:
ApiClient reads access token from SecureStore
→ Authorization: Bearer <access JWT>
→ get_current_user()
→ verify_access_token() checks signature, expiry, and type = access
→ SELECT User WHERE id = JWT.sub
→ missing user = 401; inactive user = 403
→ route query adds WHERE user_id = current_user.id
→ return only that user’s data

Add two precise callouts:
“A refresh JWT cannot authorize a resource route: verify_access_token() requires type = access.”
“The Expo route guard is navigation UX. FastAPI re-verifies identity and ownership for every protected request.”

Show one concrete authorization query:
SELECT Item
WHERE Item.id = :item_id
  AND Item.user_id = current_user.id
Caption: “A foreign user’s item ID produces 404, not access.”

Add a boundary note:
“Ownership is enforced by application-generated SQL predicates. PostgreSQL Row-Level Security is not implemented.”

Create a bold split card:
AUTHENTICATION = “Who are you?”
AUTHORIZATION = “Which records/actions may you access?”

Add four rejection paths:
401 missing/invalid/expired token
401 user deleted/not found
403 inactive account
404 another user’s resource appears “not found” because ownership is scoped in the query

Add a separate `LOGIN REJECTIONS` card:
unknown identifier OR wrong password → 401 “Incorrect email/username or password”
inactive account during login → 403 “Account is disabled”
unverified email under the exact configured guard → 403 “EMAIL_NOT_VERIFIED”

INTERVIEW LENS:
“A valid JWT authenticates a subject; it does not authorize every row. CareKosh repeats user ownership in each database query to prevent insecure direct object reference (IDOR).”

SOURCE MAP:
vitaltrack-mobile/app/(auth)/login.tsx · store/useAuthStore.ts · services/auth.ts · services/api.ts · vitaltrack-backend/app/api/v1/auth.py: login · app/core/security.py · app/api/deps.py · app/models/refresh_token.py

Do not call JWT encryption. Do not store tokens in AsyncStorage. Do not show a role or permission service that the current user routes do not use.

FINAL IMAGE QA
Verify all eight login stages, the `false` public-call meaning, exact email-verification condition, refresh row metadata, both SecureStore keys, access and refresh lifetimes/claims, signed-not-encrypted definition, protected SQL example, route-guard caveat, and 401/403/404 distinctions. The JWT alone must never be drawn as granting unscoped database access.

END STANDALONE POSTER PROMPT
~~~~

---

## Poster 07 — Refresh-token rotation and session lifecycle

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository, source uploads, earlier poster, conversation context, or internet access. This prompt alone contains every fact needed for one CareKosh refresh-session poster. Do not rely on a previous login poster, ask for files, or invent token-family behavior. Generate exactly one final educational poster. The `SOURCE MAP` is visible provenance copy only.

AUTHORITATIVE PROJECT CONTEXT
CareKosh uses a hybrid session design. A 30-minute access JWT has its signature and claims verified locally by FastAPI and has no server session row, but `get_current_user()` still reloads the user database row on every protected request. A 30-day refresh JWT carries a unique `jti`; PostgreSQL stores a refresh-session row containing that `jti` and metadata, but never the full JWT. When an access token expires, the Expo `ApiClient` coordinates one refresh attempt for concurrent 401 responses. FastAPI atomically revokes the old unused row before minting a replacement pair. This gives single-use rotation, not complete refresh-token-family theft detection.

SESSION PRIMER — RENDER NEAR THE TITLE
ACCESS JWT = { sub, iat, exp, type: “access” }
lifetime 30 minutes · no server row · normal API authorization
REFRESH JWT = { sub, iat, exp, type: “refresh”, jti }
lifetime 30 days · renewable session credential
POSTGRESQL ROW = refresh_tokens(jti UNIQUE, user_id FK, is_revoked, expires_at, device_name, ip_address, last_used_at)
The current implementation does not update last_used_at and has no expired-row cleanup job.

TEACHING GOAL
Explain client single-flight coordination, server-side atomic token claiming, replay rejection, rotation, multi-device sessions, logout semantics, and what revocation can and cannot invalidate.

RENDERING CONTRACT
All nine loop steps, the session primer, SQL, matrix, replay example, and honest caveats are mandatory. Treat quoted text and technical identifiers as locked. Do not print meta-instruction headings. Use at least 72 px title, 38 px section labels, 27 px body, 24 px mono, and 19 px provenance at 2400 × 3000.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“REFRESH-TOKEN ROTATION”
Subtitle: “How one refresh credential can produce at most one replacement pair”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “07 / 12” at top-right.

STYLE
Warm cream canvas #F7F1E7, ivory cards #FFFDF8, espresso text #2F2924, deep teal #176B68 normal rotation loop, sage #829985 token metadata, amber #C47C3C concurrent waiting, terracotta #B85C4B replay/failure paths, slate blue #4F6D7A client/server boundaries. Elegant technical timeline and state transition, ample white space, serif title, sans body, mono code, no neon, no 3D, no hacker clichés.

LAYOUT GEOMETRY
Use 5% outer margins. Top 16%: title plus session primer. Middle 54%: clockwise rotation loop. Lower 20%: hybrid state, invalidation, replay, and caveat cards. Final 10%: Interview Lens and Source Map. Percentages include internal gutters. Do not let loop connectors cross code or primer text.

MAIN CENTERPIECE
Draw a large clockwise rotation loop with Mobile ApiClient on the left, FastAPI on the top-right, and refresh_tokens table on the bottom-right.

1. ACCESS EXPIRES
A protected request returns 401.

2. CLIENT SINGLE-FLIGHT GATE
services/api.ts → ApiClient.request()
If isRefreshing = false:
set isRefreshing = true
call refreshAccessToken()
If another request gets 401:
subscribeTokenRefresh() and wait

3. PUBLIC ROTATION CALL
POST /api/v1/auth/refresh
Body: { refresh_token: <refresh JWT> }

4. VERIFY JWT
verify_refresh_token()
Check signature, expiry, type = “refresh”
Extract user_id + jti

5. ATOMIC CLAIM — THE CRITICAL SQL
Show this compact conceptual code:
UPDATE refresh_tokens
SET is_revoked = true
WHERE jti = :jti
  AND user_id = :user_id
  AND is_revoked = false
RETURNING id

Place a lock icon over this step and the caption:
“Only one concurrent request can change false → true.”

6. REPLAY DECISION
One row returned → continue
No row returned → 401 invalid or already used

7. ROTATE
Check user still active.
Missing or inactive user → 401 “User not found or disabled”
Generate new jti.
Create new access JWT + refresh JWT.
Insert a new refresh_tokens row with expiry and device/IP metadata.
Commit once.

8. CLIENT REPLACEMENT
SecureStore replaces both tokens.
onTokenRefreshed(new access token) releases waiting requests.
Retry original request once with the new Bearer token.

9. FAILURE
Refresh fails → clear tokens → triggerAutoLogout() → route guard returns to login.

Place a small amber “KNOWN CLIENT EDGE CASE” card:
“Waiting subscribers are released only after a successful refresh. If the leader fails, waiters may remain unresolved. A transport failure currently clears both tokens instead of distinguishing a temporary network failure from an authoritative 401.”

LEFT LOWER CARD — “WHY HYBRID STATE?”
Access JWT: locally verifiable and not stored server-side.
Refresh JWT: signed token plus server-side jti row.
Result: fast normal requests + revocable renewal.

RIGHT LOWER CARD — “SESSION INVALIDATION MATRIX”
Logout → revoke the presented refresh row
Password reset → revoke all user refresh rows
Change password → revoke all user refresh rows
Account deletion → cascade-delete refresh rows
JWT exp reached → decode fails
Tiny caveat: “Current refresh logic does not separately test refresh_tokens.expires_at.”

Add above this matrix:
“Each login creates an independent refresh jti. Logout ends only the presented session; password reset/change ends every renewable session for that user.”

Add an honest amber caveat:
“Logout, password change, and reset block renewal but do not immediately revoke issued access JWTs; they may work until the 30-minute expiry. Deleted users fail immediately because get_current_user() cannot reload the row; disabled users receive 403.”

Add a replay illustration:
Device A rotates jti-old → success + jti-new
Attacker/retry presents jti-old again → is_revoked already true → 401

Add a terracotta-bordered card titled “SINGLE-USE, NOT TOKEN-FAMILY DETECTION”:
“Reusing jti-old returns 401, but current code does not identify a token family or automatically revoke jti-new. The atomic claim prevents duplicate rotation; it is not a complete stolen-token-family response.”

INTERVIEW LENS:
“Rotation is safe because the database atomically claims the old jti before minting the replacement; this prevents two requests from reusing one refresh token.”

SOURCE MAP:
vitaltrack-mobile/services/api.ts: refreshAccessToken, ApiClient.request, subscribeTokenRefresh · services/auth.ts: logout · vitaltrack-backend/app/api/v1/auth.py: refresh_token, logout, reset_password, change_password · app/core/security.py · app/models/refresh_token.py

Do not show refresh tokens stored as plaintext rows; the table stores jti and metadata, not the whole JWT. Do not claim access JWTs are immediately revoked by password change.

FINAL IMAGE QA
Verify the primer makes this poster understandable without Poster 06; one leader and multiple waiting requests are visually distinct; SQL contains all three claim predicates plus `RETURNING id`; success replaces both JWTs; replay and leader failure are separate; multi-device logout semantics and token-family limitation are legible; and no full refresh JWT is shown inside PostgreSQL.

END STANDALONE POSTER PROMPT
~~~~

---

## Poster 08 — Password recovery, deletion, and layered security

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository, uploaded files, previous posters, conversation history, or internet access. This closed-world prompt is the sole factual source for one CareKosh security poster. Do not ask for source files, assume a generic reset provider, or invent background infrastructure. Generate exactly one finished educational poster. The `SOURCE MAP` is literal visible provenance only.

AUTHORITATIVE PROJECT CONTEXT
CareKosh exposes public email-capability flows for password reset and final account-deletion confirmation. High-entropy raw tokens appear in emailed browser URLs but are never persisted in PostgreSQL; the database stores SHA-256 digests plus expiry timestamps. Email goes through FastAPI `BackgroundTasks` to the Brevo v3 HTTPS API, which is convenient but not a durable job queue. Password reset replaces the Argon2 password hash and revokes all renewable refresh sessions. Account deletion first requires an authenticated request to send the link; the public GET only reviews, and the public POST bearing the secret performs deletion. The mobile app detects deletion by polling the authenticated profile endpoint.

TEACHING GOAL
Connect anti-enumeration, bearer-link capability security, hash-at-rest, expiry, background delivery, destructive confirmation, cascade deletion, session invalidation, CORS, rate limiting, and defense in depth—while clearly exposing current operational limitations.

RENDERING CONTRACT
Render every numbered flow stage, exact method/path, timing, defense layer, caveat, and failure status. Locked technical text must not be paraphrased. Do not render meta-headings such as `KNOWLEDGE CONTRACT`, `STYLE`, or `LAYOUT`. At 2400 × 3000, target at least 72 px title, 38 px section labels, 27 px body, 24 px mono, and 19 px provenance.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“RECOVERY WITHOUT LOSING CONTROL”
Subtitle: “Password reset, account deletion, and defense in depth”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “08 / 12” at top-right.

STYLE
Warm cream #F7F1E7, ivory cards, espresso text, deep teal verified actions, sage stored hashes, amber human confirmation/configuration, terracotta destructive or rejected paths, slate blue security controls. Refined editorial security poster, calm and trustworthy, no dramatic hacker imagery, no neon, no glossy shields, no crowded rainbow. Crisp code-style labels.

LAYOUT
Use 5% outer margins. Header = 9%. Two equal columns for reset and deletion = 45%. Authenticated password-change strip plus shared token rule = 12%. Defense layers, CORS, rate-limit truth, and access-token caveat = 24%. Final 10%: Interview Lens and Source Map. Percentages include internal gutters. Divide the page into two large upper flows and one lower defense band.

UPPER LEFT — “FORGOT / RESET PASSWORD”
1. ForgotPasswordScreen
2. POST /api/v1/auth/forgot-password
   rate limit 3 / hour / IP
3. Return the same generic message whether the email exists:
   “If an account exists…”
   Label: “anti-enumeration”
4. Generate raw token; store SHA-256 hash + 1-hour expiry.
5. BackgroundTasks → Brevo HTTPS API → browser link.
6. GET /api/v1/auth/reset-password?token=...
   HTML-escape token into a data attribute, never inline script.
   Caption: “The email opens a backend-hosted browser page; the current mobile reset-password screen is not this emailed-link destination.”
7. POST /api/v1/auth/reset-password
   rate limit 5 / hour / IP
8. Hash + constant-time compare → replace Argon2 password hash → clear reset token → revoke every refresh token → commit → send password-changed notice.

Add a thin ordering note between steps 4 and 5:
“Persist and commit token hash + expiry before queuing the background email.”

UPPER RIGHT — “TWO-STEP ACCOUNT DELETION”
1. ProfileScreen confirms destructive intent.
2. Authenticated DELETE /api/v1/auth/me
3. Require account email + configured email service.
4. Generate raw token; store SHA-256 hash + 24-hour expiry.
   Commit hash + expiry before queuing email.
5. Send confirmation email in background.
6. GET /api/v1/auth/confirm-delete/{token}
   “Review page only — nothing deleted.”
7. User submits the form:
   POST /api/v1/auth/confirm-delete/{token}
8. Recheck hash + expiry → delete User → one commit → database/ORM cascades remove dependent data.
   Cascade list: refresh_tokens · categories · items · orders · order_items · activity_logs · audit_log
9. Mobile polls GET /api/v1/auth/me every 5 seconds for up to 10 minutes.
   After deletion: access JWT decodes → user lookup fails 401 → refresh fails because its row was cascade-deleted → SecureStore + query caches clear → route guard redirects to login.

Label both confirmation endpoints:
“Public capability endpoints: the high-entropy URL token is the credential.”

Place a bold rule between the flows:
“Email-link tokens are bearer secrets: raw in the link, hash at rest, short expiry, one-time clearing.”

MIDDLE STRIP — “AUTHENTICATED PASSWORD CHANGE”
POST /api/v1/auth/change-password
valid access JWT + current password required
new Argon2 hash → revoke all refresh rows → commit
“Backend endpoint and mobile authService.changePassword() exist; no current screen calls them.”

LOWER BAND — “DEFENSE IN DEPTH”
Arrange eight restrained shield layers:
1. Pydantic input validation
2. Argon2 password hashing
3. Verification/reset: SHA-256 digest + secrets.compare_digest
   Deletion: SHA-256 incoming token + SQL match against users.deletion_token
   Raw tokens are never stored in PostgreSQL
4. Endpoint rate limits using proxy-aware client IP
5. Signed JWT type/expiry checks
6. Per-query user_id ownership scoping
7. Security headers + Cache-Control: no-store + production HSTS
8. SecretStr/startup validation + DEBUG-gated API docs

Add a precise CORS card:
Current render.yaml: CORS_ORIGINS=["*"] → allow_credentials=false
Specific origin list → allow_credentials=true
Native mobile uses Bearer headers; browser CORS does not replace API authentication.

Add an “HONEST RATE-LIMIT BOUNDARY” card:
“SlowAPI counters are in memory per Gunicorn worker. Production has two workers, so limits are not globally exact and reset on restart. Endpoint decorator limits are authoritative; RATE_LIMIT_PER_MINUTE and RATE_LIMIT_BURST settings are currently unused.”

Add an “ACCESS-TOKEN CAVEAT” card:
“Reset/change revokes renewable refresh sessions. Existing access JWTs may continue until their 30-minute expiry. Account deletion invalidates them effectively because the user row no longer exists.”

Add a “FAIL CLOSED / FAIL SAFE” card:
• Invalid verification API token, reset POST token, or deletion GET/POST token → 400
• Reset-form GET renders first; token validation occurs on POST
• Email unavailable for forgot-password or deletion request → 503; valid reset-token submission is not blocked
• Unexpected server error → generic 500; details stay in logs

INTERVIEW LENS:
“Recovery endpoints avoid account enumeration, keep raw bearer tokens out of the database, expire them quickly, and revoke renewable sessions after password change.”

SOURCE MAP:
vitaltrack-mobile/app/(auth)/forgot-password.tsx · app/(auth)/reset-password.tsx · app/profile.tsx · services/auth.ts · vitaltrack-backend/app/api/v1/auth.py · app/utils/email.py · app/utils/rate_limiter.py · app/main.py · app/core/config.py · app/models/user.py

Do not claim email is sent synchronously. Do not show a GET request deleting the account; only POST confirmation performs deletion. Do not label Brevo as SMTP.

FINAL IMAGE QA
Verify reset and deletion are separate, both hash/expiry commits precede email, the reset destination is a backend-hosted browser page, GET deletion is non-mutating, POST deletion is destructive, all seven cascade targets appear, the polling-to-logout chain is complete, password change is marked backend-only in current UI, compare methods are not overgeneralized, CORS is not presented as authentication, and the two-worker rate-limit limitation remains visible.

END STANDALONE POSTER PROMPT
~~~~

---

## Poster 09 — Inventory CRUD and optimistic concurrency

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository, uploaded source, previous poster, earlier conversation, or internet access. This prompt is the complete factual and visual specification for one CareKosh inventory poster. Never ask for files, infer an optimistic UI, or substitute a typical CRUD implementation. Generate exactly one finished educational poster. The `SOURCE MAP` is literal provenance text only.

AUTHORITATIVE PROJECT CONTEXT
CareKosh inventory belongs to the authenticated user. The Expo form sanitizes fields and sends server-first mutations; FastAPI validates the schema, scopes category and item access by `current_user.id`, and commits ActivityLog/AuditLog evidence with item writes. Items carry an integer `version`. Updates use one database compare-and-swap statement whose `WHERE` clause includes the client's version; a stale editor updates zero rows and receives a structured 409. The app then must refetch and reconcile. The current item screen edits quantity through the full-item `PUT`; a specialized stock `PATCH` exists in client/backend code but is not called by a current screen.

TEACHING GOAL
Teach the complete create/edit/delete surface, validation at both client and server boundaries, ownership, duplicate and restore behavior, pending UI feedback, database-enforced optimistic concurrency control (OCC), conflict recovery, and the honest limitations of the current duplicate/OCC UX.

RENDERING CONTRACT
Render all eight fully qualified endpoint chips, both flows, the two-caregiver race, exact SQL, structured conflict response, four bottom cards, and all current-implementation caveats. Quoted and code text is locked. Do not render prompt meta-headings. At 2400 × 3000, target at least 72 px title, 38 px section labels, 27 px body, 24 px mono, and 19 px provenance; remove decoration before shrinking technical copy.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“INVENTORY INTEGRITY UNDER CONCURRENCY”
Subtitle: “Ownership + validation + version compare-and-swap + audit”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “09 / 12” at top-right.

STYLE
Warm cream #F7F1E7 canvas, ivory #FFFDF8 cards, espresso #2F2924 text, deep teal #176B68 confirmed writes, sage #829985 snapshots/history, amber #C47C3C stale-state warnings, terracotta #B85C4B conflicts, slate blue #4F6D7A database boundaries, sand #D8CBBB dividers. Use a central two-caregiver race diagram, crisp mono SQL, thin precise arrows, sophisticated serif/sans/mono typography. No neon, no 3D, no cartoons, no clutter.

LAYOUT GEOMETRY
Use 5% outer margins and a 12-column grid. Header + endpoint rail = 14%; create/edit flows = 21%; concurrency race = 31%; four concept cards in a 2 × 2 grid = 22%; guards/low-stock/invalidation rails = 5%; interview/source footer = 7%. These percentages include internal gutters. Keep the race dominant and render rails as terse chips.

TOP BAND — “ITEM API SURFACE”
Use compact endpoint chips:
GET /api/v1/items
GET /api/v1/items/stats
GET /api/v1/items/needs-attention
GET /api/v1/items/{item_id}
POST /api/v1/items
PUT /api/v1/items/{item_id}
PATCH /api/v1/items/{item_id}/stock
DELETE /api/v1/items/{item_id}

Add a small truthful note:
“The current item form edits quantity through full-item PUT. The specialized stock PATCH and useUpdateStock() exist, but are not currently called by a screen.”

LEFT FLOW — “CREATE”
ItemFormScreen.handleSave()
→ sanitize/strip empty optional fields + require online state
→ useCreateItem()
→ itemService.create()
→ POST /api/v1/items
→ Pydantic range + URL + string validation
→ create_item()
→ verify category belongs to current user
→ reject case-insensitive duplicate name across all of the current user’s items
→ insert Item with version = 1
→ ActivityLog + AuditLog
→ commit
→ invalidateQueries({ queryKey: ["items"] })
→ invalidateQueries({ queryKey: ["activities"] })

Add a dotted alternative before POST:
“If a new-name match finds an inactive cached item: PUT that item with isActive=true and its current version instead of creating a duplicate.”

Add an amber integrity caveat:
“No database UNIQUE(user_id, lower(name)) constraint exists. Two concurrent creates can pass the read check and race.”

RIGHT FLOW — “EDIT”
ItemFormScreen reads cached item.version = N
→ useUpdateItem()
→ itemService.update()
→ PUT /api/v1/items/{item_id}, body includes version = N
→ update_item()
→ Pydantic validates edited ranges/strings/URLs
→ validate item and category ownership
→ atomic SQL compare-and-swap

Beside the edit flow, add UI feedback:
mutation key identifies mutation type, such as ["item-update"]
usePendingItemIds() reads item ID from mutation variables
→ badge “Updating…”
authoritative displayed values remain unchanged until backend success + refetch

CENTERPIECE — “TWO CAREGIVERS, ONE ITEM”
Draw an illustrative sequence with Item quantity 10, version 7. Label: “Whichever CAS reaches PostgreSQL first wins; A is the example winner.”

Caregiver A reads quantity 10 / v7.
Caregiver B reads quantity 10 / v7.
A sends quantity 12 / v7.
B sends quantity 8 / v7.

Show the exact conceptual SQL:
UPDATE items
SET quantity = :new_quantity,
    version = version + 1
WHERE id = :id
  AND user_id = :user_id
  AND version = :client_version
RETURNING id

Branch outcomes:
A updates one row → quantity 12 / version 8 → 200
B updates zero rows → HTTP 409 “Version conflict”
Response details: error · message · server_version · server_quantity
Caption: “Conflict fields come from the pre-CAS loaded snapshot and may already be stale; refetch for the authoritative latest item.”
Bold caption:
“The check and write happen in one database statement; this prevents lost updates.”

BOTTOM CARDS

CARD 1 — “WHY OPTIMISTIC CONCURRENCY CONTROL (OCC)?”
No long-lived lock while a human edits.
Excellent when collisions are uncommon.
Trade-off: client must recover from 409.

CARD 2 — “RECOVERY DESIGN”
Best practice after 409:
refetch latest item → show differences → reconcile intent → retry with latest version
Honest current caveat:
“Generic retry can reuse the stale version; improve the conflict-specific UX.”

CARD 3 — “HISTORY”
ActivityLog = readable event for Recent Activity
AuditLog = old/new mutation evidence
Both are added in the item transaction.

CARD 4 — “DELETE”
DELETE is a hard delete.
Client treats 404 as an idempotent success.
isActive supports hide/restore, but DELETE does not soft-delete.

Add small database guard labels:
items.quantity ≥ 0
all queries include Item.user_id == current_user.id

Add a tiny `LOW-STOCK SEMANTICS` card:
Dashboard/UI also treats a critical item at quantity 1 as low.
Backend stats/filter uses 0 < quantity < minimum_stock.
Current Dashboard computes from useItems(), not /items/stats.

INVALIDATION RAIL:
invalidateQueries({ queryKey: ["items"] })
“Prefix invalidation also covers item/stat subkeys.”
invalidateQueries({ queryKey: ["activities"] })

INTERVIEW LENS:
“CareKosh uses database-enforced optimistic concurrency: a version predicate and increment in one UPDATE turn a stale overwrite into an explicit 409.”

SOURCE MAP:
vitaltrack-mobile/app/item/[id].tsx · hooks/useServerMutations.ts · hooks/usePendingItems.ts · services/items.ts · vitaltrack-backend/app/api/v1/items.py: create_item, update_item, update_stock, delete_item · app/models/item.py · app/services/audit.py · alembic/versions/20260406_add_version_audit_log_quantity_check.py

Do not show pessimistic row locks. Do not claim the current screen uses PATCH stock. Do not show an optimistic client cache write before backend confirmation.

FINAL IMAGE QA
Verify eight fully qualified endpoints; both-boundary validation; user-wide duplicate scope; inactive-item restore branch; missing DB uniqueness caveat; create audit/activity transaction; mutation-key-type plus variable-derived pending item ID; illustrative first-CAS-wins label; exact CAS and pre-CAS 409 snapshot caveat; ASCII prefix invalidation; low-stock semantic difference; hard-delete behavior; and current PUT-versus-unused-PATCH truth. No row lock, blind overwrite, or optimistic client mutation may appear.

END STANDALONE POSTER PROMPT
~~~~

---

## Poster 10 — Orders and atomic stock application

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository, source upload, previous poster, conversation history, or internet access. This prompt alone is the complete CareKosh order-flow specification. Do not ask for code, infer conventional commerce behavior, or overstate delivery guarantees. Generate exactly one final educational poster. The `SOURCE MAP` is visible provenance copy only.

AUTHORITATIVE PROJECT CONTEXT
CareKosh purchase orders are user-owned records whose lines snapshot item and supplier facts. Creating an order does not change inventory. The backend owns the order identifier, totals, transition validation, and stock application. Current mobile screens expose a short path from `pending` to `received` to `stock_updated`, while the backend supports a richer finite-state machine. Applying a received order uses a conditional status claim and database-side item increments inside one PostgreSQL transaction. That gives at-most-one stock effect for an order under this transaction; it is not a distributed exactly-once delivery guarantee or an idempotent-success response.

TEACHING GOAL
Make a learner able to explain order selection, snapshotting, server-owned calculations, state transitions, conditional writes, transaction rollback, double-apply prevention, local PDF export, current client/server contract debt, and operational edge cases.

RENDERING CONTRACT
Render the full state machine, all fully qualified routes, mobile cart rules, create chain, snapshot fields, eight-step apply chain, exact claim/increment SQL concepts, three failure scenarios, and honest mismatches. Locked technical text must remain exact. Do not render prompt meta-headings. At 2400 × 3000, target at least 72 px title, 38 px section labels, 27 px body, 24 px mono, and 19 px provenance.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“FROM PURCHASE ORDER TO INVENTORY — SAFELY”
Subtitle: “State machine, historical snapshots, atomic claim, and single-application stock effect”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “10 / 12” at top-right.

STYLE
Warm cream #F7F1E7 background, ivory #FFFDF8 cards, espresso #2F2924 text, deep teal #176B68 valid transitions/commits, muted sage #829985 historical snapshots, amber #C47C3C intermediate states, terracotta #B85C4B invalid/double-apply paths, slate blue #4F6D7A transaction boundary, sand #D8CBBB dividers. Elegant finite-state-machine plus transaction diagram, serif/sans/mono typography, high legibility, no neon, no 3D, no busy warehouse illustration.

LAYOUT GEOMETRY
Use 5% margins and a 12-column grid with a two-panel internal composition. Header + backend state machine = 23%. Main body = 52%, split into `CREATE + SNAPSHOT` on the left 46% and `APPLY TRANSACTION` on the right 54%. Failures/current edges = 17%. Interview/source footer = 8%. Percentages include internal gutters. Put CURRENT UI in a small inset, and nest the cart/contract/PDF notes as compact side chips rather than independent large cards.

TOP — “BACKEND ORDER STATE MACHINE”
Draw exact states and allowed arrows:
pending → ordered
pending → received
pending → declined
ordered → partially_received
ordered → received
partially_received → received
received → stock_updated ONLY through POST /api/v1/orders/{order_id}/apply

Add a small UI truth:
“Current mobile UI exposes the shorter path: pending → received → stock_updated.”
Add an invalid arrow with a cross:
“PATCH /api/v1/orders/{order_id}/status directly to stock_updated — rejected.”

Add the status-update concurrency rule:
PATCH /api/v1/orders/{order_id}/status
conditional update WHERE Order.status == old_status
concurrent transition that updates zero rows → 409

Add a small `CURRENT CLIENT TYPE DEBT` note:
“Mobile types include cancelled/completed; the backend state machine does not.”

MIDDLE LEFT — “CREATE ORDER”
CreateOrderScreen
→ cached item selection + requested quantities
→ useCreateOrder()
→ orderService.create()
→ POST /api/v1/orders
→ _validate_order_items_belong_to_user()
→ server calculates totals and creates ORD-YYYYMMDD-NNNN
→ insert Order(status = pending)
→ insert OrderItem snapshots
→ ActivityLog(order_created)
→ one commit
→ invalidate [orders] + [activities]
→ generate/share PDF locally

Add a `MOBILE CART RULES` card:
regular ordering priority: out-of-stock → critical at quantity 1 → low-stock
suggested quantity = max(minimumStock - currentStock, 1)
emergency mode insertion order = critical items at quantity 1 first → all out-of-stock items second, with duplicates suppressed

Add an `API CONTRACT DEBT` card:
“The client sends placeholder orderId, totals, status, and exportedAt because OrderCreate currently requires them. The backend recalculates or overrides them.”

Add beside server ID generation:
UTC format ORD-YYYYMMDD-NNNN
UNIQUE orders.order_id
three total attempts = initial attempt + at most two conflict retries

Show an OrderItem snapshot card:
name · brand · unit
quantity requested
current_stock · minimum_stock
supplier_name · purchase_link
image_uri
item_id = logical reference, not a database FK
Caption:
“History stays readable even if the live Item later changes or is deleted.”
Add an amber data-trust caveat:
“Backend verifies referenced item IDs belong to the user, but persists client-supplied snapshot fields such as name, brand, current stock, and supplier data; it does not reload/canonicalize those fields.”

PDF callout:
“Generate/share on device after the server response; not uploaded. orders.pdf_path remains unused by this path.”

MIDDLE RIGHT — “APPLY RECEIVED ORDER”
POST /api/v1/orders/{order_id}/apply
→ apply_order_to_stock()
1. Verify owned order exists.
2. Require status = received and non-empty lines.
3. Precheck every live Item exists and belongs to user.
4. Atomically claim the order:
   UPDATE orders
   SET status = stock_updated, applied_at = now
   WHERE id = :id
     AND user_id = :user_id
     AND status = received
   RETURNING id
5. For each order line:
   UPDATE items
   SET quantity = quantity + :ordered_qty,
       version = version + 1
   WHERE id = :item_id
     AND user_id = :user_id
6. Add one per-item AuditLog.
7. Add one ActivityLog(order_applied).
8. Commit the entire unit once.

Draw an outer slate-blue `SQLALCHEMY TRANSACTION` boundary beginning with the first database SELECT/precheck and ending at commit. Inside it, highlight steps 4–8 as the `ATOMIC WRITE + COMMIT SET` so the mutating unit is visually distinct.

BOTTOM — “WHY DOUBLE APPLY AND PARTIAL APPLY FAIL”
Use three scenarios:

Double tap:
Request A claims received → stock_updated.
Request B finds no received row → rejected.

Missing item:
Precheck fails before claim → 409 → no stock changed.

Mid-transaction exception:
get_db rolls back claim + all earlier increments + audit rows.

Add a card:
“DB-side quantity = quantity + N avoids stale read-modify-write.”

Add query invalidation:
success → invalidate ["items"] + ["orders"] + ["activities"]

Add an `HONEST CURRENT EDGES` rail:
• CreateOrderScreen consumes unfiltered useItems(); inactive records can currently appear.
• useOrders() fetches backend page 1 only: default 20 orders.
• Mobile renders Remove for every order; backend permits delete only for pending or declined.
• Per-item stock AuditLog + one order-applied ActivityLog are written. Order create/status/delete do not create order-level AuditLog rows.

INTERVIEW LENS:
“The order status is a latch. A conditional received → stock_updated claim plus item increments in one transaction gives at-most-one stock effect per order; a repeated apply is rejected.”

SOURCE MAP:
vitaltrack-mobile/app/order/create.tsx · app/(tabs)/orders.tsx · hooks/useServerMutations.ts · services/orders.ts · vitaltrack-backend/app/api/v1/orders.py: create_order, update_order_status, apply_order_to_stock · app/models/order.py · app/models/item.py · app/services/audit.py

Do not show stock changing when the order is merely created or marked received. Do not draw order_items.item_id as a foreign key. Do not call the endpoint globally exactly-once or idempotent-success: a request may arrive zero times, and a retry after a lost success response is rejected rather than replaying the original success.

FINAL IMAGE QA
Verify all backend states/arrows; fully qualified create/status/apply routes; exact emergency insertion order; client/server type and payload debt; server-owned ID format with three total attempts; complete snapshot plus client-supplied-field trust caveat; local-only PDF; conditional status update; inactive-item UI edge; outer transaction and inner atomic-write set; owned precheck; claim/increment; three failure scenarios; page-20/delete mismatches; audit/activity scope; and at-most-one wording. Inventory must not change at create or receive.

END STANDALONE POSTER PROMPT
~~~~

---

## Poster 11 — Environments, CI/CD, deployment, and operations

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository, deployment dashboard, uploaded file, previous poster, earlier conversation, or internet access. This prompt is the complete closed-world specification for one CareKosh delivery/operations image. Never ask for files or infer that a dashboard-managed integration, monitor, backup, or deployment succeeded merely because configuration exists in code. Generate exactly one finished educational poster. The `SOURCE MAP` is visible provenance only.

AUTHORITATIVE PROJECT CONTEXT
CareKosh has an Expo Android client, a Dockerized FastAPI modular monolith on Render, and PostgreSQL on Neon. Mobile API URLs are baked into each EAS build; backend databases and secrets are runtime environment variables. Pull requests run separate blocking backend/frontend jobs plus advisory checks. A merge-to-main deployment job either calls a configured Render deploy hook or assumes an external Render GitHub integration. The Docker entrypoint waits for PostgreSQL, applies Alembic migrations fail-closed, and starts exactly two Uvicorn workers under Gunicorn. Render and production Docker probe process-only `/live`; database readiness is separately reported by `/health`. Repository configuration proves intended wiring, not that external monitors, backups, Sentry, dashboard integrations, or successful post-deploy health are active.

TEACHING GOAL
Teach environment separation, build-time versus runtime configuration, CI gates, configuration-dependent deploy triggers, container boot ordering, migration risk, database connection budgeting, liveness versus readiness, observability, and the honest operational work still owned by humans.

RENDERING CONTRACT
Every matrix entry, gate, deploy step, probe distinction, runtime variable, pool number, and operations caveat below is locked project truth. Render exact labels and do not print prompt meta-headings. Generate one poster—not a CI screenshot. At 2400 × 3000, target at least 72 px title, 38 px section labels, 27 px body, 24 px mono, and 19 px provenance. Reduce icons before shrinking text.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“FROM PULL REQUEST TO A RUNNING CAREKOSH RELEASE”
Subtitle: “Quality gates, environment-bound builds, migrations, probes, and operational reality”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “11 / 12” at top-right.

STYLE
Warm cream #F7F1E7 canvas, ivory #FFFDF8 cards, espresso #2F2924 type, deep teal #176B68 passing flow, slate blue #4F6D7A infrastructure, sage #829985 observability, amber #C47C3C advisory/manual steps, terracotta #B85C4B failed gates, sand #D8CBBB dividers. Precise CI DAG and deployment timeline, minimal technical icons, serif/sans/mono typography, no neon DevOps dashboard, no 3D cloud art, no clutter.

LAYOUT GEOMETRY
Use 5% outer margins and a 12-column grid. Top 23%: title, environment matrix, and isolation rail. Middle 34%: CI graph left and boot/deploy timeline right. Lower 31%: probes and observability cards plus compact full-width rails for pool math/runtime configuration and operations reality. Final 12%: Interview Lens and Source Map. Percentages include internal gutters. Connect build-time and runtime paths with differently labeled arrows. Keep pool/configuration facts as terse chips so the CI and timeline columns stay legible.

TOP — “THREE MOBILE ENVIRONMENTS”
Build a three-column matrix:

DEVELOPMENT
Artifact: development APK / local Expo
API: http://localhost:8000
DB: local PostgreSQL
Cleartext: development-only

PREVIEW
Artifact: internal APK
API: https://staging-api.carekosh.com
DB target: staging PostgreSQL on Neon — verify in provider dashboard
app.config.js rejects the wrong preview URL

PRODUCTION
Artifact: Android App Bundle
API: https://api.carekosh.com
DB target: production PostgreSQL on Neon — verify in provider dashboard
app.config.js rejects wrong/non-HTTPS production wiring

Place a label:
“EXPO_PUBLIC_API_URL is baked into the build.”

REQUIRED ENVIRONMENT ISOLATION — VERIFY IN PROVIDER DASHBOARDS
Same application code and Docker definition.
Different build-time mobile API URL.
Each backend environment must use a different runtime DATABASE_URL and SECRET_KEY.
“If signing secrets differ, a staging JWT cannot verify in production.”

Repository truth:
• Production Render service is declared in render.yaml: starter plan, Singapore.
• Staging Render service/plan is dashboard-managed, not declared in render.yaml.
• Do not claim the repository proves staging provider settings.

MIDDLE LEFT — “PULL REQUEST QUALITY GATES”
Draw a GitHub Actions DAG:

BACKEND — BLOCKING
PostgreSQL 16 service
Python 3.11
Ruff
pytest + coverage
exact /api/v1 route count = 39
items.py and orders.py coverage ≥ 70%

FRONTEND — BLOCKING
Node 20
npm install
TypeScript tsc --noEmit
ESLint
Expo Doctor advisory output

ADVISORY
mypy baseline
Trivy HIGH/CRITICAL baseline

Required backend + frontend pass → “PR Ready to Merge” check becomes green.
Caption: “Actual merge enforcement depends on GitHub branch-protection settings outside the repository.”

MIDDLE RIGHT — “BACKEND DEPLOY”
Merge to main
→ GitHub Actions gates
→ deploy-backend job
→ multi-stage Python 3.12 slim Docker image
→ non-root appuser
→ docker-entrypoint.sh
→ pg_isready up to 30 × 2 seconds
→ alembic upgrade head; abort if migration fails
→ Gunicorn master
→ 2 UvicornWorker processes
→ serve FastAPI on Render starter, Singapore

Add a `DEPLOY TRIGGER — CONFIGURATION DEPENDENT` decision card:
RENDER_DEPLOY_HOOK present → GitHub Actions calls the hook
RENDER_DEPLOY_HOOK absent → job assumes Render GitHub integration handles auto-deploy
Honest caveat: “The repository cannot prove that dashboard integration is active. CI does not wait for Render health or run a blocking post-deploy smoke.”

Add a database-pool note:
Per worker: pool_size 5 + max_overflow 10
Two workers theoretical app ceiling: 30 connections
statement_timeout: 8 seconds
pool_pre_ping: true
SSL outside development/testing

Add a `TWELVE-FACTOR RUNTIME CONFIG` card:
DATABASE_URL
SECRET_KEY
ENVIRONMENT
CORS_ORIGINS
REQUIRE_EMAIL_VERIFICATION
MAIL_PASSWORD + MAIL_FROM
FRONTEND_URL
SENTRY_DSN optional
Caption: “Secrets and environment choices are injected; they are not baked into the Docker image.”

BOTTOM LEFT — “LIVENESS ≠ READINESS”
Make a clear comparison:

/live
process only
does not touch DB
database: not_checked
used by Render and production Docker
DB-independent probe prevents a Neon outage from causing a container restart storm

/health
runs SELECT 1
2-second hard timeout
200 ready / 503 unavailable
used by clients and diagnostics

BOTTOM RIGHT — “OBSERVABILITY + FAILURE BOUNDARIES”
X-Request-ID on every response
plain timestamped stdout logs
optional Sentry, environment tagged, 10% traces
422 validation detail
409 generic integrity conflict
500 generic client message, stack only in logs
security headers + production HSTS

Add an honest note:
“Mobile production release remains a deliberate EAS/Play workflow; the CI production build job is disabled.”

Add an `OPERATIONS REALITY` card:
• Uptime-monitor YAML is a template; active external monitors are not proven.
• smoke_api.py defaults to safe read-only checks; production requires an explicit allow flag.
• restore_drill.py has disposable-target guards. Evidence proves a local disposable PostgreSQL restore, not a completed real Neon restore drill.
• Backup/point-in-time recovery (PITR) policy is documented; automated production backup execution is not established here.
• Backend rollback is operator-driven. A bad mobile release is paused and replaced by a higher-version AAB; installed clients cannot be instantly rolled back.

INTERVIEW LENS:
“We separate build-time environment wiring, pre-merge quality gates, fail-closed schema migration, process liveness, and database readiness so each failure produces the right operational action.”

SOURCE MAP:
.github/workflows/ci.yml · vitaltrack-backend/Dockerfile · vitaltrack-backend/docker-entrypoint.sh · vitaltrack-backend/render.yaml · vitaltrack-backend/app/main.py · vitaltrack-backend/app/core/config.py · vitaltrack-backend/app/core/database.py · vitaltrack-backend/alembic/env.py · vitaltrack-backend/scripts/smoke_api.py · vitaltrack-backend/scripts/restore_drill.py · docs/monitoring/carekosh-uptime-monitors.example.yml · vitaltrack-mobile/eas.json · vitaltrack-mobile/app.config.js

Do not show four workers, a Render free plan, SMTP, Kubernetes, active-active services, Redis, or `/health` as the Render restart probe. Do not imply that one identical prebuilt image is promoted through all environments, staging is declared in render.yaml, monitors/backups/Sentry are confirmed active, branch protection is proven, or CI waits for a successful Render deployment. Use exactly two workers and `/live`.

FINAL IMAGE QA
Verify all three mobile environments and isolation facts; 39-route and coverage gates; blocking versus advisory semantics; branch-protection caveat; deploy-hook decision; multi-stage/non-root image; database wait and fail-closed Alembic; two-worker/30-connection math; all runtime variables; `/live` versus `/health`; plain logs and optional Sentry; disabled mobile CI release; and every operations-reality qualifier. CURRENT repository evidence must never be drawn as proof of external state.

END STANDALONE POSTER PROMPT
~~~~

---

## Poster 12 — Defend, test, and scale the design in an interview

### Copy-ready image-generation prompt

~~~~
BEGIN STANDALONE POSTER PROMPT

KNOWLEDGE CONTRACT
You have no repository, uploaded files, previous posters, conversation history, or internet access. This is the complete, authoritative specification for one CareKosh system-design interview poster. Do not ask for evidence files, invent test coverage, or draw a future component as current. Generate exactly one finished educational poster. The `SOURCE MAP` is visible provenance text only.

AUTHORITATIVE PROJECT CONTEXT
CareKosh is a server-first Expo/FastAPI/PostgreSQL home-ICU inventory system. The current backend is a modular monolith with async SQLAlchemy, signed access JWTs, stateful rotating refresh sessions, application-enforced `user_id` ownership, item version compare-and-swap, and transactional order application. CI runs integration-heavy backend tests against disposable real PostgreSQL. Current production uses two API workers, each with pool size 5 and overflow 10, so one service can open up to 30 application database connections. Rate limiting remains in-process, email uses non-durable BackgroundTasks, Sentry is optional, and client refresh failure has a waiter-release defect. Redis, a durable queue, PostgreSQL row-level security (RLS), a PgBouncer connection pooler, replicas, sharding, and microservices are future options only.

TEACHING GOAL
Give a candidate a complete interview narrative: connect product risk to present design decisions; prove concurrency with conditional SQL and executable tests; quantify present ceilings; admit gaps precisely; and evolve the architecture only after measured evidence.

RENDERING CONTRACT
Render the current/future distinction, six defendable choices, verified confidence stack and gaps, current ceilings, evidence-led scale ladder, six-beat story, three database proofs, five question chips, and footer. Locked technical text must remain exact. Do not print prompt meta-headings. At 2400 × 3000, target 72 px title, 38 px section labels, 27 px body, 24 px mono, and 19 px provenance. If space is tight, use concise cards and remove decorative icons; do not make proof text microscopic.

Create one high-resolution portrait educational poster, 4:5 aspect ratio, titled:

“DEFEND THE DESIGN — THEN SCALE IT”
Subtitle: “The interview map: decisions, evidence, limits, and evolution”
Series mark: “CAREKOSH BACKEND · BYTE BY BYTE” at top-left; “12 / 12” at top-right.

STYLE
Warm cream #F7F1E7 premium canvas, ivory #FFFDF8 cards, espresso #2F2924 text, deep teal #176B68 current strengths, slate blue #4F6D7A current architecture, sage #829985 test evidence, amber #C47C3C trade-offs/future steps, terracotta #B85C4B current risks only, sand #D8CBBB dividers. Clear visual hierarchy, serif/sans/mono typography, refined thin-line diagrams. No neon, no 3D, no startup buzzword cloud, no pretending future components already exist.

LAYOUT
Use 5% margins and a strict 12-column grid. Top 9%: title. Middle 48%: four equal quadrants in a 2 × 2 grid. Interview story + five question chips = 19%. SQL proofs = 16%. Interview Lens + Source Map = 8%. Percentages include internal gutters. CURRENT uses solid ivory cards with teal/slate lines. FUTURE uses one dashed amber boundary carrying the exact label `FUTURE — NOT CURRENT`. Use compact subcards inside each quadrant, but never shrink SQL or caveats below the stated minimum type.

QUADRANT 1 — “CURRENT DESIGN I CAN DEFEND”
Create six decision → reason cards:
1. Server-first → correctness over offline write conflicts
2. Modular monolith → simple deployment + atomic transactions across order, stock, and audit rows
3. Async FastAPI + asyncpg → efficient I/O concurrency
4. Access JWT + stateful rotating refresh → fast requests + revocable renewal
5. user_id query scoping → tenant authorization / insecure direct object reference (IDOR) prevention
6. Optimistic concurrency control (OCC) + conditional SQL → explicit conflicts without long human-held locks

Add:
“Business logic currently lives mostly in route modules: pragmatic now, extract domain services when reuse and complexity justify it.”

QUADRANT 2 — “INTEGRATION-HEAVY CONFIDENCE STACK”
132 test functions across five backend test files: 94 async + 38 synchronous.
1. Real FastAPI app in-process: httpx AsyncClient + ASGITransport
2. Disposable real PostgreSQL: drop/create schema per test
3. Full boundary: middleware → routing → Pydantic → dependencies → SQLAlchemy → response
4. Race tests: concurrent refresh rotation · item OCC · order transition/apply
5. CI guards: exact 39-route contract · items.py + orders.py coverage ≥ 70%
6. Focused units: JWT · Argon2 · config · email redaction · restore safeguards

Add an `HONEST TEST GAPS` inset:
• Tests use Base.metadata.create_all(), not the Alembic migration chain.
• Rate limiting is disabled in the API harness.
• Mobile has TypeScript/ESLint gates but no working Jest suite.
• Smoke/restore tools are operational evidence, not proof of automated production recovery.

Use a green badge:
“Confidence comes from executing ownership, failure, and race invariants—not from coverage percentage alone.”

QUADRANT 3 — “HONEST CURRENT CEILINGS”
Use restrained amber cards:
• In-memory rate limits are per worker and reset on deploy → Redis-backed limiter when horizontally scaled.
• FastAPI BackgroundTasks are not durable → queue + worker for guaranteed email retry.
• Refresh revocation does not kill already-issued access JWTs before their 30-minute expiry.
• Failed client refresh can leave waiting subscribers unresolved → release all waiters on success or failure.
• Ownership is application-enforced; a missed user_id predicate is risky → consider PostgreSQL row-level security (RLS) as defense in depth.
• Fat route handlers are simple but reduce reuse → introduce focused domain services, not ceremony everywhere.

Add three concise ceiling chips under the six cards:
• Connection budget: 2 × (pool 5 + overflow 10) = up to 30 app connections; more API instances multiply DB pressure.
• Alembic-on-every-container boot is simple for one service; fleets need one release migration job, and current CI does not exercise the migration chain.
• X-Request-ID reaches responses but is not injected into every log record; active monitoring is not proven.

QUADRANT 4 — “SCALE ONLY WHEN EVIDENCE JUSTIFIES IT”
Visible banner: “FUTURE — NOT CURRENT”
1. Define load: request rate (RPS) · read/write ratio · data size · 95th-percentile (p95) latency · error budget
2. Profile PostgreSQL: EXPLAIN ANALYZE · slow queries · SQL aggregates · composite indexes · keyset pagination
3. Protect connections: tune per-process pools · Neon pooled endpoint or PgBouncer connection pooler · cap total connections
4. Scale stateless API behind a load balancer; move per-worker rate limits to shared state
5. Add selectively: durable email queue · Redis only for measured hot reads · replicas/partitioning/user_id sharding only after need

Caption:
“Likely first pressure point: PostgreSQL queries and connections, not Python process count.”

Add a principle card:
“Do not jump to microservices. Split only around independently scaling or independently owned capabilities.”

FULL-WIDTH BOTTOM — “90-SECOND INTERVIEW STORY”
Render this concise answer as six short beats, not one dense paragraph:
• Problem: family caregivers need trustworthy medical-supply counts.
• Flow: Expo → authenticated REST → FastAPI → async SQLAlchemy → PostgreSQL.
• Security: Argon2, rotating refresh sessions, user-scoped queries, hash-only email tokens.
• Consistency: server-first writes, item version CAS, transactional order application.
  Tiny qualifier: “double-apply-safe; not a global exactly-once claim”
• Operations: Docker on Render, Neon, Alembic-on-boot, CI gates, /live versus /health.
• Evolution: keep the modular monolith until metrics justify distributed infrastructure.

Add five interviewer-question chips:
“Why server-first?”
“Why not store all JWTs server-side?”
“How do you prevent lost updates?”
“Why is order apply safe twice?”
“What breaks first at 100× traffic?”

Add a full-width `THREE DATABASE PROOFS` rail above the footer:

REFRESH REPLAY
UPDATE refresh_tokens
SET is_revoked = true
WHERE jti = :jti
  AND user_id = :user_id
  AND is_revoked = false
RETURNING id

LOST UPDATE
UPDATE items
SET quantity = :new_quantity,
    version = version + 1
WHERE id = :item_id
  AND user_id = :user_id
  AND version = :client_version
RETURNING id

DOUBLE APPLY
UPDATE orders
SET status = :stock_updated,
    applied_at = :now
WHERE id = :order_id
  AND user_id = :user_id
  AND status = :received
RETURNING id

Caption: “These are conditional writes, not Python check-then-write sequences. Exactly one winner receives a row from RETURNING; zero rows means reject.”

INTERVIEW LENS:
“Strong candidates connect product risk to architecture, prove concurrency with SQL and tests, admit present limits, and scale in measured stages.”

SOURCE MAP:
vitaltrack-backend/tests/conftest.py · vitaltrack-backend/tests/test_auth.py · vitaltrack-backend/tests/test_items.py · vitaltrack-backend/tests/test_orders.py · vitaltrack-backend/tests/test_security.py · .github/workflows/ci.yml · vitaltrack-backend/app/api/v1/auth.py · vitaltrack-backend/app/api/v1/items.py · vitaltrack-backend/app/api/v1/orders.py · vitaltrack-backend/app/core/database.py · vitaltrack-backend/Dockerfile · vitaltrack-backend/render.yaml

Clearly distinguish CURRENT from FUTURE. Do not depict Redis, a queue, replicas, RLS, PgBouncer, or microservices as already implemented.

FINAL IMAGE QA
Verify all current choices are evidence-backed; the exact 132 total / 94 async / 38 synchronous / 5 files / 39 routes / 70% numbers and four test gaps appear; connection math equals 30; migration, logging, monitoring, rate-limit, background-task, access-JWT, and refresh-waiter ceilings are honest; every scale component sits inside `FUTURE — NOT CURRENT`; all three SQL proofs are conditional writes; and order wording is double-apply-safe, never global exactly-once. No invented present-day infrastructure may appear.

END STANDALONE POSTER PROMPT
~~~~

---

## Generation and review checklist

1. Generate only one numbered poster per request.
2. Ask for 4:5 portrait and the highest available resolution.
3. No reference image or source upload is required. Optionally use an accepted Poster 01 only for tighter visual consistency; every later prompt remains complete without it.
4. Inspect every endpoint, filename, code term, number, arrow direction, and negative claim after generation.
5. If text is misspelled, request a targeted correction without changing composition.
6. Reject a visually attractive image if it adds unimplemented technologies or changes a flow.
7. Export a readable master and a compressed sharing copy; preserve the master for zoomed study.
8. Use the posters in order for learning; use Posters 03, 06, 07, 09, 10, and 12 for concentrated interview revision.

## Code-truth correction ledger

Keep these facts when an older HTML/PDF guide says otherwise:

- Production runs two Gunicorn/Uvicorn workers, not four.
- render.yaml pins the production service to Render starter in Singapore, not the free tier.
- Render and the production Docker health check use /live; /health is database-backed readiness.
- Brevo is called through its HTTPS HTTP API, not SMTP.
- The schema has eight tables, including audit_log.
- Alembic head is 0006_order_item_qty_positive.
- AuditLog does not cover every mutation.
- Current migration history does not establish a database CHECK for every OrderStatus enum value.
- Logs are plain timestamped stdout text, not JSON structured logs.
- Sentry and monitoring integrations are optional/configuration-dependent; repository templates do not prove an external monitor is active.
