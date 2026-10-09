#!/usr/bin/env python3
"""Generate the CareKosh teaching diagrams as accessible SVG files.

Run from anywhere (Python 3.10+, standard library only):

    python3 docs/diagrams/src/build_diagrams.py

Each function below is the *source* of one diagram. Every box and label states a
fact that was checked against the code on 7 October 2026 (see
docs/documentation-audit-2026-10-07/SOURCE_OF_TRUTH.md) and re-checked against the
working tree on 8 October 2026. Voice and system context were refreshed against
0946eb7 plus local capture/UI changes on 9 October 2026. Diagrams illustrate those
findings; they are not evidence by themselves. Edit the function, re-run the
script, and re-inspect the PNG preview before committing.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from svgkit import MUTED, Sequence, Svg, wrap  # noqa: E402

OUT = Path(__file__).resolve().parents[1]
LEGEND = [("core", "Core (required)"), ("infra", "Supporting infrastructure"),
          ("provider", "Current provider (swappable)"), ("conditional", "Conditional / opt-in"),
          ("external", "People, devices, outside systems")]


def system_context() -> Svg:
    s = Svg(1400, 1010, "CareKosh system context",
            "The Android app talks to one FastAPI service over HTTPS; the service owns the PostgreSQL "
            "database. Live captions, default recognition and spoken replies run on the phone. Groq text "
            "interpretation and optional Whisper recognition need separate consent; Brevo and Sentry "
            "are optional and only used when configured. "
            "The core API has no queue, Redis cache or offline write queue. Optional speech-worker code "
            "exists; deployment is unverified and the mobile build disables hosted speech output.")
    s.heading("CareKosh — system context (voice source updated 9 Oct 2026)",
              "One mobile app, one API service, one PostgreSQL database. Everything else is supporting or optional.")
    s.legend(40, 118, LEGEND)

    # Phone
    s.rect(40, 165, 560, 560, "external", radius=18)
    s.text(60, 197, "Android phone", 20, 700, color="#4A5260")
    s.box(60, 215, 520, 150, "CareKosh app (React Native 0.81 · Expo SDK 54)",
          ["Screens (expo-router) → hooks → services/api.ts",
           "TanStack Query cache, persisted to AsyncStorage for display",
           "Tokens in SecureStore · no offline write queue"], "core")
    s.box(60, 385, 520, 128, "Assistant: reads + local drafts",
          ["Tap-to-talk dock above the tabs · editable transcript · explicit Send",
           "Local whole-sentence matcher handles supported wording"], "core")
    s.box(60, 533, 250, 172, "Moonshine (on device)",
          ["Kotlin module carekosh-voice", "English pack: one-time HTTPS download, checksummed",
           "live words + offline final transcript"], "provider")
    s.box(330, 533, 250, 172, "Android Text-to-speech",
          ["Installed offline English voice", "optional spoken replies", "no network voice"], "provider")

    # API
    s.rect(720, 165, 640, 410, "infra", radius=18)
    s.text(740, 197, "Render web service (Docker) — provider: Render", 18, 700, color="#1B7563")
    s.box(740, 215, 600, 175, "FastAPI application (Python 3.12)",
          ["Gunicorn → 2 Uvicorn workers per instance",
           "47 HTTP routes: auth, categories, items, orders, activities, ai, health",
           "Validation (Pydantic) · owner-scoped business resources",
           "Container start: alembic upgrade head, then Gunicorn"], "core")
    s.box(740, 410, 290, 145, "Rate limiter (slowapi)",
          ["in memory, per worker", "5 auth routes only", "best effort — see findings"], "infra")
    s.box(1050, 410, 290, 145, "Health",
          ["/live: process only (Render check)", "/health: SELECT 1, 2 s timeout",
           "neither reports the commit"], "infra")

    s.box(720, 625, 640, 100, "PostgreSQL — provider: Neon (documented)",
          "11 application tables + alembic_version · source of truth for all inventory data · CI and local "
          "development use PostgreSQL 16", "provider")
    s.arrow([(1040, 575), (1040, 625)], both=True)
    s.text(1054, 597, "SQLAlchemy async + asyncpg", 14, 500, color=MUTED)
    s.text(1054, 615, "TLS outside development/testing", 14, 500, color=MUTED)
    s.arrow([(600, 300), (720, 300)], "HTTPS JSON\nBearer JWT", both=True, label_dy=-26)

    # Optional services
    s.box(40, 790, 300, 150, "Groq (optional)",
          ["GPT-OSS text; optional Whisper audio", "separate text/audio consent", "server-side key; off by default"], "conditional")
    s.box(370, 790, 300, 150, "Brevo email API",
          ["verification, reset, deletion links", "only if MAIL_PASSWORD is set"], "conditional")
    s.box(700, 790, 300, 150, "Sentry",
          ["errors and 10% of traces, only if SENTRY_DSN set", "request bodies and locals scrubbed"], "conditional")
    s.box(1030, 790, 330, 150, "Not in this system",
          ["no message queue · no Redis", "no core background job queue", "no offline write queue",
           "optional speech workers: deployment unverified"], "plain")
    s.arrow([(720, 545), (690, 545), (690, 760), (190, 760), (190, 790)], "", dashed=True)
    s.arrow([(520, 760), (520, 790)], "", dashed=True)
    s.arrow([(690, 760), (850, 760), (850, 790)], "", dashed=True)
    s.text_halo(355, 752, "outbound HTTPS from the API only", 14, "middle", 500, MUTED)
    return s


def request_lifecycle() -> Svg:
    s = Svg(1500, 1290, "Lifecycle of a successful stock update",
            "Sequence for PATCH /api/v1/items/{id}/stock: an API client sends the new quantity and the version it "
            "last saw; the middleware buffers the body, FastAPI parses the JSON, the dependencies authenticate, "
            "then the schema fields are validated. The handler commits the stock, activity and audit changes, and "
            "db.refresh reads the row in a new transaction. The response is serialized before pinned FastAPI "
            "0.115.6 runs get_db's exit (commit of that read, close) and sends it. This endpoint is API-only; "
            "the UI uses PUT.")
    s.heading("A successful request: PATCH /api/v1/items/{id}/stock",
              "API-only stock endpoint; the UI uses PUT. One session can span transactions; a later failure cannot undo an earlier commit.")
    seq = Sequence(s, [("app", "API test client (stock PATCH)", "core"),
                       ("mw", "Middleware (outer → inner)", "infra"),
                       ("fa", "FastAPI: validation + Depends", "core"),
                       ("h", "Handler items.update_stock", "core"),
                       ("db", "PostgreSQL", "provider")], top=120, box_h=70)
    seq.msg("app", "mw", 'PATCH …/stock  {"quantity":38,"version":3}\nAuthorization: Bearer <access>', step=1)
    seq.note("mw", "mw", "AIBodyLimit buffers the body (≤2 MB) → security headers → X-Request-ID → CORS", "infra")
    seq.msg("mw", "fa", "route match /api/v1/items/{item_id}/stock", step=2)
    seq.note("fa", "fa", "Parse JSON first; malformed JSON → 422 before dependencies", "note")
    seq.msg("fa", "fa", "get_db: create AsyncSession; connection acquired on first SQL", step=3)
    seq.msg("fa", "db", "get_current_user: SELECT user (noload)", step=4)
    seq.msg("db", "fa", "user row → session_version matches token", dashed=True, step=5)
    seq.note("fa", "fa", "StockUpdate field validation: quantity 0–999999; version required → else 422", "note")
    seq.msg("fa", "h", "call update_stock(item_id, data, db, user)", step=6)
    seq.msg("h", "db", "SELECT item WHERE id AND user_id (ownership)", step=7)
    seq.msg("h", "db", "UPDATE items SET quantity=38, version=version+1\nWHERE id AND user_id AND version=3 RETURNING", step=8)
    seq.msg("db", "h", "1 row (another writer would make it 0 rows → 409)", dashed=True, step=9)
    seq.msg("h", "db", "INSERT activity_logs (stock_update) · INSERT audit_log", step=10)
    seq.msg("h", "db", "COMMIT — the UPDATE and both INSERTs land together", step=11)
    seq.msg("h", "db", "db.refresh: SELECT the saved row (a new transaction)", step=12)
    seq.msg("h", "fa", "ItemResponse (camelCase aliases)", dashed=True, step=13)
    seq.msg("fa", "mw", "serialize → get_db exit: COMMIT that read, close → 200 JSON (FastAPI 0.115.6)", dashed=True, step=14)
    seq.msg("mw", "app", "200 + X-Request-ID + no-store", dashed=True, step=15)
    seq.note("app", "app", "Test verifies quantity/version. UI PUT success invalidates queries → refetch.", "core")
    seq.finish()
    return s


def request_rollback() -> Svg:
    s = Svg(1500, 1120, "Error and rollback paths",
            "Three failure paths: invalid schema fields stop the request before the handler, after the "
            "dependencies may already have queried the user; an ownership miss returns 404; and an order apply "
            "that discovers a missing item raises 409 before it writes anything, and get_db rolls the transaction "
            "back. A failure after the order is claimed is rolled back the same way, so no partial stock change "
            "is kept.")
    s.heading("When a request fails: what is kept and what is undone",
              "Rollback undoes uncommitted work only. A response failure after commit cannot undo a mutation.")
    seq = Sequence(s, [("app", "Client (app or API test)", "core"), ("fa", "FastAPI (validation + Depends)", "core"),
                       ("h", "Handler orders.apply_order_to_stock", "core"), ("db", "PostgreSQL", "provider")],
                   top=120, box_h=70)
    seq.divider("A · invalid schema fields — auth may SELECT first; handler never runs")
    seq.msg("app", "fa", 'POST /api/v1/items  {"name": ""}', step=1)
    seq.msg("fa", "app", '422 {"error":"Validation Error","details":[{"field":"body.name",…}]}', dashed=True, step=2)
    seq.divider("B · someone else's id — ownership is a WHERE clause")
    seq.msg("app", "fa", "GET /api/v1/items/<another user's id>", step=3)
    seq.msg("fa", "db", "handler: SELECT … WHERE id = :id AND user_id = :me", step=4)
    seq.msg("fa", "app", '404 {"detail":"Item not found"} (not 403: existence is not revealed)', dashed=True, step=5)
    seq.divider("C · apply an order whose item was deleted — 409 before any write; get_db rolls back")
    seq.msg("app", "h", "POST /api/v1/orders/{id}/apply", step=6)
    seq.msg("h", "db", "SELECT order (status must be received)", step=7)
    seq.msg("h", "db", "check every line's item still exists", step=8)
    seq.msg("db", "h", "one item missing", dashed=True, step=9)
    seq.msg("h", "fa", "raise HTTPException(409, missing: Suction catheter 12FR)", step=10, color="#A8261D")
    seq.msg("fa", "db", "get_db sees the exception → ROLLBACK", step=11, color="#A8261D")
    seq.msg("fa", "app", "409 — order still 'received', every quantity unchanged", dashed=True, step=12)
    seq.note("h", "db", "If a later step fails after the order was claimed (status UPDATE) the same rollback "
             "undoes the claim too: no partial stock application is kept.", "danger")
    seq.note("app", "fa", "Unexpected exceptions return a generic 500 without SQL details. Reproduced 7 Oct and "
             "re-run 8 Oct: those 500 responses lack X-Request-ID and the security headers.", "note")
    seq.finish()
    return s


def table(s: Svg, x: float, y: float, w: float, name: str, cols: list[str], role: str = "core",
          note: str = "") -> tuple[float, float, float, float]:
    """Draw a table card; returns (x, y, w, h)."""
    size = 14
    body: list[str] = []
    for col in cols:
        body.extend(wrap(col, w - 28, size, mono=True))
    h = 14 + 22 + 8 + len(body) * size * 1.36 + (24 if note else 0) + 12
    s.rect(x, y, w, h, role, radius=10)
    s.parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="36" rx="10" fill="{ {"core": "#D3E3F7", "infra": "#CDEBE3", "provider": "#FCE6B8", "conditional": "#E3DAF5", "external": "#E3E5E9"}.get(role, "#EEE") }"/>')
    s.text(x + 14, y + 25, name, 17, 700)
    s.lines(x + 14, y + 36 + 8 + size, body, size, mono=True)
    if note:
        s.text(x + 14, y + h - 14, note, 13, 500, color=MUTED, italic=True)
    return x, y, w, h


def database_erd() -> Svg:
    s = Svg(1560, 1330, "CareKosh database at migration 0010",
            "Eleven application tables. users owns every other table except order_number_counters, directly or "
            "(for order_items) through orders, by foreign keys with ON DELETE CASCADE. order_items.item_id and "
            "activity_logs.item_id are plain "
            "references without foreign keys, so order history survives item deletion. Item and category "
            "names are not unique in the database; the API serializes duplicate checks with advisory locks.")
    s.heading("Database at head 0010_order_local_id_unique — 11 application tables",
              "Solid arrows are foreign keys (all ON DELETE CASCADE). Dashed arrows are plain id references without a foreign key. Verified with pg_dump of a freshly migrated database (7 Oct 2026; identical on 8 Oct).")
    u = table(s, 590, 150, 380, "users", [
        "id  PK varchar(36) (Python uuid4)", "email  UNIQUE, nullable", "username  UNIQUE, nullable",
        "CHECK email OR username present", "hashed_password  (Argon2 via passlib)", "session_version  int, default 0 (0007)",
        "name, phone, last_login", "is_active, is_email_verified", "email_verification_token  sha256 + expiry",
        "password_reset_token  sha256, 1 h", "deletion_token  sha256, 24 h"])
    c = table(s, 40, 150, 430, "categories", [
        "id PK · user_id FK→users", "name  (no DB uniqueness;", "  API: advisory lock + case-insensitive check)",
        "description, display_order", "is_default (cannot be deleted)", "local_id"])
    i = table(s, 40, 470, 430, "items", [
        "id PK · user_id FK→users", "category_id FK→categories", "name  indexed, not unique in DB",
        "quantity  CHECK quantity >= 0", "minimum_stock, unit", "version  optimistic lock (0004)",
        "is_active, is_critical", "supplier_name, supplier_contact,", "  purchase_link, brand, notes, ...", "local_id"])
    o = table(s, 1090, 150, 430, "orders", [
        "id PK · user_id FK→users", "order_id  UNIQUE  ORD-YYYYMMDD-NNNN", "status  VARCHAR (stores enum NAME,", "  e.g. STOCK_UPDATED)",
        "total_items, total_units", "exported_at, ordered_at, received_at,", "  applied_at, declined_at",
        "notes · local_id", "Partial UNIQUE (user_id, local_id)", "  non-null; legacy duplicate ids exempt"])
    oi = table(s, 1090, 560, 430, "order_items", [
        "id PK · order_id FK→orders", "item_id  NO foreign key (snapshot)", "name, brand, unit  (as sent by app)",
        "quantity  CHECK quantity > 0", "current_stock, minimum_stock", "supplier_name, purchase_link, image_uri"])
    rt = table(s, 590, 640, 380, "refresh_tokens", [
        "id PK · user_id FK→users", "jti  UNIQUE (JWT id)", "is_revoked, expires_at", "device_name, ip_address"])
    al = table(s, 40, 920, 360, "activity_logs", [
        "id PK · user_id FK→users", "action  VARCHAR (enum NAME)", "item_name, details", "item_id, order_id  (no FK)",
        "shown by GET /activities"])
    au = table(s, 430, 920, 330, "audit_log", [
        "id PK · user_id FK→users", "entity_type, entity_id, action", "old_values, new_values  JSONB",
        "no API reads it"])
    ac = table(s, 790, 920, 330, "ai_consents", [
        "user_id  PK + FK→users", "version, accepted", "scopes  JSON (0009)", "updated_at"], role="conditional")
    ag = table(s, 1150, 920, 370, "ai_usage", [
        "id PK · user_id FK→users", "kind, provider, status", "reserved_microusd", "input/output tokens,", "  audio_seconds, expires_at"],
        role="conditional")
    cnt = table(s, 1090, 760, 430, "order_number_counters", [
        "day  PK  YYYYMMDD (UTC)", "last_value  bigint"], role="infra", note="no FK: numbers survive deletions (0007)")
    ux, uy, uw, uh = u
    # users -> children (arrows point from child FK to parent)
    s.arrow([(c[0] + c[2], c[1] + 60), (ux, uy + 60)], "user_id", label_dy=-8)
    s.arrow([(i[0] + i[2], i[1] + 60), (530, i[1] + 60), (530, uy + 200), (ux, uy + 200)], "user_id", label_at=0.5)
    s.arrow([(o[0], o[1] + 60), (ux + uw, uy + 60)], "user_id")
    s.arrow([(rt[0] + rt[2] / 2, rt[1]), (ux + uw / 2, uy + uh)], "user_id", label_anchor="start", label_dy=4)
    s.arrow([(i[0] + 120, i[1]), (c[0] + 120, c[1] + c[3])], "category_id", label_anchor="start", label_dy=4)
    s.arrow([(oi[0] + 200, oi[1]), (o[0] + 200, o[1] + o[3])], "order_id", label_anchor="start", label_dy=4)
    s.arrow([(oi[0], oi[1] + 145), (1005, oi[1] + 145), (1005, 815), (500, 815), (500, i[1] + 230), (i[0] + i[2], i[1] + 230)],
            "", dashed=True)
    s.text_halo(760, 807, "order_items.item_id → items.id (no FK: snapshot survives deletion)", 14, "middle", 600)
    for t in (al, au, ac, ag):
        s.arrow([(t[0] + t[2] / 2, t[1]), (t[0] + t[2] / 2, 890), (1040, 890), (1040, uy + uh - 30), (ux + uw, uy + uh - 30)], "")
    s.text_halo(1030, 880, "user_id (each table)", 14, "end", 600)
    s.box(40, 1180, 1480, 120, "Deleting a user (POST /auth/confirm-delete/{token})",
          ["PostgreSQL ON DELETE CASCADE removes the user's categories, items, orders, order_items, refresh_tokens, "
           "activity_logs, audit_log, ai_consents and ai_usage in the same transaction. order_number_counters is untouched, so a "
           "deleted account's order numbers are never reused."], "danger")
    return s


def inventory_concurrency() -> Svg:
    s = Svg(1500, 1100, "Two clients save the same item",
            "Client A and client B both loaded the item at version 3. Each sends a stock update naming version 3 "
            "(the API-only PATCH used by the reproduction). PostgreSQL lets the first UPDATE take the row lock and "
            "commit version 4; the second UPDATE re-checks its WHERE clause after waiting, matches no row, and the "
            "API returns 409 with the values it had read. The app's Edit Item sends PUT with the item name, which "
            "first takes a per-account advisory lock, so a second PUT waits before its SELECT; the outcome is the "
            "same. The app now captures the version with its form values; a cache refresh cannot replace it "
            "(A-1 fixed locally on 8 October 2026).")
    s.heading("Optimistic concurrency: the version column",
              "PUT /items/{id} and PATCH /items/{id}/stock both run UPDATE … WHERE version = :seen. Reproduced 7 and 8 Oct with two stock PATCH calls: one 200, one 409.")
    seq = Sequence(s, [("a", "Client A (API test)", "external"), ("b", "Client B (API test)", "external"),
                       ("api", "API worker(s)", "core"), ("db", "PostgreSQL items row", "provider")], top=120, box_h=64)
    seq.note("a", "b", "Both clients read Nitrile gloves: quantity 40, version 3", "note")
    seq.msg("a", "api", 'PATCH /items/{id}/stock {"quantity":38,"version":3}', step=1)
    seq.msg("b", "api", 'PATCH /items/{id}/stock {"quantity":36,"version":3}', step=2)
    seq.msg("api", "db", "A: UPDATE … SET quantity=38, version=version+1 WHERE … AND version=3", step=3)
    seq.msg("api", "db", "B: same UPDATE with version=3 → waits for A's row lock", step=4)
    seq.msg("api", "db", "A: INSERT activity + audit · COMMIT (row now version 4)", step=5)
    seq.msg("db", "api", "B: lock released → WHERE re-checked → version is 4 → 0 rows", dashed=True, step=6)
    seq.msg("api", "a", "200 · quantity 38 · version 4", dashed=True, step=7)
    seq.msg("api", "b", '409 {"error":"Version conflict","server_version":…,"server_quantity":…}', dashed=True, step=8, color="#A8261D")
    seq.note("b", "api", "The 409 body carries the values read at the start of B's request, which may already be "
             "out of date. The app shows the server message and invalidates affected active queries. "
             "Reopen the form for current values; Retry retains its original version.", "danger")
    seq.note("a", "db", "Why this is safe: under PostgreSQL's default READ COMMITTED isolation, a blocked UPDATE re-evaluates "
             "its WHERE clause against the newest row version. No SELECT … FOR UPDATE is needed for this compare-and-swap. "
             "The lock wait shown is one possible interleaving; the reproduction checks the outcome. "
             "Ordinary item deletes have no version check. Resets opt into a version check under a row lock.", "core")
    seq.note("a", "db", "In the app: Edit Item sends PUT /items/{id} with the item name, which first takes a per-account "
             "advisory lock. A second PUT waits there until the first commits, then its SELECT sees version 4 and its "
             "UPDATE matches no row: the same 200 / 409 result, without the row-lock wait.", "note")
    seq.finish()
    return s


def order_idempotency() -> Svg:
    s = Svg(1500, 1200, "Order creation and retries",
            "The current app generates one localId per Save. A retry with the same localId returns the order "
            "already created with status 200. Two simultaneous requests with the same localId collide on a "
            "partial unique index; the loser rolls back, which also releases its order number, and returns "
            "the winner's order. Requests without a localId, such as those from older app builds, always create a new order.")
    s.heading("Order creation: submission keys (localId) and order numbers",
              "0010 protects indexed non-null keys; later legacy duplicates are exempt by id. A changed-payload replay returns the original order.")
    seq = Sequence(s, [("app", "Phone: Create Order screen", "core"), ("api", "POST /api/v1/orders", "core"),
                       ("db", "PostgreSQL", "provider")], top=120, box_h=64)
    seq.divider("1 · first attempt")
    seq.msg("app", "api", "Save → localId L (generated once for this press) + lines", step=1)
    seq.msg("api", "db", "SELECT order WHERE user_id AND local_id = L → none", step=2)
    seq.msg("api", "db", "validate every itemId belongs to this user (else 400)", step=3)
    seq.msg("api", "db", "INSERT INTO order_number_counters … ON CONFLICT (day) DO UPDATE\nSET last_value = last_value + 1 RETURNING → 7", step=4)
    seq.msg("api", "db", "INSERT orders (ORD-20261007-0007) + order_items + activity · COMMIT", step=5)
    seq.msg("api", "app", "201 Created", dashed=True, step=6)
    seq.divider("2 · the response was lost; the person taps Retry, which resends the same L")
    seq.msg("app", "api", "POST again with localId L", step=7)
    seq.msg("api", "db", "SELECT … local_id = L → found", step=8)
    seq.msg("api", "app", "200 OK — the same order, nothing new written", dashed=True, step=9)
    seq.divider("3 · two identical requests arrive at the same moment")
    seq.msg("api", "db", "both: lookup → none; both: counter upsert (second waits for the row lock)", step=10)
    seq.msg("api", "db", "second INSERT hits uq_orders_user_id_local_id → IntegrityError", step=11, color="#A8261D")
    seq.msg("api", "db", "ROLLBACK (its counter increment is undone too) → SELECT the winner", step=12)
    seq.msg("api", "app", "201 for one request, 200 with the same order for the other", dashed=True, step=13)
    seq.note("app", "db", "No localId (older installed builds): each POST creates a new order. A new localId per press "
             "means two deliberate presses are two orders. Order numbers are per UTC day, never reused after deletion, "
             "and the counter row briefly serializes concurrent order creation across all users.", "note")
    seq.finish()
    return s


def order_status() -> Svg:
    s = Svg(1500, 900, "Order status flow",
            "Orders start pending. Pending can become ordered, received or declined. Ordered can become "
            "partially received or received. Partially received can become received. Received becomes "
            "stock updated only through POST apply, which adds every line's full quantity to stock in one "
            "transaction. Declined and stock updated are final. Only pending and declined orders can be deleted.")
    s.heading("Order status machine and applying stock",
              "PATCH /orders/{id}/status enforces these arrows (400 otherwise; same status = no-op). Only POST /orders/{id}/apply reaches stock_updated.")
    states = {
        "pending": (60, 230, "ok"), "ordered": (420, 150, "core"), "partially_received": (780, 150, "core"),
        "received": (780, 400, "core"), "declined": (60, 520, "danger"), "stock_updated": (1150, 400, "infra"),
    }
    w, h = 280, 92
    sub = {"pending": "created by POST /orders · deletable", "ordered": "sets ordered_at",
           "partially_received": "label only — no quantities", "received": "sets received_at · not deletable",
           "declined": "final · sets declined_at · deletable", "stock_updated": "final · sets applied_at"}
    for name, (x, y, role) in states.items():
        s.box(x, y, w, h, name, sub[name], role, align="middle")
    s.arrow([(340, 255), (420, 205)], "")
    s.arrow([(340, 290), (560, 290), (560, 420), (780, 420)], "pending → received", label_dy=-8)
    s.arrow([(200, 322), (200, 520)], "")
    s.arrow([(700, 196), (780, 196)], "")
    s.arrow([(640, 242), (640, 380), (780, 380), (780, 400)], "")
    s.arrow([(920, 242), (920, 400)], "")
    s.arrow([(1060, 446), (1150, 446)])
    s.text_halo(1105, 432, "POST /apply", 14, "middle", 700)
    s.text_halo(205, 470, "declined", 14, "start", 600)
    s.text_halo(648, 330, "ordered → received", 14, "start", 600)
    s.box(60, 660, 1380, 200, "What POST /orders/{id}/apply does — one transaction",
          ["1. Load the order (yours, status received, at least one line) → else 404 / 400.",
           "2. Check every line's item still exists → else 409 and nothing changes.",
           "3. Claim: UPDATE orders SET status='STOCK_UPDATED', applied_at=now WHERE status='RECEIVED' (the column stores enum names) → a second apply gets 400.",
           "4. For each line, in item-id order: UPDATE items SET quantity = quantity + line.quantity, version = version + 1; write an audit row.",
           "5. Write ORDER_APPLIED activity, COMMIT. Any failure before COMMIT rolls back steps 3–5."], "core")
    return s


def voice_flow() -> Svg:
    s = Svg(1560, 1880, "Inventory answers and local order drafts",
            "Voice recognizes reviewed text and prepares validated inventory answers or an unsaved local draft. "
            "Optional Groq returns specifications only. A separate touch confirmation saves an order; voice cannot change stock or orders.")
    s.heading("Voice answers and unsaved drafts — touch to save",
              "Local live words; offline or consented online final transcript; optional Groq interpretation. No voice mutation tool exists.")
    steps = [
        ("1. Tap → capture + local live words → tap again", "New APK: one Android AudioRecord, mono PCM16/16 kHz temporary WAV, provisional Moonshine English captions with the downloaded pack. Maximum 28 seconds; foreground only. Older modules: Expo AAC/M4A, 44.1 kHz/128 kb/s, words after Stop.", "core"),
        ("2. Final transcript → review/edit → Send", "Default: Moonshine locally. Optional Groq Whisper (whisper-large-v3) through POST /ai/transcribe after Stop requires groq_audio consent, fresh audioOptIn and server capability. Temporary audio deleted; no automatic interpretation or provider substitution.", "conditional"),
        ("3. Local parsing or consented Groq specification", "Familiar wording stays local. Otherwise reviewed text → POST /ai/interpret → openai/gpt-oss-20b, groq_text consent, strict v2 schema. Names, quantities and units validated; no inventory list or executable tools sent. Correct schema does not prove correct meaning.", "conditional"),
        ("4. Verified inventory snapshot and resolution", "Same-session owned complete inventory, no pending writes. Refresh as needed. Ambiguity, missing quantities or unit mismatches require clarification. Offline = last-known.", "core"),
        ("5. In-app table or UNSAVED session draft", "Native virtualized rows, freshness/filters, concise Android offline TTS. Hosted speech is disabled. Explicit amounts win over deterministic minimum-stock suggestions. Manual draft: review merge/replace/cancel.", "ok"),
        ("VOICE BOUNDARY — no order or stock save", "Voice can prepare/edit a draft; saying confirm cannot commit. Inventory-report PDF requires reviewed touch export. Consent/usage writes may occur in cloud mode.", "danger"),
        ("6. Separate TOUCH: Confirm order & export PDF", "Create Order checks matching backend capability, refreshes inventory, retains reviewed quantities, and asks for another review if stock changed. Saving requires internet.", "core"),
        ("7. Authenticated POST /orders", "Stable localId, ownership check, expectedVersion under item locks. Changed/inactive items return 409. A successful create writes order/lines/activity; inventory does not increase.", "core"),
        ("8. PDF from saved response", "Shared order template. Unknown save outcome: same-request retry. Saved order + failed PDF: re-export same order. Stock updates remain a separate /orders/{id}/apply workflow.", "ok"),
    ]
    y = 190
    for i, (title, body, role) in enumerate(steps):
        h = 14 + len(wrap(title, 1372, 17)) * 17 * 1.32 + len(wrap(body, 1372, 15)) * 15 * 1.32 + 24
        s.box(60, y, 1440, h, title, body, role)
        if i not in (5, len(steps)-1): s.arrow([(780,y+h),(780,y+h+28)])
        y += h + (58 if i == 5 else 30)
    s.height = y + 30
    return s


def release_pipeline() -> Svg:
    s = Svg(1560, 1240, "From a code change to users",
            "A feature branch becomes a pull request; CI runs blocking and advisory jobs; a staging candidate is "
            "deployed separately and tested with a preview APK; merging to main can trigger enabled Render "
            "auto-deploy or a configured CI hook. The container migrates before starting. The Android app is released "
            "separately: an EAS production build is uploaded to Play internal testing and then promoted. "
            "Installed apps only change when users install the new build.")
    s.heading("Delivery: CI → staging → production backend → Play Store",
              "Backend and mobile releases are separate pipelines. Green CI ≠ deployed; deployed ≠ healthy; healthy ≠ the commit you expect.")
    row1 = [
        (40, 330, "1. Feature branch + PR to main",
         ["Feature pushes do not trigger this CI; a linked Render service may still auto-deploy.",
          "7 Oct ruleset evidence: PR required, 0 approvals, no required status checks."], "external"),
        (410, 520, "2. GitHub Actions CI",
         ["Blocking in the run: Ruff, pytest (242, migrated schema), route gate 44, coverage floors, tsc, npm test (121), ESLint, autolinking check.",
          "Advisory (cannot fail the run): mypy (23 errors on 7 Oct), Trivy (PRs only), expo-doctor (|| echo).",
          "Optional: build-apk label → EAS preview build (APK)."], "infra"),
        (970, 550, "3. Staging candidate (manual)",
         ["Render staging service is set up in the dashboard (not in render.yaml; not verified).",
          "Deploy the candidate commit deliberately, against its own database (never production data).",
          "Preview APK (eas.json preview) calls https://staging-api.carekosh.com."], "provider"),
    ]
    h1 = max(Svg.measure(w, t, b) for _, w, t, b, _ in row1)
    for x, w, t, b, role in row1:
        s.box(x, 140, w, h1, t, b, role)
    s.arrow([(370, 140 + h1 / 2), (410, 140 + h1 / 2)])
    s.arrow([(930, 140 + h1 / 2), (970, 140 + h1 / 2)])
    y2 = 140 + h1 + 70
    row2 = [
        (40, 600, "4. Main may trigger a backend deployment",
         ["render.yaml: branch main, plan starter, health check /live.",
          "Render auto-deploy (dashboard setting, NOT VERIFIED) and/or CI deploy-backend calling RENDER_DEPLOY_HOOK after the test jobs, only if that secret is set.",
          "A 2xx from the hook means 'request accepted', not 'deployed'.",
          "Migrations 0007–0010: follow the release gate, not a plain merge."], "provider"),
        (680, 840, "5. Every container start",
         ["Entrypoint: wait for PostgreSQL (≤30 × 2 s) → alembic upgrade head (exit on failure) → Gunicorn with 2 Uvicorn workers → Render polls /live.",
          "Migrations run on every start, serialized by an advisory lock; rolling back code does NOT undo them (0007 refuses downgrade).",
          "/health = database reachable. Neither probe names the running commit: check Render's deploy record and alembic current."], "core"),
    ]
    h2 = max(Svg.measure(w, t, b) for _, w, t, b, _ in row2)
    for x, w, t, b, role in row2:
        s.box(x, y2, w, h2, t, b, role)
    s.arrow([(1245, 140 + h1), (1245, y2 - 30), (340, y2 - 30), (340, y2)])
    s.text_halo(800, y2 - 38, "after staging sign-off and the release gate", 14, "middle", 600)
    s.arrow([(640, y2 + h2 / 2), (680, y2 + h2 / 2)])
    y3 = y2 + h2 + 60
    row3 = [
        (40, 700, "6. Mobile release (separate pipeline)",
         ["eas build --profile production → AAB that calls https://api.carekosh.com; versionCode auto-incremented remotely.",
          "eas submit → Play internal testing track (internal testers use PRODUCTION data).",
          "Promote to closed/open testing or production in Play Console; Google review applies.",
          "The CI build-production job is disabled (if: false)."], "provider"),
        (780, 740, "7. Phones",
         ["Over-the-air updates are disabled (updates.enabled: false): JavaScript and native changes reach users only when they install a new build.",
          "Pushing main never changes an installed app. A backend change reaches existing installs immediately, so it must stay compatible with older builds (e.g. orders without localId).",
          "Voice needs the new native build (Kotlin module, minSdk 26)."], "external"),
    ]
    h3 = max(Svg.measure(w, t, b) for _, w, t, b, _ in row3)
    for x, w, t, b, role in row3:
        s.box(x, y3, w, h3, t, b, role)
    s.arrow([(740, y3 + h3 / 2), (780, y3 + h3 / 2)])
    s.height = int(y3 + h3 + 40)
    return s

def release_gate() -> Svg:
    s = Svg(1560, 1200, "Release gate for migrations 0007 to 0010",
            "Deploying the candidate would run migrations 0007, 0008, 0009 and 0010 in one container "
            "start. 0007 cannot be downgraded and the old code's COUNT-based order numbers can collide with the "
            "new counter while old and new instances overlap. The gate: control both deploy triggers and record "
            "state, stage on isolated fresh and populated synthetic legacy databases without discarding existing "
            "staging data, back up and rehearse a restore, cut over with new writes blocked and old writers "
            "stopped, re-seed the counter only if writes could not be paused, check logs, monitor, then re-enable "
            "auto-deploy.")
    s.heading("Release gate: migrations 0007 → 0010 reach production together",
              "Production is presumed to run main (835fad3, migrations ≤ 0006) — NOT VERIFIED. A plain merge is not a safe release for this change.")
    risks = ["0007 refuses downgrade. An image built before the applied migrations cannot start (Alembic cannot locate the revision), so it is no rollback.",
             "Zero-downtime overlap: main's COUNT-based order numbers can collide with the new counter → order creation can fail on either version.",
             "0010 takes LOCK TABLE orders IN SHARE MODE while it builds a unique index (orders writes wait).",
             "Unverified email accounts get 403 on login, refresh and protected bearer routes when verification and mail are configured. Public routes are outside that policy."]
    h = Svg.measure(1480, "Why a plain merge is unsafe", risks)
    s.box(40, 120, 1480, h, "Why a plain merge is unsafe", risks, "danger")
    y = 120 + h + 40
    steps = [
        ("PREPARE", "1. Before merging", ["Control BOTH Render auto-deploy and the CI deploy hook.", "Record deployed commits and alembic current against confirmed targets."], "external"),
        ("PREPARE", "2. Stage the candidate", ["Preserve existing staging. Use isolated fresh and populated synthetic legacy databases.", "Verify old-to-new upgrades and E2E flows with a preview APK."], "provider"),
        ("PREPARE", "3. Back up", ["Take a production backup / restore point.", "Rehearse the restore on a separate throwaway database (restore_drill.py)."], "infra"),
        ("RELEASE", "4. Cut over in a maintenance window", ["Block new writes AND drain old writers before migrating.", "Deploy; the container runs 0007 → 0010.", "Before reopening: Render commit, alembic current = 0010_order_local_id_unique, /live, /health."], "core"),
        ("RELEASE", "5. Only if writes could not be paused", ["Run the idempotent order-counter re-seed SQL from BACKEND_HARDENING.md (safe to repeat)."], "conditional"),
        ("AFTER", "6. Check logs and privacy", ["Real access/error logs and telemetry with synthetic tokens."], "infra"),
        ("AFTER", "7. Monitor", ["Order-create failures (409), 401/403 spikes, refresh failures, DB connections and lock waits."], "infra"),
        ("AFTER", "8. Re-enable auto-deploy", ["Only after the checks above pass."], "external"),
    ]
    w = 350
    col_h = max(Svg.measure(w, t, b) for _, t, b, _ in steps)
    for idx, (phase, title, body, role) in enumerate(steps):
        col, row = idx % 4, idx // 4
        x = 40 + col * (w + 26.6)
        yy = y + row * (col_h + 80)
        s.pill(x, yy - 14, phase, role if role != "external" else "plain")
        s.box(x, yy + 14, w, col_h, title, body, role)
        if col < 3 and idx + 1 < len(steps):
            s.arrow([(x + w, yy + 14 + col_h / 2), (x + w + 26.6, yy + 14 + col_h / 2)])
    yy = y + 2 * (col_h + 80) + 10
    rb = ["Keep the additive schema. 0008–0010 have downgrades, but 0007's downgrade raises, so the chain cannot go below 0007 automatically.",
          "A pre-0007 image cannot start on a migrated database (its alembic upgrade fails); roll forward with a fix built on the new schema.",
          "Restoring a backup discards every write made after the backup. Prefer a reviewed forward fix; keep writes paused while diagnosing."]
    hb = Svg.measure(1480, "Rollback is a data decision", rb)
    s.box(40, yy, 1480, hb, "Rollback is a data decision", rb, "danger")
    s.height = int(yy + hb + 40)
    return s


def auth_session() -> Svg:
    s = Svg(1560, 1500, "Login, token refresh and logout",
            "Login returns a 30-minute access token and a 30-day refresh token, stored in the phone's secure "
            "store. When a request gets 401, the app makes one shared refresh call; the server claims the old "
            "refresh token with a conditional update and issues a new pair. Logout clears local credentials "
            "without waiting for best-effort server revocation. The access token keeps working until it expires. A password change or reset increases the "
            "user's session_version, which invalidates every older token at once.")
    s.heading("Sessions: login, refresh rotation, logout and password change",
              "Access token: JWT, 30 min, checked on protected bearer routes (signature, type, session_version). Refresh token: JWT + a row in refresh_tokens, 30 days, single use.")
    seq = Sequence(s, [("ui", "Screens + auth store", "core"), ("api", "services/api.ts", "core"),
                       ("ss", "SecureStore (phone)", "external"), ("srv", "FastAPI auth routes", "core"),
                       ("db", "PostgreSQL", "provider")], top=120, box_h=64)
    seq.divider("Login")
    seq.msg("ui", "srv", "POST /auth/login {identifier, password}", step=1)
    seq.msg("srv", "db", "SELECT user … FOR UPDATE\nArgon2 check in a worker thread", step=2)
    seq.msg("srv", "db", "INSERT refresh_tokens(R1) · last_login\nUSER_LOGIN activity · COMMIT", step=3)
    seq.msg("srv", "ui", "200 {access A1, refresh R1, user}", dashed=True, step=4)
    seq.msg("ui", "ss", "save A1, R1 · clear old query cache · open the tabs", step=5)
    seq.divider("A request after the access token expired")
    seq.msg("api", "srv", "GET /items  Bearer A1", step=6)
    seq.msg("srv", "api", "401 Invalid or expired token", dashed=True, step=7)
    seq.msg("api", "srv", "ONE shared POST /auth/refresh {R1} (30 s limit) for every waiting request", step=8)
    seq.msg("srv", "db", "lock user · check session_version\nclaim R1: UPDATE … SET is_revoked\nWHERE jti=R1 AND NOT revoked", step=9)
    seq.msg("srv", "db", "INSERT R2 · COMMIT", step=10)
    seq.msg("srv", "api", "200 {A2, R2}", dashed=True, step=11)
    seq.msg("api", "ss", "save A2, R2 only if the credential generation still matches · retry GET once", step=12)
    seq.note("api", "srv", "Refresh answered 401/403 → tokens cleared and the store logs out. Timeout or 5xx → tokens kept, the request fails, a later call can retry. Replaying R1 → 401, but R2 stays valid (no theft detection).", "note")
    seq.divider("Logout")
    seq.msg("ui", "ss", "capture A2, R2 · clear local tokens; clear query cache (memory and disk)", step=13)
    seq.msg("ui", "srv", "best effort: POST /auth/logout {R2} Bearer A2 (30 s overall; detached)", step=14)
    seq.msg("srv", "db", "if accepted: revoke R2 · USER_LOGOUT · COMMIT", step=15)
    seq.note("ui", "srv", "The login screen appears immediately. New login waits only for local cleanup, not the server. "
             "Expired A2: rotate the captured pair in memory, then revoke it; never write it over a new login. "
             "Offline revocation can fail; logout is still complete on the phone.", "note")
    seq.note("srv", "db", "A2 still works until it expires (≤ 30 min): logout does not change session_version. Reproduced 7 Oct and re-run 8 Oct 2026.", "danger")
    seq.divider("Password change or reset")
    seq.msg("srv", "db", "session_version + 1 · revoke all\nrefresh rows · clear reset/deletion tokens", step=16)
    seq.note("api", "db", "Every token issued before carries the old session_version → 401 on its next use; the app's refresh then fails and it logs out.", "core")
    seq.finish()
    return s


def mobile_cache() -> Svg:
    s = Svg(1560, 1080, "Mobile cache versus the server",
            "PostgreSQL behind the API is the only source of truth. The app keeps a TanStack Query cache in "
            "memory and persists a copy to AsyncStorage for display after a restart. Screens read through query "
            "hooks; stale data is refetched on mount, return to the foreground, reconnect, pull-to-refresh or "
            "invalidation. Writes go straight to the API. Hook-based mutations invalidate affected queries "
            "after success, an uncertain network/gateway failure or a 409. There are no optimistic updates and no offline write queue.")
    s.heading("Server is the source of truth; the phone keeps a display cache",
              "Read path (blue), write path (amber). No optimistic writes; a failed response may follow commit. Refetch before retrying.")
    s.box(1040, 150, 480, 300, "CareKosh API + PostgreSQL",
          ["The only source of truth for categories, items, orders and activity.",
           "Owner-scoped business reads; separate global counters and AI quotas."], "provider")
    s.box(40, 150, 440, 300, "Screens (React Native)",
          ["useItems → ['items'] (all pages)", "useCategories → ['categories']", "useOrders → ['orders'] (staleTime 0)",
           "useActivities(20) → ['activities']", "Profile: zustand store, not TanStack",
           "Dashboard counts computed on the phone"], "core")
    s.box(540, 150, 440, 300, "TanStack Query cache (memory)",
          ["staleTime 30 s, gcTime 24 h, retry 3 (queries)", "refetch on mount, focus (AppState), reconnect (NetInfo), pull-to-refresh, invalidation",
           "networkMode offlineFirst: show cache, pause retries offline",
            "Invalidated after this app's saves, uncertain failures and 409s; no server push, so other phones' edits appear after a refetch."], "core")
    s.box(540, 540, 440, 210, "AsyncStorage copy 'carekosh-query-cache'",
          ["Restored at start if < 24 h old and the app version (buster) matches.",
           "Display cache only; mutations are never persisted.",
           "Cleared at login and logout (shared-device safety)."], "infra")
    s.box(40, 540, 440, 300, "Write path (mutations)",
          ["Button → offline check (NetInfo) → useMutation → service → API",
           "retry 0, networkMode always: no delayed offline replay",
            "on success, network/gateway failure or 409: invalidate affected keys → active views refetch",
            "ordinary request deadline: 90 s overall; no optimistic updates",
            "on error: toast or dialog; Retry keeps the same variables"], "provider")
    s.box(1040, 540, 480, 300, "What the person sees",
          ["Toast or 'Saved' dialog after a write; 'Updating…' on rows while saving.",
           "Offline: 'showing last synced data' (Dashboard, Orders); no last-sync time on lists.",
           "Assistant answers say 'Last synced · time' or 'Last known stock'.",
           "Item 409: server message and active-query refetch; reopen the form."], "external")
    s.arrow([(480, 300), (540, 300)], "")
    s.text_halo(510, 290, "read", 14, "middle", 600)
    s.arrow([(980, 230), (1040, 230)], "", both=True)
    s.text_halo(1010, 218, "GET", 14, "middle", 600)
    s.arrow([(760, 450), (760, 540)], "", both=True)
    s.text_halo(772, 520, "persist / restore", 14, "start", 600)
    s.arrow([(480, 580), (505, 580), (505, 495), (1280, 495), (1280, 450)], "")
    s.text_halo(1000, 487, "POST / PUT / PATCH / DELETE", 14, "middle", 600)
    s.box(40, 880, 1480, 160, "Assistant reads and local drafts",
          ["Reuses ['items'] only if it was fetched in this login (in-memory ownership stamp), is not invalidated and is under 30 s old; otherwise fetchQuery(['items']) → GET /api/v1/items (all pages, 20 s abort). Offline: last-known owned data labelled 'Last known'. Restored disk data alone is never trusted, and no answer is given while a save is pending."], "core")
    return s


DIAGRAMS = {
    "system-context.svg": system_context,
    "request-lifecycle.svg": request_lifecycle,
    "request-rollback.svg": request_rollback,
    "database-erd.svg": database_erd,
    "inventory-concurrency.svg": inventory_concurrency,
    "order-idempotency.svg": order_idempotency,
    "order-status.svg": order_status,
    "voice-flow.svg": voice_flow,
    "release-pipeline.svg": release_pipeline,
    "auth-session.svg": auth_session,
    "mobile-cache.svg": mobile_cache,
    "release-gate-0007-0010.svg": release_gate,
}


def main(argv: list[str]) -> int:
    selected = argv or list(DIAGRAMS)
    for name in selected:
        svg = DIAGRAMS[name]()
        (OUT / name).write_text(svg.render(), encoding="utf-8")
        print("wrote", (OUT / name).relative_to(OUT.parents[1]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
