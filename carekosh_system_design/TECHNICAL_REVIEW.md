# CareKosh technical review history and documentation follow-up

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. This document’s original proposals/results remain historical; use the maintained guide for current behavior. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](../docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

**Latest status, 8 October 2026:** owner-authorized targeted application fixes now follow the documentation work. See the [application safety follow-up](#application-safety-follow-up) and [current hardening record](../docs/BACKEND_HARDENING.md#safety-follow-up-8-october-2026) for the new code and fresh tests. **Earlier documentation reviews:** the sections below preserve the original four- and eight-guide reviews. A later, separate review updated all 37 selected documents. The [documentation reliability follow-up](#documentation-reliability-follow-up) closes the known remaining documentation issues and explains which evidence was checked again. Earlier snapshots and test counts retain their original scope and dates; the current guides include later corrections.

Completed **8 October 2026**. The four guides and all **22 unique diagrams** were read and checked against the feature implementation and primary documentation. Several explanations and diagram paths needed corrections. The corrected guides are useful interview references for this implementation, with the limits below. This is a documentation review, not a certificate that the application or its deployment has no bugs.

## Code and evidence baseline

| Item | Baseline |
|---|---|
| Feature branch | `feature/backend-hardening-ai-voice-agent-foundation` |
| Local HEAD | `03cfebb8709f0396844c4585814f9fcb3abf9108` |
| Local `main` reference | `835fad322e5d0433653908398555ccc668ef8c9f` |
| Framework pins | FastAPI 0.115.6, Starlette 0.41.3, SQLAlchemy 2.0.36 |
| Registered HTTP operations | 47: 44 under `/api/v1`, plus three root operations |
| ORM application tables | 11; `alembic_version` is migration bookkeeping, not a twelfth application model |
| Feature migration head | `0010_order_local_id_unique` |
| Full application test evidence | The separate 7 October audit (local review reference; not published) records 242 backend tests, 121 mobile tests and an 89-step synthetic API walkthrough |

The full application suites and database walkthrough were **not rerun for the original four-guide review recorded in this section**. It used the 7 October logs. The separate 37-document review subsequently records a disposable-database rerun on 8 October: 242 backend tests, the 89-step walkthrough and 121 mobile tests passed. Those are that review's evidence, not reruns by the final follow-up. The original fresh checks below cover documentation, route/model metadata and three narrowly targeted request-ordering probes with an in-process fake session.

The existing checkout contains other documentation changes. This review changed only `carekosh_system_design/`. Application code, native voice code and database data were not changed. No commit, push, merge or deployment was performed.

## Coverage

| Guide | Content reviewed | Diagram appearances |
|---|---|---:|
| [System overview and API flows](01_system_overview_and_api_flows.html) | Stack, runtime topology, API map, request/response path, authentication, inventory, orders, voice, deletion, mobile caching and failure cases | 15 |
| [Backend and FastAPI interview guide](02_backend_fastapi_interview_guide.html) | Python async/GIL, dependency injection, middleware, sessions, transactions, ORM loading, schemas, authorization, concurrency, idempotency, reliability, tests and interview answers | 11 |
| [Developer onboarding](03_developer_onboarding_guide.html) | Branch selection, local setup, Docker, Expo/device connection, configuration, source navigation, development exercises, safe test commands and contribution workflow | 5 |
| [Environments and deployment](04_environments_and_deployment.html) | Environment separation, build-time versus runtime settings, CI triggers, Render configuration, migrations, release gates, backups and Play delivery | 4 |

All 35 inline diagram appearances were regenerated from their standalone SVGs. Semantic review included the titles, descriptions, boxes, arrow direction, branches and captions. The 22 diagrams are:

| Area | Diagrams |
|---|---|
| Architecture and API | `system-context`, `product-journey`, `backend-layers`, `request-journey`, `request-lifecycle`, `request-rollback`, `middleware-onion`, `dependency-graph` |
| Data, authentication and concurrency | `database-erd`, `auth-session`, `inventory-concurrency`, `order-idempotency`, `order-status`, `async-model` |
| Mobile and assistant | `mobile-cache`, `voice-flow` |
| Setup and operations | `local-setup`, `dev-workflow`, `environments`, `domains-email`, `release-pipeline`, `release-gate` |

## Corrections that matter in an interview

| Topic | Correct interpretation now used | Code or primary evidence |
|---|---|---|
| Validation order | Invalid fields cause 422 before the handler, but an authentication dependency can already have queried the database. Malformed JSON fails before those dependencies; a bad token plus schema-invalid JSON can produce 401. | [Dependency code](../vitaltrack-backend/app/api/deps.py); the fresh request probes below; [pinned FastAPI dependency resolution](https://github.com/fastapi/fastapi/blob/0.115.6/fastapi/dependencies/utils.py) |
| Session versus transaction | Protected business dependencies share a session. The session acquires a connection on first SQL and can span successive transactions. Explicit handler commits and AI's separate short sessions invalidate the blanket statement “one transaction per request.” | [Database/session code](../vitaltrack-backend/app/core/database.py), [AI guard](../vitaltrack-backend/app/services/ai_guard.py) |
| Error after commit | Rollback only undoes uncommitted work. A refresh, serialization or transport failure after a successful commit cannot undo the mutation. An error or missing reply therefore does not prove that nothing was saved. | Explicit commits followed by refresh in [items](../vitaltrack-backend/app/api/v1/items.py) and [orders](../vitaltrack-backend/app/api/v1/orders.py) |
| FastAPI version history | Pinned 0.115.6 exits yield dependencies before sending. From 0.118 the default exit is after sending; 0.121 adds explicit `scope="function"` for earlier exit. The guide now describes the default and the newer exception. | [Official FastAPI version history](https://fastapi.tiangolo.com/advanced/advanced-dependencies/) |
| Owner scoping | Protected business resources use owner checks. Global order counters, global AI quotas and authentication lookups are not all queries of the form `user_id = current_user.id`. | [API dependencies](../vitaltrack-backend/app/api/deps.py), [orders](../vitaltrack-backend/app/api/v1/orders.py), [AI quotas](../vitaltrack-backend/app/services/ai_guard.py) |
| ER diagram | Order lines belong to users through `orders`; they do not have a direct user foreign key. Their `item_id` is a snapshot reference without an item FK. The daily counter is global. `ai_consents.user_id` is both a primary key and a cascading FK. | [Order models](../vitaltrack-backend/app/models/order.py), [AI models](../vitaltrack-backend/app/models/ai.py); fresh metadata inspection |
| Order idempotency | Migration 0010 protects indexed non-null `(user_id, local_id)` keys while preserving and exempting later legacy duplicates. Replaying the same key with a changed payload still returns the original order. The guide no longer implies universal uniqueness of every historical row. | [Migration 0010](../vitaltrack-backend/alembic/versions/20261006_order_local_id_unique.py), [order replay code](../vitaltrack-backend/app/api/v1/orders.py) |
| Conflict response | The 409 values come from the handler's initial SELECT. PUT with a name takes a per-account name lock before that SELECT, so another such PUT waits; a stock PATCH or order apply does not take that name lock and can still make the read stale. Refetch after conflict. “Unchanged” refers to the losing request. The Edit Item form's known cache-version gap remains. | [Item compare-and-swap code](../vitaltrack-backend/app/api/v1/items.py) |
| Stock paths | Item creation sets initial stock. Existing quantities change through version-checked edits, the API-only stock adjustment endpoint, or applying a received order. Receiving an order alone does not add stock. | [Items API](../vitaltrack-backend/app/api/v1/items.py), [orders API](../vitaltrack-backend/app/api/v1/orders.py) |
| Audit and activity | Selected mutations create both history types atomically. Not every write creates both activity and audit rows, so the documentation must not promise a universal audit trail. | [Items](../vitaltrack-backend/app/api/v1/items.py), [categories](../vitaltrack-backend/app/api/v1/categories.py), [orders](../vitaltrack-backend/app/api/v1/orders.py) |
| Async and the GIL | An await yields control when it suspends; an already-ready result need not yield. Threads can interleave Python work and overlap I/O. CPU parallelism within a process depends on native code releasing the GIL; separate workers are separate processes. | [Python 3.12 tasks](https://docs.python.org/3.12/library/asyncio-task.html), [threading](https://docs.python.org/3.12/library/threading.html) |
| ORM loading | Select-in loading can issue multiple batches, including additional queries for nested relationships. Current SQLAlchemy 2.0 documentation marks `noload` as legacy; that is not a claim about the wording of the historical 2.0.36 docs. `raiseload` needs a tested behavior change. | [SQLAlchemy loading documentation](https://docs.sqlalchemy.org/en/20/orm/queryguide/relationships.html) |
| Timeout scope | The 8-second statement timeout belongs to the application engine, not Alembic's separate migration engine. Ordinary mobile requests and non-AI uploads still lack application deadlines. A client abort is not proof of server rollback. | [Application engine](../vitaltrack-backend/app/core/database.py), [Alembic engine](../vitaltrack-backend/alembic/env.py), [mobile client](../vitaltrack-mobile/services/api.ts), [body middleware](../vitaltrack-backend/app/services/ai_body_limit.py) |
| Deadlocks | Sorting shared item updates removes the opposing-order deadlock pattern between order applies. It is not proof that every transaction in the application is deadlock-free. | [Order application](../vitaltrack-backend/app/api/v1/orders.py) |
| Mobile writes and cache | `networkMode: 'always'` prevents deferred offline mutation replay; it does not guarantee instant network failure. Query-cache busting uses the Expo-visible app version, not `versionCode` alone. The API request precedes its `onSuccess` invalidation callback. | [QueryProvider](../vitaltrack-mobile/providers/QueryProvider.tsx), [mutations](../vitaltrack-mobile/hooks/useServerMutations.ts); corrected `mobile-cache` arrows |
| Voice branches | A supported local match goes directly to a read without Groq. Unmatched, opted-in questions may use cloud interpretation. The diagram now draws the local branch explicitly and names auth, consent and quota checks before Groq. | [Assistant services](../vitaltrack-mobile/services/assistant.ts), [AI API](../vitaltrack-backend/app/api/v1/ai.py) |
| LLM privacy and meaning | Groq receives question text, which can include sensitive item names or user-entered details. It receives no inventory dataset or mutation tools. Name checks normalize words and punctuation; they reject invented names but do not prove semantic accuracy. Strict schema compliance does not mean correct understanding of every sentence. | [AI provider code](../vitaltrack-backend/app/services/ai_provider.py), [Groq structured outputs](https://console.groq.com/docs/structured-outputs) |
| Read-only scope | The assistant does not mutate inventory or orders. Cloud consent and usage bookkeeping can write `ai_consents` and `ai_usage`. “No writes anywhere” would be false. | [AI API](../vitaltrack-backend/app/api/v1/ai.py), [AI guard](../vitaltrack-backend/app/services/ai_guard.py) |
| Optional speech services | Backend adapters reference configurable Kokoro/Piper services. Their code is not evidence that they are deployed; hosted speech output remains disabled; the 9 October current-source follow-up allows separately consented Groq transcription. The original review did not validate live providers. Speech-pack downloads use Moonshine's CDN rather than the API. | [AI provider](../vitaltrack-backend/app/services/ai_provider.py), [voice configuration](../vitaltrack-mobile/features/assistant/policy.ts) |
| Onboarding commands | Clone the feature branch explicitly to study this implementation. Empty exported mail/provider settings override `.env`; unsetting a variable can expose a file value. Preserve existing configuration when changing a LAN IP. The introductory exercise is a category filter rather than a destructive inventory-clear button. | Corrected [onboarding guide](03_developer_onboarding_guide.html); [settings loader](../vitaltrack-backend/app/core/config.py), [test fixtures](../vitaltrack-backend/tests/conftest.py) |
| Device connectivity | USB, Wi-Fi and tunnel choice is separate from Expo Go, APK or emulator choice. Expo tunnel serves the bundle; it does not automatically expose a local API. A loaded first screen does not prove that every later error is a backend failure. | [Expo variants documentation](https://docs.expo.dev/build-reference/variants/); corrected `local-setup` diagram |
| CI versus Render | Feature pushes alone do not trigger the repository's CI workflow. A Render service tracking that branch may still auto-deploy independently. A merge can deploy through a configured CI hook or enabled Render auto-deploy; live settings are not proven by YAML. | [CI workflow](../.github/workflows/ci.yml), [Render Blueprint specification](https://render.com/docs/blueprint-spec), [deploy lifecycle](https://render.com/docs/deploys) |
| Release safety | Disabling auto-deploy does not disable the CI deploy hook. Control both, test fresh and populated synthetic legacy upgrades, preserve staging data, and block/drain old writers before cutover. Healthy is not proof of deployed commit, migration completion or a restorable backup. | [Release gate in guide 4](04_environments_and_deployment.html#db-gate); [migration startup code](../vitaltrack-backend/docker-entrypoint.sh) |
| Migration and data portability | 0007 blocks automatic downgrade below that revision; the diagram no longer describes every later migration as intrinsically irreversible. Removing every URL query parameter can discard settings such as channel binding; SSL handled separately is not equivalent to preserving all URL options. | [Alembic versions](../vitaltrack-backend/alembic/versions), [database configuration](../vitaltrack-backend/app/core/database.py) |
| Authentication claims | Verification depends on both the verification flag and mail configuration and covers email accounts, not every public request or username-only account. A shared signing secret permits signature validation across environments; actual authentication also needs matching user/session state. | [Dependencies](../vitaltrack-backend/app/api/deps.py), [authentication](../vitaltrack-backend/app/api/v1/auth.py) |
| Provider/platform facts | Render shutdown timing includes the later SIGTERM and graceful interval; old instances do not necessarily disappear immediately on traffic switch. Play's 12-testers/14-days requirement applies to personal accounts created after 13 November 2023. Neon restore windows depend on the plan and history limits. | [Render deploys](https://render.com/docs/deploys), [Play requirements](https://support.google.com/googleplay/android-developer/answer/14151465), [Neon's official plan source](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md) |

The book section is a mapping from general engineering principles to this code, not quotations or proof that the application implements every pattern from those books. Capacity targets describe the solo developer's intended use; they are not measured throughput guarantees.

## Original four-guide verification results

| Check | Result and scope |
|---|---|
| Request ordering with actual pinned FastAPI application | Valid token + schema-invalid body → 422 after a fake auth SELECT; bad token + schema-invalid body → 401 without SELECT; malformed JSON → 422 without entering the session dependency |
| Runtime registration and ORM metadata | 47/44 HTTP operations; 11 application tables; order-line and global-counter FK claims independently confirmed without a database connection |
| Scoped documentation check | [check_guides.py](src/check_guides.py) checks local links, fragments, duplicate IDs, tag structure, XML references and exact agreement between inline diagrams and generated SVGs |
| Browser checks | Isolated headless Chromium at 1440×1000 and 390×844; all four pages checked, all 35 Enlarge/Close controls exercised; no page overflow, duplicate IDs, missing internal anchors or JavaScript exceptions |
| SVG geometry | All 22 diagrams rendered with the intended font; browser text bounds checked for canvas overflow and intersecting text; contact sheets and selected larger diagrams visually inspected |
| Generator repeatability | Regenerating diagrams and pages produces no further content change |
| Change boundary | Runtime file fingerprints and Git application diff checked; application files remain unchanged |

Raw fresh results are in verification/ (local review records; not published). The repository-wide `docs/tools/check_docs.py --strict` was also run, but its `CURRENT` allowlist does not include these four pages. Its success alone is not their structural gate; use the dedicated scoped check above. Neither checker proves prose accuracy or fetches every external URL.

## What this review does not establish

- The exact deployed Render commit, environment values, Neon schema, backup retention, DNS/proxy behavior or current GitHub ruleset. Dashboard and CI claims remain dated evidence or explicitly unverified.
- A native APK/AAB build, Play installation, real microphone recording, Moonshine accuracy, Android TTS behavior or real Groq/Sarvam/Kokoro/Piper/Brevo calls.
- Correct LLM interpretation of arbitrary language, load capacity at 10,000 accounts, or reliability at 100–1,000 simultaneous users.
- A backup restore drill, migration downgrade on a real database, universal deadlock freedom, or absence of all defects in the codebase.
- Safari, Firefox, native-device rendering or fresh print/PDF layout checks for these four pages.

Existing application findings are retained as findings, not silently converted into solved problems. In particular, CI success does not make advisory mypy errors disappear, and the documented edit-form conflict handling, access-token logout window and client timeout gaps remain application work.

## How to use the guides for interviews

Read overview → backend interview guide → onboarding → deployment. Explain what the current code actually does, distinguish a session from a transaction, and discuss the trade-offs and known limits. Use the diagrams as maps; use the linked code to demonstrate the behavior. Recheck the baseline when implementation or provider rules change.

## Final recheck of the eight recommended guides

**8 October 2026:** the four guides above were checked again alongside
[API traceability](../docs/API_TRACEABILITY.html),
[end-to-end verification](../CAREKOSH_E2E_VERIFICATION_GUIDE.html),
[build and deploy flow](../CAREKOSH_BUILD_DEPLOY_FLOW.html) and
[the local testing field manual](../docs/local_testing_field_manual.html).
The eight files matched their earlier reviewed snapshots before that pass. HEAD and the
framework pins remain as recorded above; the intervening application cleanup removed only
two unused imports. The four system-design guides needed no further content changes during that pass; the later 37-document review made additional corrections.

The older guides still contained inaccuracies despite the earlier audit. They were corrected
in this pass, including the canonical Markdown behind the generated API traceability page
and the source of its teaching diagrams:

- Authentication can perform a SELECT before schema-field validation; malformed JSON fails
  earlier. A successful mutation commits in its handler; response serialisation and dependency
  cleanup are distinct stages. Rollback does not undo an earlier commit.
- The stock PATCH walkthrough is API-only; the current mobile editor uses PUT and still has
  the documented cache-version defect A-1. Recommendations to refetch are distinguished from
  the app's actual error handling. Offline mutations do not queue, but can wait for a network
  failure because ordinary requests lack a deadline.
- Order idempotency is scoped to indexed non-null keys, with legacy duplicate rows retained.
  Replays with different schema-valid payloads return the original order. The curl retry
  exercise now deletes only the exact order id returned by that exercise.
- Groq's item-name check normalises case and punctuation; it is not semantic proof. Consent
  and usage metadata writes are explicit. One usage row corresponds to an accepted processing
  reservation; quota/consent rejection may create none. Provider settlement failure handling
  and optional speech-worker deployment limits are described accurately.
- Feature pushes can deploy a linked Render service even without a CI trigger. A main merge
  can deploy through configured triggers; it is not an unconditional deploy. Release guidance
  controls both auto-deploy and the CI hook, preserves staging data, tests fresh and populated
  synthetic legacy upgrades, and drains old writers. Migration 0008 creates AI tables; 0009
  adds scopes/provider fields. Migration 0010's lock duration is not guaranteed to be brief.
- Verification policy covers email accounts on login, refresh and protected routes when mail
  and the flag are configured; public endpoints are outside that policy. `/live` is independent
  of the database, but does not guarantee that no other platform condition can restart a service.
- The local manual now distinguishes native component implementations from a universal
  one-to-one widget mapping, development JavaScript from release Hermes bytecode, reachable
  dependencies from all of `node_modules`, and transpilation from type checking. Unmeasured
  bundle sizes and universal USB/tunnel guarantees were removed. ADB's client/server link is
  localhost TCP, and `/auth/me` updates the Zustand auth store rather than TanStack Query.

Primary sources were rechecked for [FastAPI dependency timing](https://fastapi.tiangolo.com/advanced/advanced-dependencies/),
[Render deployment controls](https://render.com/docs/deploys),
[React Native architecture](https://reactnative.dev/architecture/landing-page),
[Expo architecture compatibility](https://docs.expo.dev/guides/new-architecture/),
[Hermes bundles](https://docs.expo.dev/guides/using-hermes/) and
[Groq structured outputs](https://console.groq.com/docs/structured-outputs).
These sources explain framework/provider behavior; the pinned code establishes what this
application implements. The 7 October database walkthrough, full test counts and GitHub
observations retain their original dates and were not presented as new live verification.

Fresh request-ordering probes passed again (422 after fake auth SELECT, 401 for bad token,
malformed JSON 422 before the session dependency). Runtime metadata again reports **47/44
operations and 11 application tables**. No database connection, provider call, build, commit,
push, merge or deployment was performed for this recheck.

| Fresh final check | Result |
|---|---|
| Actual registered routes versus the API guide | 47/47 documented; 44 under `/api/v1`; no missing or invented operation |
| Repository documentation checker | 106 files, zero problems; external URLs counted separately, not all fetched |
| Scoped system-design checker | Seven documents, 22 SVGs, 35 inline appearances; zero problems |
| Isolated Chromium page checks | All eight guides at 1440×1000 and 390×844; no horizontal page overflow, duplicate IDs, missing internal anchors or JavaScript exceptions; all 35 Enlarge/Close controls passed |
| Regenerated API-guide diagrams | All 12 rendered; 537 text elements checked for canvas overflow and text collisions; zero reported issues; contact sheet and voice flow inspected visually |
| Repeatability and change boundary | Diagram and API HTML regeneration produced identical outputs; only 19 documentation/support files changed against the 532-file snapshot, with no application change |

Raw final logs, fingerprints and the isolated browser driver are retained in the owner's
ignored local records. The browser allowed only local files and font resources; it did not
call an application endpoint. These checks supplement the prose/source review; structural
and geometry checks alone do not prove conceptual accuracy. Earlier limitations concerning
live hosting, real providers, native devices and production capacity still apply.

**Interview verdict:** these eight guides are usable, code-grounded study material at the
recorded baseline, with known defects, historical evidence and unverified deployment/device
claims explicitly separated. This is not a promise that every statement will remain current
after code changes, or that every device, arbitrary spoken question or production workload
has been tested successfully.

## Documentation reliability follow-up

**8 October 2026, feature branch `03cfebb` plus working-tree documentation.** This follow-up reconciled the separate 37-row review ledger and the reviewers' remaining issues with the actual files and relevant source. It corrected the known leftovers and additional overstatements found while checking them. It did not independently repeat a line-by-line review of all 37 documents or rerun the full application suites.

| Remaining issue | Resolution and evidence |
|---|---|
| Misleading `sslmode` source comment reproduced in the interview guide | Clarified the teaching excerpt and labelled its comments as annotated. SQLAlchemy forwards the query value as a keyword unsupported by `asyncpg.connect`; asyncpg's own DSN parsing is a different path. Application source is unchanged. Checked against pinned SQLAlchemy 2.0.36 and asyncpg 0.30.0. |
| Screenshot README described nonexistent image slots | It now describes the 15 textual screenshot notes and the exact insertion step. Adding an image file alone does not display it. Dashboard images remain absent. |
| PR template implied Expo Go tests native voice | It now separates backend, supported Expo Go screens and native device tests. Preview build acceptance is distinguished from compilation; the stale fixed EAS quota and blanket database-isolation guarantee were removed. Workflow settings were not changed. |
| Earlier review summary appeared to contradict later corrections and tests | The original four/eight-guide sections are now explicitly historical review records. The separate 8 October full-suite evidence is attributed to its own review. |
| Two `main` claims were left unchecked | Read `main` at `835fad3`: `auth.py` permits a profile email change without resetting verification; the deletion-token lookup uses the model's select-in collections and ORM delete cascades. The concise developer guide labels this revision comparison. No live service was checked. |
| Environment guide overstated TLS, isolation and configuration guarantees | Local/testing omit the TLS argument; they do not explicitly disable it. Docker uses container networking and the development ports are published. Hosted settings and distinct secrets are intended settings, not dashboard evidence. The build's empty-URL guard gap and explicit cleartext override are documented. |
| AI middleware 401 was treated as proof of endpoint existence | The environment and voice guides now distinguish the prefix-based middleware response from an authenticated capabilities response and exact deployment evidence. The deployment guide's verification table was corrected too. |
| Project journey and challenges disagreed on dates and the refactor | April PR merge dates were checked against local Git; reported incident/setup dates remain labelled historical. Both guides describe the server-first series as PRs #4–#8 and distinguish server-data caching from UI/auth state. The concurrency gap is retained as a current finding. |
| Two domain guides overflowed at phone width | Added long-word wrapping and a scrollable mobile table where needed. The subsequent browser run passed at both widths. |

Technical references used for the clarification include the
[asyncpg 0.30.0 connection API](https://github.com/MagicStack/asyncpg/blob/v0.30.0/asyncpg/connection.py),
[SQLAlchemy 2.0.36 dialect](https://github.com/sqlalchemy/sqlalchemy/blob/rel_2_0_36/lib/sqlalchemy/dialects/postgresql/asyncpg.py)
and [Expo's development-build explanation](https://docs.expo.dev/develop/development-builds/introduction/).
Pinned local library code and repository code establish this application's behavior; a current provider page does not verify an account's settings.

### Fresh follow-up checks

| Check | Result |
|---|---|
| Explicit requested scope and supporting files | All 37 documents plus four supporting files checked for local links, anchors and HTML structure: zero problems. |
| Repository documentation checker | 106 files, zero problems. External URLs are counted, not comprehensively fetched. |
| System-design diagram consistency | 22 SVGs and all 35 inline appearances agree; no checker problems. |
| Browser rendering | All 17 HTML files in the requested set, plus the documentation index, at 1440×1000 and 390×844: no page overflow, missing anchors, duplicate IDs, broken images or JavaScript exceptions. All 35 Enlarge/Close controls passed at both widths. |
| SVG text geometry | 34 generated diagrams, 1,758 text elements: no detected canvas overflow or text collisions. Geometry checks do not prove diagram semantics. |
| Generated companions | Rebuilding the complete developer guide and API traceability HTML from their Markdown produced identical bytes. |
| Registered API operations | 47/47 documented; 44 under `/api/v1`; no missing or invented full operation in the traceability matrix. |
| Pinned-library and middleware probes | Reproduced the unsupported `sslmode` keyword and the 401 on an unknown AI path, using an in-process client with database connections forbidden. No database or provider was contacted. |

Only 13 existing documentation/template files changed during this follow-up. Fingerprints confirm no application, native, migration, manifest or workflow change in its recorded boundary. No files were deleted, and nothing was committed, pushed, merged or deployed. The full application results quoted above remain evidence from the separate review; they were not rerun here. Raw follow-up checks and the 37-document ledger are retained in ignored local records.

### Interview use

The 37 documents cover the project's architecture, backend/API behavior, onboarding, local/device testing, voice/AI flow, environments, deployment and development history. They form a sufficient project-specific study set at this baseline. Start with guides 01 and 02, the complete developer guide and API traceability; then use guide 04 for deployment. Treat historical records and future plans according to their labels.

To justify a design in an interview, connect the product need to the actual implementation, trace a concrete request through the code and database, explain a failure/concurrency case, and state the trade-off or known defect. At this earlier documentation baseline, examples included the Edit Item version gap, selected audit coverage, uncertain outcomes after commit, best-effort limits and constrained read-only interpretation. The later [application safety follow-up](#application-safety-follow-up) fixes A-1 locally and lists the continuing limits; do not describe its earlier defect as current or claim arbitrary spoken queries always work.

This is a documentation-readiness conclusion for the current codebase. Live Render/Neon/Play settings, real-device speech, real Groq behavior, backup restore and measured production capacity still require operational verification. Reading the guides should be paired with tracing and running a workflow in a disposable test environment; it cannot establish production correctness by itself.


## Application safety follow-up

**8 October 2026, `03cfebb` plus local, uncommitted code and documentation changes.** This later implementation supersedes current-defect wording about A-1, A-12, A-20, A-25, A-27 and A-29–A-34 in earlier review snapshots. A-3 is only partly addressed: mutation hooks reconcile active queries and show the server's 409 message; Retry retains its original variables and a form must be reopened for current values. Historical audit records are preserved.

The [hardening record](../docs/BACKEND_HARDENING.md#safety-follow-up-8-october-2026) maps each fix to its implementation and regression tests. All 37 study documents now link to that record. Affected prose, API rows, teaching snippets and generated diagrams describe the updated version handling, reset guards, request deadlines, logout sequence, text preservation and explicit microphone tap.

| Fresh application check | Result |
|---|---|
| Backend suite, test-created schema | 250 passed |
| Backend suite, Alembic-migrated schema | 250 passed; 88.05% total coverage; item/order coverage gates passed |
| Synthetic API walkthrough | 89 steps; zero expectation mismatches; email and Groq mocked |
| Mobile tests | 152 passed, including real rendered form/store/assistant and TanStack cache tests |
| TypeScript / lint | TypeScript clean; Ruff clean; mobile lint zero errors and one existing effect-dependency warning |
| API and schema metadata | 47/47 operations documented; migration head remains `0010_order_local_id_unique` |
| JWT dependency | Installed and tested `python-jose` 3.5.0; dependency compatibility check passed |

No new migration, stock calculation, reorder threshold, order transition, native speech engine or provider switch is introduced. Tests preserve ordinary delete behavior while resets opt into new guards. The inventory backup is local JSON, not a full database backup; resets can partially complete. Updated mobile and backend code must both be released before relying on the reset protections. No commit, push, merge, build or deployment was performed here.

For interviews, explain the stale-form defect as an observed design lesson **and its local fix**, then trace fields plus version through the conditional SQL update. Explain uncertain outcomes after commit, selected audit coverage, best-effort limits and constrained read-only interpretation as continuing trade-offs. Other findings remain in the API traceability ledger. Real phones, real providers, live hosting, restore procedures and measured production capacity remain unverified by this follow-up.

Documentation rendering checks after the code fixes: 18 HTML pages (the 17 in the study set plus the index), at desktop and phone widths, pass with no overflow, broken images, missing anchors, duplicate IDs or JavaScript exceptions. All 70 Enlarge/Close checks pass. All 34 generated SVGs (1,767 text elements) pass the geometry checks. The repository documentation checker reports zero problems across 106 files; external links are counted rather than comprehensively fetched. These structural checks supplement the targeted source/prose review and do not prove all conceptual claims by themselves.

The additional server-first interview tutorial was updated for A-1 and request deadlines; its earlier phone-width overflow was contained, and it passes both viewport checks. A scratch copy using the previous item screen reproduces the stale-version test failure (version 5 paired with version-4 fields), while the unloaded-form and ordinary-save controls pass. The current screen also passes empty-cleaned-name and legitimate-punctuation tests.


## Local draft feature follow-up — 8 October 2026

The later feature extends the earlier read-only UI with bounded inventory tables and in-memory unsaved order drafts. Only the separate Create Order touch confirmation calls order save, now with optional version/activity guards. Voice/server interpretation still executes no inventory/order writes. The voice/system diagrams were updated in their generators and re-inlined. [Current code map and verification limits](../docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md). Previous measurements are dated evidence, not deployment claims.
