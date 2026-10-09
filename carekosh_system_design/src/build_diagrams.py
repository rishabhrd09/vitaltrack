#!/usr/bin/env python3
"""Build the diagrams for the carekosh_system_design pages (paper edition).

Diagrams describe code and label unverified deployment assumptions, checked against branch feature/backend-hardening-ai-voice-agent-foundation
at 03cfebb on 7 October 2026 (see docs/documentation-audit-2026-10-07/SOURCE_OF_TRUTH.md) and re-checked against the
working tree on 8 October 2026 (FastAPI 0.115.6 request order, name lock on PUT /items, rollback scope, voice gating).
Voice and system context were refreshed against the 9 October working tree at 0946eb7 plus local capture/UI changes.

    python3 carekosh_system_design/src/build_diagrams.py               # all diagrams
    python3 carekosh_system_design/src/build_diagrams.py voice-flow    # one diagram
    python3 carekosh_system_design/src/build_pages.py                  # then refresh the pages

Output: carekosh_system_design/diagrams/<name>.svg (standalone files; the pages inline them).
"""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from paperkit import (COLOR, INK2, INK3, MAROON, MATH, MONO, SERIF, Canvas, Card, Flow,  # noqa: E402
                      fill_of, wrap)

OUT = HERE.parent / "diagrams"
W = 1000
REGISTRY: dict = {}


def diagram(name: str):
    def register(fn):
        REGISTRY[name] = fn
        return fn
    return register


def new(name: str, title: str, desc: str, width: int = W) -> Canvas:
    return Canvas(name, width, title, desc)


def under(c: Canvas, mark: int) -> None:
    """Move the most recently drawn shape underneath everything drawn since `mark`."""
    c.parts.insert(mark, c.parts.pop())


def frame(c: Canvas, mark: int, x: float, y: float, w: float, h: float, role: str, label: str) -> None:
    """A labelled container drawn underneath the cards placed inside it."""
    c.rect(x, y, w, h, fill_of(role), COLOR[role], 1.2, 16)
    under(c, mark)
    c.kicker(x + 16, y + 30, label, COLOR[role], 13)


# =========================================================================== big picture
@diagram("system-context")
def system_context() -> Canvas:
    c = new("system-context", "CareKosh at a glance",
            "The Android app talks to one FastAPI service over HTTPS with a bearer token. The service runs in a "
            "Docker container on Render and owns one PostgreSQL database, documented as hosted on Neon (CI and local "
            "use PostgreSQL 16). Default speech recognition and spoken replies run on the phone; the speech pack is downloaded "
            "once from Moonshine. Groq, Brevo and Sentry are used only when configured. There is no queue, "
            "no Redis, no worker service, no offline write queue and no over-the-air app update.")
    y = c.header("CareKosh at a glance",
                 "One phone app, one API service, one PostgreSQL database. Everything else supports them or is optional.")
    y = c.legend(y + 6) + 8
    # the phone
    mark = len(c.parts)
    cw = (W - 80 - 32 - 2 * 18) / 3
    cards = [("CareKosh app", ["Screens → hooks → services/api.ts", "TanStack Query cache, a copy kept in AsyncStorage",
                               "Tokens in SecureStore"]),
             ("Answers + local drafts", ["Tap-to-talk dock above the tabs", "Editable transcript, explicit Send",
                                        "A local matcher handles familiar wording first"]),
             ("On-device speech", ["AudioRecord WAV; Moonshine\nlive words and offline final\nrecognition",
                                   "Downloaded English pack;\nAndroid offline speech"])]
    hmax = max(Canvas.measure(cw, t, b) for t, b in cards)
    for i, (t, b) in enumerate(cards):
        c.card(56 + i * (cw + 18), y + 48, cw, t, b, "client", min_h=hmax)
    phone_h = 48 + hmax + 18
    frame(c, mark, 40, y, W - 80, phone_h, "client", "On the phone · Android")
    y += phone_h
    c.arrow([(W / 2, y + 4), (W / 2, y + 74)], "main", "HTTPS + JSON · Authorization: Bearer token", label_dx=16,
            label_anchor="start", label_dy=6, both=True)
    y += 78
    # the server
    mark = len(c.parts)
    left_w = 560
    api = c.card(56, y + 48, left_w, "FastAPI service · Python 3.12",
                 kv=[("Server", "Gunicorn starts 2 Uvicorn workers"),
                     ("Routes", "47 operations, 44 of them under /api/v1"),
                     ("Data", "business rows scoped to the\nsigned-in user"),
                     ("Start-up", "alembic upgrade head, then Gunicorn")], role="server")
    hw = W - 80 - 32 - left_w - 18
    health = c.card(56 + left_w + 18, y + 48, hw, "Health checks",
                    ["/live: process only (Render\npolls it)", "/health: SELECT 1; 2 s limit",
                     "Neither reports the\nrunning commit"], "server", min_h=api.h)
    frame_h = 48 + max(api.h, health.h) + 18
    frame(c, mark, 40, y, W - 80, frame_h, "platform", "Render web service · Docker container")
    rbottom = y + frame_h
    y = rbottom
    c.arrow([(56 + left_w / 2, y + 4), (56 + left_w / 2, y + 70)], "data", "SQLAlchemy async + asyncpg · TLS",
            label_dx=16, label_anchor="start", label_dy=6, both=True)
    db = c.card(40, y + 74, 600, "PostgreSQL · on Neon (documented)",
                "11 application tables plus alembic_version.\nThe source of truth; CI and local use PostgreSQL 16.",
                "data")
    sx = 40 + 600 + 26
    sw = W - 40 - sx
    c.kicker(sx, y + 60, "The API calls, if configured", COLOR["service"], 12.5)
    yy = y + 74
    for t, b in [("Groq", "question interpretation and optional Whisper listening, with separate consent and server AI settings"),
                 ("Brevo email", "verification, reset and deletion links"),
                 ("Sentry", "error reports and sampled traces, if SENTRY_DSN is set")]:
        sc = c.card(sx, yy, sw, t, b, "service", dashed=True, ts=19, bs=16.5, pad=14)
        yy = sc.bottom + 12
    c.arrow([(sx + sw / 2, rbottom + 3), (sx + sw / 2, y + 42)], "optional")
    y = max(db.bottom, yy) + 26
    note = c.card(40, y, W - 80, "Not in this system",
                  "No message queue or Redis · no background worker service · no offline write queue on the phone\n"
                  "no over-the-air app updates · hosted speech off; optional Groq listening needs separate audio opt-in", "note", ts=19)
    c.height = note.bottom + 36
    return c


@diagram("product-journey")
def product_journey() -> Canvas:
    c = new("product-journey", "A caregiver's day, step by step",
            "Eight everyday actions in order: sign in, build the inventory, check the dashboard, update a quantity, "
            "order supplies, mark the order received, add it to stock, and ask the assistant. Each card names the "
            "screen, the API call and what changes in the database. Writes always go to the server first.")
    y = c.header("A caregiver's day, step by step",
                 "What the person does, the request the app sends, and what changes in the database.")
    steps = [
        ("Sign in", [("Screen", "Login (a new account registers first)"), ("Calls", "POST /auth/login"),
                     ("Writes", "refresh token row, last login, activity"), ("Keeps", "tokens in SecureStore")]),
        ("Build the inventory", [("Screen", "Builder: “Build Inventory”"), ("Calls", "POST /categories, POST /items"),
                                 ("Writes", "categories, items at version 1, activity and audit rows"),
                                 ("Rule", "a name exists once per account (409)")]),
        ("Check the dashboard", [("Screen", "Dashboard tab"), ("Calls", "GET /items (all pages), /categories, /orders, /activities"),
                                 ("Writes", "nothing; reads only"), ("Phone", "counts low stock, out of stock, pending")]),
        ("Update a quantity", [("Screen", "Edit Item → Save"), ("Calls", "PUT /items/{id} with its version"),
                               ("Writes", "quantity, version + 1, activity, audit"), ("Conflict", "409, nothing saved")]),
        ("Order supplies", [("Screen", "Create Order"), ("Calls", "POST /orders with a localId"),
                            ("Writes", "order ORD-YYYYMMDD-NNNN, its lines, the daily counter, activity"),
                            ("Retry", "same localId returns the same order")]),
        ("Mark it received", [("Screen", "Orders: “Have you received the order?”"), ("Calls", "PATCH /orders/{id}/status"),
                              ("Writes", "status received, received_at, activity")]),
        ("Add it to stock", [("Screen", "Orders: “Update Stock”"), ("Calls", "POST /orders/{id}/apply"),
                             ("Writes", "one transaction: each item gains its line quantity and version + 1; audit rows; "
                                        "activity; order → stock_updated")]),
        ("Ask the assistant", [("Screen", "tap-to-talk dock above the tabs"), ("Phone", "Moonshine → reviewed text; local parser → inventory answer or unsaved draft"),
                               ("Calls", "GET /items unless the cache is fresh; /ai/interpret only if opted in"),
                               ("Writes", "ai_usage (and consent) rows only if Groq is used; never inventory or orders")]),
    ]
    gap_x, gap_y = 40, 60
    cw = (W - 80 - gap_x) / 2
    y += 12
    prev = None
    for r in range(4):
        row = steps[2 * r: 2 * r + 2]
        h = max(Canvas.measure(cw, t, kv=kv, num="1") for t, kv in row)
        cards = [c.card(40 + i * (cw + gap_x), y, cw, t, role="client", kv=kv, num=str(2 * r + i + 1), min_h=h)
                 for i, (t, kv) in enumerate(row)]
        c.arrow([(cards[0].right + 3, cards[0].y + 34), (cards[1].x - 5, cards[0].y + 34)], "main")
        if prev is not None:
            mid = prev.bottom + gap_y / 2
            c.arrow([(prev.cx, prev.bottom + 3), (prev.cx, mid), (cards[0].cx, mid), (cards[0].cx, cards[0].y - 5)], "main")
        prev = cards[1]
        y += h + gap_y
    half = (W - 80 - 30) / 2
    n1 = c.note(40, y - 8, half, "Writes go to the server first. After a successful write the phone invalidates the "
                                  "affected lists and fetches them again; another phone's changes appear after the "
                                  "next refetch.",
                "key")
    n2 = c.note(40 + half + 30, y - 8, half, "The app shows the last data it loaded, labelled as such. Every save fails "
                                             "until the phone is back online; nothing is queued for later.", "lens", "Offline")
    c.height = max(n1.bottom, n2.bottom) + 36
    return c


@diagram("backend-layers")
def backend_layers() -> Canvas:
    c = new("backend-layers", "The backend in layers",
            "An HTTPS request reaches Gunicorn and one of two Uvicorn workers, passes the middleware and reaches a "
            "router in app/api/v1. Routers use dependencies, Pydantic schemas and services; SQLAlchemy models map "
            "to PostgreSQL tables owned by Alembic migrations. app/core provides configuration, the database engine, "
            "security and logging to every layer. Brevo, Groq and Sentry are called only when configured.")
    y = c.header("The backend in layers",
                 "Follow a request from the top. The column on the right is used by every layer.")
    mx, mw = 40, 580
    rx = mx + mw + 30
    rw = W - 40 - rx
    y += 6
    gap = 40
    top_y = y

    def layer(title, body=None, role="server", kv=None, kicker=None, **kw) -> Card:
        nonlocal y
        card = c.card(mx, y, mw, title, body, role, kv, kicker=kicker, **kw)
        y = card.bottom + gap
        return card

    def down(a: Card) -> None:
        c.arrow([(mx + mw / 2, a.bottom + 3), (mx + mw / 2, a.bottom + gap - 5)], "main")

    down(layer("HTTPS request from the app", "PUT /api/v1/items/{id} · Bearer token · JSON body", "client", kicker="request"))
    down(layer("Gunicorn + 2 Uvicorn workers", "Docker runs app.main:app; each worker has one event loop", "platform",
               kicker="server process"))
    down(layer("Middleware · app/main.py", ["AIBodyLimit → security headers → X-Request-ID → CORS",
                                            "error handlers: 422 validation · 409 conflict · 500 unexpected"],
               kicker="every request"))
    rtop = y
    chips = [("auth.py", "18"), ("categories.py", "6"), ("items.py", "8"), ("orders.py", "6"), ("activity.py", "1"), ("ai.py", "5")]
    ch_w = (mw - 36 - 2 * 12) / 3
    rh = 82 + 2 * 70 + 50
    c.rect(mx, rtop, mw, rh, fill_of("server"), COLOR["server"], 1.8, 12)
    c.kicker(mx + 18, rtop + 29, "app/api/v1", COLOR["server"])
    c.text(mx + 18, rtop + 58, "Routers (44 routes)", 21, 600, COLOR["server"])
    for i, (name, n) in enumerate(chips):
        cx = mx + 18 + (i % 3) * (ch_w + 12)
        cy = rtop + 76 + (i // 3) * 70
        c.rect(cx, cy, ch_w, 60, "#FBF6EC", COLOR["server"], 1.2, 9)
        c.text(cx + ch_w / 2, cy + 26, name, 15.5, 600, COLOR["server"], MONO, "middle")
        c.text(cx + ch_w / 2, cy + 48, f"{n} route{'s' if n != '1' else ''}", 15.5, 400, INK3, SERIF, "middle", True)
    c.text(mx + 18, rtop + rh - 18, "app/main.py adds /, /health and /live: 47 in total", 16.5, 400, INK2, SERIF, "start", True)
    y = rtop + rh + gap
    down(Card(mx, rtop, mw, rh))
    half = (mw - 20) / 2
    d1 = ["get_db: shared business session; rollback only uncommitted work", "get_current_user: token → user row"]
    d2 = ["Pydantic models; mostly camelCase JSON, token fields snake_case",
          "invalid fields → 422 before handler; auth SQL may run first"]
    hh = max(Canvas.measure(half, "Dependencies", d1, kicker="api/deps.py"),
             Canvas.measure(half, "Schemas", d2, kicker="app/schemas"))
    c.card(mx, y, half, "Dependencies", d1, kicker="api/deps.py", min_h=hh)
    c.card(mx + half + 20, y, half, "Schemas", d2, kicker="app/schemas", min_h=hh)
    y += hh + gap
    down(Card(mx, y - gap - hh, mw, hh))
    svc = layer("Services and helpers",
                kv=[("Audit", "audit.py writes before/after rows"), ("Names", "inventory_lock.py: advisory locks"),
                    ("Assistant", "ai_guard.py (consent, quotas) and ai_provider.py (Groq)"),
                    ("Email", "utils/email.py → Brevo"), ("Limits", "utils/rate_limiter.py, best effort")],
                kicker="app/services · app/utils", kv_label=104)
    down(svc)
    down(layer("Models · app/models", "User, RefreshToken, Category, Item, Order, OrderItem, OrderNumberCounter, "
                                      "ActivityLog, AuditLog, AIConsent, AIUsage", kicker="SQLAlchemy 2.0, async"))
    db = layer("PostgreSQL", "11 tables with CHECK, UNIQUE and ON DELETE CASCADE rules. Alembic migrations 0001–0010 "
                             "own the schema. Version 16 in CI and local development.", "data", kicker="database")
    c.card(rx, top_y, rw, "app/core",
           kv=[("config", "settings from the environment; unsafe values refused"),
               ("database", "async engine, pool 5 + 10, 8 s statement timeout"),
               ("security", "JWT, Argon2, SHA-256 token digests"),
               ("logging", "tokens removed from logged URLs")], kicker="used by every layer", kv_label=90, bs=17)
    out = c.card(rx, svc.y, rw, "Outbound calls", ["Brevo email, if MAIL_PASSWORD is set",
                                                   "Groq, with AI_* settings and consent", "Sentry, if SENTRY_DSN is set"],
                 "service", dashed=True, kicker="httpx · when configured", bs=17)
    c.arrow([(svc.right + 3, svc.y + 60), (out.x - 5, svc.y + 60)], "optional")
    c.height = db.bottom + 36
    return c


# =========================================================================== request flows
@diagram("request-journey")
def request_journey() -> Canvas:
    c = new("request-journey", "One tap, end to end: saving an edited item",
            "The Edit Item screen calls the update mutation and closes. The API client adds the access token and "
            "sends PUT /api/v1/items/{id} over HTTPS. On Render a Uvicorn worker runs the middleware; FastAPI "
            "parses the JSON, loads the user through its dependencies and then validates the fields. Because the "
            "body names the item, the handler first takes the account's name lock, then checks ownership, runs a "
            "compare-and-swap UPDATE, writes activity and audit rows and commits. The response returns, and the app "
            "invalidates its item and activity lists and fetches them again.")
    y = c.header("One tap, end to end: Edit Item → Save",
                 "From the button to PostgreSQL and back. Numbers follow the order of events.")
    f = Flow(c, [("phone", "On the phone", "client"), ("server", "On the server (Render)", "server"),
                 ("db", "In PostgreSQL", "data")], top=y + 4, widths=[33, 36, 31])
    f.step("phone", "Tap Save", "mutate({fields, version}); the screen closes", num="1")
    f.step("phone", "useUpdateItem", "no optimistic change; waits for the reply", num="2")
    f.step("phone", "services/api.ts", "adds the Bearer token, sends PUT /api/v1/items/{id}", num="3")
    f.step("server", "Middleware", "arrives over HTTPS at a Uvicorn worker; body at most 2 MB; headers and request id",
           num="4", kind="main")
    f.step("server", "Route and JSON parsing", "malformed JSON → 422 before dependencies", num="5")
    f.step("server", "Dependencies, then field validation", "get_db session; get_current_user SELECTs the user; "
                                                            "ItemUpdate field errors → 422 only after that", num="6")
    f.step("db", "Name lock, ownership, compare-and-swap", "the body has a name, so a per-account advisory lock first; "
                                                           "SELECT the item; UPDATE … WHERE id AND user_id AND version = :v",
           num="7")
    f.step("db", "History rows, then COMMIT", "1 row changed (0 rows → 409, nothing written); activity and audit rows; "
                                              "the handler commits", num="8")
    f.step("server", "200 ItemResponse", "camelCase JSON with X-Request-ID and security headers", num="9", kind="reply")
    f.step("phone", "onSuccess", "invalidate items and activities; GET /items refetch; a toast (a dialog if slow) confirms",
           num="10", kind="reply")
    f.step("phone", "If it fails", "a toast or dialog offers Retry; a 401 first triggers one shared token refresh",
           role="fail", num="11", link="none")
    c.height = f.finish() + 30
    return c


@diagram("request-lifecycle")
def request_lifecycle() -> Canvas:
    c = new("request-lifecycle", "Inside the server: one request, step by step",
            "A close-up of the server side of PUT /api/v1/items/{id}. The middleware reads the body and notes the "
            "request id; FastAPI matches the route and parses the JSON; dependencies create a session and load the "
            "user, then the fields are validated, all before the handler. The handler takes the account's name lock, "
            "checks ownership, runs a compare-and-swap UPDATE, writes history rows and commits. db.refresh then reads "
            "the row in a new transaction, the response is serialised in camelCase, and get_db commits that read and "
            "closes the session; headers are added on the way out.")
    y = c.header("Inside the server: one request, step by step",
                 "The same PUT /api/v1/items/{id}, seen from FastAPI. Steps 1–5 run before your handler.")
    f = Flow(c, [("fw", "Middleware and FastAPI", "server"), ("h", "Handler · update_item", "key"),
                 ("db", "PostgreSQL", "data")], top=y + 4, widths=[33, 30, 37])
    f.step("fw", "Body read and checked", "AIBodyLimit: at most 2 MB, else 413", num="1")
    f.step("fw", "Request id noted", "X-Request-ID echoed or created; security headers are added on the way out; "
                                     "CORS answers browsers only", num="2")
    f.step("fw", "Route matched, JSON parsed", "malformed JSON → 422 before dependencies", num="3")
    f.step("fw", "get_db creates a session", "no connection until the first SQL; pool 5 + 10 per worker", num="4")
    f.step("fw", "Auth, then field validation", "get_current_user SELECTs the user and checks policy; then ItemUpdate "
                                                "field errors → 422, before the handler", num="5")
    f.step("h", "Name lock, then ownership", "advisory lock (the body has a name); SELECT … WHERE id AND user_id; "
                                             "not yours → 404", num="6", role="server")
    f.step("db", "Compare-and-swap UPDATE", "SET …, version = version + 1 WHERE … AND version = :v RETURNING", num="7")
    f.step("h", "0 rows? Stop with 409", "the body carries server_version and server_quantity; nothing written",
           role="fail", num="8", kind="fail")
    f.step("db", "History rows", "INSERT activity_logs (item_update) and audit_log (old → new)", num="9", link="none")
    f.step("db", "Handler COMMIT", "UPDATE and history land together; rollback undoes work before this commit only", num="10")
    f.step("fw", "Response", "db.refresh reads the row in a new transaction; ItemResponse in camelCase; get_db "
                             "commits that read and closes; headers added on the way out", num="11", kind="reply")
    c.height = f.finish() + 30
    return c


@diagram("auth-session")
def auth_session() -> Canvas:
    c = new("auth-session", "Signing in and staying signed in",
            "Login returns a 30-minute access token and a 30-day refresh token, stored in SecureStore. Every request "
            "sends the access token; the server checks it and the user row. When it expires the app makes one shared "
            "refresh call; the server claims the old refresh token with a conditional update and issues a new pair. "
            "Logout clears local credentials without waiting for best-effort server revocation (30 s overall). "
            "Server logout revokes the refresh token only. A password change or reset increases session_version, which "
            "invalidates every older token.")
    y = c.header("Signing in and staying signed in",
                 "Two tokens: a short access token for every call, and a single-use refresh token to get a new pair.")
    f = Flow(c, [("phone", "Phone", "client"), ("api", "API", "server"), ("db", "PostgreSQL", "data")],
             top=y + 4, widths=[32, 36, 32])
    f.divider("Sign in")
    f.step("phone", "POST /auth/login", "identifier (email or username) and password", num="1")
    f.step("api", "Check the password", "user row locked (SELECT … FOR UPDATE); Argon2 verify in a worker thread", num="2")
    f.step("db", "Record the session", "INSERT refresh_tokens (jti); last_login; activity user_login", num="3")
    f.step("phone", "Keep both tokens", "SecureStore: access 30 min, refresh 30 days", num="4", kind="reply")
    f.divider("Every request")
    f.step("phone", "Authorization: Bearer <access>", "added by services/api.ts", num="5")
    f.step("api", "get_current_user", "signature, expiry, type, session_version, active; verified only when enforcement and email are on → 401 / 403", num="6")
    f.divider("When the access token expires")
    f.step("phone", "401 → one shared refresh", "all waiting calls share it; 30 s limit", num="7")
    f.step("db", "Claim the refresh token once", "user row locked, session_version checked; UPDATE … SET is_revoked "
                                                "WHERE jti AND not revoked AND not expired; a second use gets 401", num="8")
    f.step("phone", "New pair stored, call retried once", "stored only if the credential generation still matches; "
                                                          "refresh 401/403 → signed out; timeout/5xx → keep tokens, fail the call", num="9", kind="reply")
    f.divider("Log out, change or reset the password")
    f.step(["phone", "api"], "Logout", "clear phone tokens and caches; captured credentials are revoked separately, "
                                       "best effort (30 s). New login waits only for local cleanup. "
                                       "Existing access tokens still expire normally (at most 30 min).", num="10", role="fail", link="none")
    f.step(["api", "db"], "Password change or reset", "session_version + 1 and every refresh row revoked: all older "
                                                      "tokens fail at their next use", num="11", link="none")
    c.height = f.finish() + 30
    return c


@diagram("inventory-concurrency")
def inventory_concurrency() -> Canvas:
    c = new("inventory-concurrency", "Two phones edit the same item",
            "Phone A and phone B both read the item at version 3. A saves first: the UPDATE matches version 3 and "
            "the row becomes version 4. Edit Item sends the item name, so B's PUT first waits on the account's "
            "name lock until A commits; its SELECT then sees A's committed row, its UPDATE matches no row and the "
            "API returns 409 with those current values. The losing UPDATE overwrites nothing. A request without a name, such as "
            "the API-only stock PATCH, instead waits on A's row lock and re-checks its WHERE clause.")
    y = c.header("Two phones edit the same item",
                 "Optimistic concurrency: each save names the version it read, so only the first save with version 3 can win.")
    f = Flow(c, [("a", "Phone A", "client"), ("s", "API and PostgreSQL", "server"), ("b", "Phone B", "client")],
             top=y + 4, widths=[30, 40, 30])
    a1 = f.step("a", "Reads the item", "40 left · version 3", num="1")
    f.step("b", "Reads the item", "40 left · version 3", num="2", same_row=True, link="none")
    f.prev = a1
    f.step("a", "Saves 38", "PUT /items/{id} with version 3", num="3")
    f.step("s", "UPDATE … WHERE version = 3", "1 row: now 38 at version 4; activity and audit rows; COMMIT", num="4", role="data")
    f.step("a", "200 OK", "the list refetches and shows 38", num="5", kind="reply")
    f.step("b", "Saves 36 at nearly the same time", "PUT /items/{id}, still with version 3", num="6", link="none")
    f.step("s", "UPDATE … WHERE version = 3", "B waited on the account's name lock (PUT sends the name) until A "
                                              "committed; its UPDATE now matches nothing",
           num="7", role="fail", kind="fail")
    f.step("b", "409 Version conflict", "no write by B; with the name lock, B's SELECT ran after A committed, so the reported values are current", num="8", role="fail", kind="fail")
    f.note("The app now captures the version with the form fields (A-1 fixed locally). A cache refresh cannot "
           "replace that version. After 409, active queries refetch; reopen the form for current values. "
           "Retry retains the original variables and version.", "risk", title="In the app today", after=True)
    c.height = f.finish() + 30
    return c


@diagram("order-idempotency")
def order_idempotency() -> Canvas:
    c = new("order-idempotency", "Order creation and retries",
            "The app generates one localId per Save. A retry with the same localId returns the order already created "
            "with status 200. Two identical requests at the same moment collide on a partial unique index; the loser "
            "rolls back, which also releases its order number, and returns the winner's order. Requests without a "
            "localId, such as those from older app builds, always create a new order.")
    y = c.header("Order creation and retries",
                 "A localId per Save makes the same request safe to send twice (migration 0010).")
    f = Flow(c, [("phone", "Phone", "client"), ("api", "API", "server"), ("db", "PostgreSQL", "data")],
             top=y + 4, widths=[30, 36, 34])
    f.divider("First attempt")
    f.step("phone", "Save → localId L", "generated once for this submission, retained for retries", num="1")
    f.step("api", "Look up (user, L)", "none found; every item id must belong to you (else 400)", num="2")
    f.step("db", "Number, insert, commit", "today's counter + 1 → ORD-…-0007; INSERT order, lines, activity; COMMIT", num="3")
    f.step("phone", "201 Created", "the Orders list refetches", num="4", kind="reply")
    f.divider("The response was lost, so the person taps Retry")
    f.step("phone", "Same request, same L", "Retry reuses the mutation's variables", num="5")
    f.step("api", "Look up (user, L)", "found: return it", num="6")
    f.step("phone", "200 OK, the same order", "nothing new is written", num="7", kind="reply")
    f.divider("Two identical requests arrive at the same moment")
    f.step("api", "Both look up: none", "both take a number from the daily counter; the second waits on the counter "
                                        "row until the first commits", num="8")
    f.step("db", "The unique index stops the second", "uq_orders_user_id_local_id → IntegrityError", num="9", role="fail", kind="fail")
    f.step("api", "The loser rolls back", "its number is released; it returns the winner's order with 200", num="10")
    f.note("Requests without a localId (app builds older than this branch) always create a new order. A new confirmed submission "
           "uses a new key; an uncertain submission retains its original key. The index preserves later legacy duplicate rows by exempting their ids; a replay with changed data still returns the original.", "lens", title="Limits", after=True)
    c.height = f.finish() + 30
    return c


@diagram("voice-flow")
def voice_flow() -> Canvas:
    c = new("voice-flow", "Inventory answers and unsaved order drafts",
            "Microphone, selected Moonshine or separately consented Groq transcription, transcript review and Send precede bounded interpretation. "
            "Inventory facts and local draft quantities are resolved on the phone. Voice has no save or stock tool. "
            "Only a separate touch confirmation on Create Order saves an order; applying stock remains separate.")
    y = c.header("Inventory answers and unsaved order drafts",
                 "Speech → reviewed text → validated query/draft → verified data. A touch is required to save.")
    f = Flow(c, [("phone", "On the phone", "client"), ("api", "CareKosh API", "server"), ("groq", "Groq (optional)", "service")],
             top=y + 4, widths=[44, 30, 26])
    def step(lane, title, body, **kw):
        # Leave room for the wider offline fallback fonts, not only Newsreader.
        inner = f.lane[lane][1] - 24 - 36
        title = "\n".join(wrap(title, (inner - 42) * 0.85, 21, "bold"))
        body = "\n".join(wrap(body, inner * 0.85, 18))
        return f.step(lane, title, body, **kw)
    step("phone", "Tap, record, tap again", "New APK: one AudioRecord, mono PCM16/16 kHz WAV + local live captions with speech pack; older native: Expo AAC/M4A; max 28 s", num="1")
    step("phone", "Choose listening", "Default: Moonshine Small Streaming English runs here. Optional Groq listening needs a fresh local audioOptIn; no automatic provider fallback", num="2")
    step("api", "Audio upload", "Optional POST /ai/transcribe only with groq_audio consent, auth, flags and quota. Temporary decoding; normalize to 16 kHz; inventory is not uploaded", num="2a", kind="optional", dashed=True)
    step("groq", "Whisper", "whisper-large-v3: audio to words only. It does not understand an intent or create a draft. Generic vocabulary prompt only", num="2b", kind="optional", dashed=True)
    step("phone", "Review words, then Send", "Offline mode skips the optional audio requests. Delete temporary audio; transcript editable. No interpretation or drafting before Send", num="2c", kind="reply")
    step("phone", "Local bounded parser", "Legacy reads plus inventory filters and local draft commands. Save/apply/send actions remain unavailable", num="3")
    step("api", "Interpret", "Optional POST /ai/interpret. Unmatched wording only; consent groq_text, auth, flags and quota. contract_version=2 if supported; text only", num="4", kind="optional", dashed=True)
    step("groq", "Groq spec", "No tools. openai/gpt-oss-20b default, temperature 0, low reasoning, 25 s deadline. Query/draft JSON only; validation still cannot prove meaning", num="5", kind="optional", dashed=True)
    step("api", "Validate", "Settle usage. Names, units and number-to-item association checked. Legacy v1 remains supported. Only consent/usage metadata writes", num="6", kind="optional")
    step("phone", "Verify and resolve data", "Complete inventory owned by this login; pending writes block. Ambiguous names/units require clarification. Offline = last known", num="7", kind="reply")
    step("phone", "Table or unsaved draft", "Persistent virtualized rows, concise speech, separate brand/supplier. Drafts in session memory; merge/replace/cancel preserves manual work", num="8")
    f.note("VOICE STOPS HERE: no order-save, order-PDF-save, stock/status/apply or supplier-send tool. Saying confirm cannot save. Inventory PDF requires a separate reviewed touch export.", "key")
    step("phone", "Touch to save", "Create Order: Confirm order & export PDF. Require matching backend guard; refresh inventory; re-review changed stock without changing order quantities", num="9", kind="reply")
    step("api", "POST /orders", "Authenticated ownership + expectedVersion under sorted item locks. Stable localId returns the original order on retry. Saving does not increase stock", num="10", kind="reply")
    step("phone", "Export saved response", "Shared local PDF template uses server-returned rows. PDF failure re-exports the same order. Unknown save outcome retains request and ID", num="11", kind="reply")
    f.note("Leaving or account change blocks late client dispatch/share; it cannot undo a write already sent.\nNative/device/provider behavior and live deployments still require acceptance testing.", "lens", after=True)
    c.height = f.finish() + 30
    return c


@diagram("request-rollback")
def request_rollback() -> Canvas:
    c = new("request-rollback", "When a request fails",
            "Four failure paths. Invalid fields get 422 before the handler, but authentication can query first. Another user's id "
            "returns 404 through ownership-scoped resource queries. An order apply that finds a deleted item raises "
            "409 before it writes anything; if an item vanishes after the order is claimed, get_db rolls back the "
            "claim and every stock change. An unexpected crash returns a generic 500 without the request id or "
            "security headers.")
    y = c.header("When a request fails",
                 "Rollback undoes uncommitted work. A failed or missing reply does not prove no change committed.")
    cases = [
        ("422", "Invalid input", "fail", "Pydantic rejects invalid fields before the handler. Auth SQL may run first. Malformed JSON is rejected before dependencies."),
        ("404", "Not your data", "server", "Protected resource queries check the owner. Another person's id is simply not "
                                           "found, so the API never reveals that it exists."),
        ("409", "Conflict, nothing kept", "fail", "Applying an order whose item was deleted stops with 409 before any "
                                                  "write. If an item vanishes after the claim, get_db rolls the claim "
                                                  "and every stock change back."),
        ("500", "Unexpected crash", "fail", "A generic message; the log keeps the error type and location but no "
                                            "values. This reply lacks X-Request-ID and security headers (A-13)."),
    ]
    cw = (W - 80 - 30) / 2
    y += 12
    tw = cw - 150
    hmax = max(52 + len(wrap(b, tw, 17.5)) * 17.5 * 1.42 + 36 for _, _, _, b in cases)
    hmax = max(hmax, 190)
    for i, (code, title, role, body) in enumerate(cases):
        x = 40 + (i % 2) * (cw + 30)
        yy = y + (i // 2) * (hmax + 26)
        c.rect(x, yy, cw, hmax, fill_of(role), COLOR[role], 1.8, 12)
        c.text(x + 22, yy + 72, code, 56, 500, COLOR[role], MATH)
        c.text(x + 132, yy + 44, title, 21, 600, COLOR[role])
        c.lines(x + 132, yy + 74, wrap(body, tw, 17.5), 17.5)
    y += 2 * (hmax + 26)
    n = c.note(40, y, W - 80, "A failure before commit rolls back the current transaction (get_db). Order apply, "
                             "category delete and account deletion group their changes together. Later errors cannot undo a commit. A missing reply does not prove "
                             "nothing was written, so refetch before retrying a create.", "key")
    c.height = n.bottom + 36
    return c


@diagram("mobile-cache")
def mobile_cache() -> Canvas:
    c = new("mobile-cache", "The phone's copy of the data",
            "PostgreSQL behind the API is the only source of truth. The app keeps a TanStack Query cache in memory and "
            "persists a copy to AsyncStorage for display after a restart. Stale data is refetched on mount, return to "
            "the foreground, reconnect, pull-to-refresh or invalidation. Writes go straight to the API. Hook-based "
            "mutations invalidate affected queries after success, uncertain network/gateway failure or 409. "
            "There are no optimistic updates and no offline write queue.")
    y = c.header("The phone's copy of the data",
                 "The server is the source of truth. The phone keeps a display cache, never a second database.")
    f = Flow(c, [("read", "Reading", "client"), ("write", "Saving", "client")], top=y + 4, widths=[50, 50])
    r1 = f.step("read", "Screens", ["useItems → ['items'] (all pages)", "useOrders → ['orders'] (staleTime 0)",
                                    "Dashboard counts are computed on the phone"], num="1")
    r2 = f.step("read", "TanStack Query cache", ["in memory: staleTime 30 s (not polling), gcTime 24 h", "retry 3 for reads",
                                                 "refetch on mount, foreground, reconnect, pull-to-refresh"], num="2")
    # The saved copy hangs off the cache (indented); the cache itself is what fetches from the API.
    lx, lw, _, _ = f.lane["read"]
    r3 = c.card(lx + 12 + 76, r2.bottom + 46, lw - 24 - 76, "AsyncStorage copy",
                ["key carekosh-query-cache, restored if under 24 h old", "busted when Expo app version changes (not versionCode alone)",
                 "cleared at login and logout"], "data", num="3")
    c.arrow([(r3.cx, r2.bottom + 3), (r3.cx, r3.y - 5)], "copy", "saved copy", label_dx=12, label_anchor="start",
            label_dy=5)
    f.bottom["read"] = r3.bottom
    f.prev = None
    w1 = f.step("write", "A button", "most write buttons check NetInfo first and stop with “Offline” when disconnected", num="1")
    w2 = f.step("write", "Mutation → service → API", ["retry 0, networkMode always: no deferred offline replay", "ordinary request: 90 s overall deadline; no optimistic update"],
                num="2")
    w3 = f.step("write", "On success: invalidate", "affected query keys only → refetch (depends on the mutation)", num="3", link="none")
    f.prev = None
    f.y = max(r3.bottom, w3.bottom) + 56
    server = f.step(["read", "write"], "CareKosh API + PostgreSQL",
                    "The only source of truth. Reads reflect their transaction snapshot and can soon be stale. The server never pushes changes, "
                    "so another phone's edits appear after a refetch.", role="server")
    gx = r2.x + 38
    c.arrow([(gx, r2.bottom + 3), (gx, server.y - 5)], "reply", both=True)
    c.text(gx + 14, server.y - 18, "fetches and refetches", 16.5, 400, INK2, SERIF, "start", True, halo=True)
    # The mutation calls the API before onSuccess; route around that callback card.
    c.arrow([(w2.cx, w2.bottom + 3), (w2.cx, w2.bottom + 18), (W - 24, w2.bottom + 18),
             (W - 24, server.cy), (server.right + 5, server.cy)], "main")
    c.arrow([(w3.cx, server.y - 3), (w3.cx, w3.bottom + 5)], "reply", "success reply", label_dx=12,
            label_anchor="start", label_dy=4)
    f.note("Hook-based mutations also invalidate affected active queries after uncertain network/gateway failures or 409s. "
           "A missing reply can follow commit: check refreshed data before retrying. Retry keeps the original variables.", "key")
    c.height = f.finish() + 30
    return c


@diagram("release-pipeline")
def release_pipeline() -> Canvas:
    c = new("release-pipeline", "From a merged change to users",
            "The backend and the Android app are released separately. Backend: a pull request runs CI, a staging "
            "candidate is deployed through the staging service (dashboard settings not verified), and merging can deploy production if a trigger is configured; every container start migrates "
            "the database first. App: an EAS production build is uploaded to Play internal testing, then promoted; "
            "installed apps only change when people install the new build.")
    y = c.header("From a merged change to users",
                 "Two separate pipelines. Built is not deployed; deployed is not healthy; healthy is not proof of the commit.")
    f = Flow(c, [("be", "Backend", "server"), ("app", "Android app", "client")], top=y + 4, widths=[55, 45])
    f.step("be", "Pull request to main", "a feature push alone does not trigger this CI workflow", num="1", role="platform")
    f.step("be", "CI on the pull request", kv=[("Fails run", "Ruff, pytest (242), route gate 44, coverage floors, "
                                                           "autolinking, tsc, npm test (121), ESLint"),
                                             ("Advisory", "mypy, Trivy, Expo Doctor: never fail the run")],
           num="2", role="platform", kv_label=92)
    f.step("be", "Staging candidate", "deployed by hand (dashboard service, not verified) with its own database; "
                                      "a preview APK calls staging", num="3")
    f.step("be", "Merge makes code eligible for production", "hook if configured; auto-deploy if on (live settings not verified)",
           num="4", role="fail", kind="main")
    f.step("be", "Every container start", "wait for PostgreSQL → alembic upgrade head → Gunicorn → Render checks /live",
           num="5", role="platform")
    f.step("be", "Verify", "Render's deployed commit, alembic current, /live and /health", num="6", role="key")
    f.prev = None
    f.step("app", "EAS production build", "by hand (the CI job is disabled): eas build --profile production → AAB; "
                                          "versionCode set remotely", num="1")
    f.step("app", "Play internal testing", "eas submit → internal track; up to 100 testers; production data", num="2")
    f.step("app", "Closed test, then production", "personal accounts created after 13 Nov 2023: 12 testers for 14 days first", num="3")
    f.step("app", "People install the update", "no over-the-air updates: every change needs a new build", num="4")
    c.height = f.finish() + 30
    return c


@diagram("order-status")
def order_status() -> Canvas:
    c = new("order-status", "An order's life",
            "Orders start pending. Pending can become ordered, received or declined. Ordered can become partially "
            "received or received. Partially received can become received. Received becomes stock updated only "
            "through POST apply, which adds every line's full quantity to stock once, in one transaction. Declined "
            "and stock updated are final. Only pending and declined orders can be deleted.")
    y = c.header("An order's life",
                 "Statuses only move forward. Stock changes exactly once: when a received order is applied.")
    y += 24
    sw, sh, gapy = 236, 80, 250
    pos = {"pending": (40, y), "ordered": (382, y), "partially_received": (724, y),
           "declined": (40, y + gapy), "received": (382, y + gapy), "stock_updated": (724, y + gapy)}
    labels = {"pending": "pending", "ordered": "ordered", "partially_received": "partially received",
              "declined": "declined", "received": "received", "stock_updated": "stock updated"}
    final = {"declined", "stock_updated"}
    for k, (x, yy) in pos.items():
        role = "key" if k in final else "server"
        c.rect(x, yy, sw, sh, fill_of(role), COLOR[role], 2, 40)
        if k in final:
            c.rect(x + 6, yy + 6, sw - 12, sh - 12, "none", COLOR[role], 1.2, 34)
        c.text(x + sw / 2, yy + sh / 2 + 8, labels[k], 22, 600, COLOR[role], SERIF, "middle")
    px, py = pos["pending"]
    ox, oy = pos["ordered"]
    qx, qy = pos["partially_received"]
    dx, dy = pos["declined"]
    rx, ry = pos["received"]
    sx, sy = pos["stock_updated"]
    mid_y = py + sh + (gapy - sh) / 2
    c.arrow([(px + sw + 3, py + sh / 2), (ox - 5, py + sh / 2)], "flow", "mark ordered", label_dy=-12)
    c.arrow([(ox + sw + 3, oy + sh / 2), (qx - 5, oy + sh / 2)], "flow", "some arrived", label_dy=-12)
    c.arrow([(ox + sw / 2, oy + sh + 3), (rx + sw / 2, ry - 5)], "flow", "all arrived", label_dx=12, label_anchor="start",
            label_dy=-26)
    c.arrow([(px + 60, py + sh + 3), (dx + 60, dy - 5)], "fail", "decline", label_dx=-12, label_anchor="end", label_dy=-26)
    c.arrow([(px + sw - 50, py + sh + 3), (px + sw - 50, mid_y), (rx + 50, mid_y), (rx + 50, ry - 5)], "flow",
            "received directly", label_at=0.5, label_dy=-10)
    c.arrow([(qx + 60, qy + sh + 3), (qx + 60, mid_y), (rx + sw - 50, mid_y), (rx + sw - 50, ry - 5)], "flow",
            "rest arrived", label_at=0.5, label_dy=-10)
    c.arrow([(rx + sw + 3, ry + sh / 2), (sx - 5, ry + sh / 2)], "main", "POST /apply", label_dy=-12)
    c.text((rx + sw + sx) / 2, ry + sh / 2 + 30, "the only way", 15.5, 400, MAROON, SERIF, "middle", True)
    y2 = ry + sh + 44
    c.rect(W - 40 - 248, y2 - 14, 26, 18, fill_of("key"), COLOR["key"], 1.6, 9)
    c.text(W - 40 - 214, y2, "double outline = final", 15.5, 400, INK2)
    y2 += 26
    cw = (W - 80 - 2 * 20) / 3
    cards = [("Change status", "PATCH …/status", ["illegal move → 400", "same status → 200, no change", "lost a race → 409"]),
             ("Apply to stock", "POST …/apply", ["only from received", "adds every line's full quantity once, in one transaction",
                                                 "repeat → 400; missing item → 409"]),
             ("Delete", "DELETE /orders/{id}", ["only pending or declined", "checked again in the final SQL"])]
    hmax = max(Canvas.measure(cw, t, b, kicker=k, bs=17) for t, k, b in cards)
    for i, (t, k, b) in enumerate(cards):
        c.card(40 + i * (cw + 20), y2, cw, t, b, "server", kicker=k, min_h=hmax, bs=17)
    y3 = y2 + hmax + 26
    n = c.note(40, y3, W - 80, "The app offers only two moves: “Have you received the order?” (pending → received) and "
                              "“Update Stock” (apply). The others are API-only. “Remove” appears for every status, but "
                              "the server refuses to delete received and applied orders (A-2).", "lens", "In the app")
    c.height = n.bottom + 36
    return c


@diagram("database-erd")
def database_erd() -> Canvas:
    c = new("database-erd", "The database at migration 0010",
            "Eleven application tables. users owns its data directly or through orders; the global counter has no owner. "
            "User data uses ON DELETE CASCADE. order_items.item_id and activity_logs.item_id are plain references without "
            "foreign keys, so order history survives item deletion. Item and category names are not unique in the "
            "database; the API serialises duplicate checks with advisory locks.")
    y = c.header("The database at migration 0010",
                 "Eleven tables. User data cascades directly or through a parent; the daily order counter is global.")
    y += 8

    def table(x, yy, w, name, rows, role="data", note=None) -> Card:
        h = 50 + len(rows) * 27 + (30 if note else 0) + 12
        c.rect(x, yy, w, h, fill_of(role), COLOR[role], 1.8, 12)
        c.parts.append(f'<path d="M{x:.1f},{yy + 44:.1f} H{x + w:.1f}" stroke="{COLOR[role]}" stroke-width="1.2" opacity="0.5"/>')
        c.text(x + 16, yy + 30, name, 18.5, 600, COLOR[role], MONO)
        ty = yy + 70
        for col, desc in rows:
            c.text(x + 16, ty, col, 15, 500, INK2, MONO)
            if desc:
                c.text(x + w - 14, ty, desc, 15.5, 400, INK3, SERIF, "end", True)
            ty += 27
        if note:
            c.text(x + 16, ty + 6, note, 15.5, 400, COLOR[role], SERIF, "start", True)
        return Card(x, yy, w, h)

    users = table(300, y, 400, "users", [("id", "UUID string, primary key"), ("email · username", "unique; one is required"),
                                         ("hashed_password", "Argon2"), ("session_version", "token generation (0007)"),
                                         ("is_active · is_email_verified", ""), ("verify · reset · delete digests", "SHA-256")],
                  "key")
    y2 = users.bottom + 56
    cw = (W - 80 - 40) / 2
    cats = table(40, y2, cw, "categories", [("user_id", "→ users"), ("name", "unique per user, by the API"),
                                            ("is_default", "cannot be deleted")])
    items = table(40 + cw + 40, y2, cw, "items", [("user_id · category_id", "→ users, → categories"),
                                                  ("quantity", "CHECK ≥ 0"), ("version", "optimistic lock"),
                                                  ("minimum_stock · is_critical", "")])
    hh = max(cats.h, items.h)
    y3 = y2 + hh + 56
    orders = table(40, y3, cw, "orders", [("user_id", "→ users"), ("order_id", "ORD-YYYYMMDD-NNNN, unique"),
                                          ("status", "stored as the enum name"), ("local_id", "unique per user if set (0010)")])
    lines = table(40 + cw + 40, y3, cw, "order_items", [("order_id", "→ orders"), ("item_id", "a copy, no foreign key"),
                                                        ("quantity", "CHECK > 0"), ("name · unit · stock", "snapshot")])
    # relationships
    c.arrow([(cats.cx, cats.y - 3), (cats.cx, users.cy), (users.x - 5, users.cy)], "data", "user_id", label_dy=-10)
    c.arrow([(items.cx, items.y - 3), (items.cx, users.cy), (users.right + 5, users.cy)], "data", "user_id", label_dy=-10)
    c.arrow([(items.x - 3, items.y + 60), (cats.right + 5, items.y + 60)], "data")
    c.arrow([(lines.x - 3, lines.y + 60), (orders.right + 5, lines.y + 60)], "data")
    c.arrow([(lines.cx, lines.y - 3), (lines.cx, items.y + hh + 5)], "copy", "item_id: copy only", label_dx=12,
            label_anchor="start", label_dy=4)
    y4 = y3 + max(orders.h, lines.h) + 50
    tw = (W - 80 - 2 * 20) / 3
    row = [("refresh_tokens", [("jti", "unique"), ("is_revoked · expires_at", ""), ("device · IP address", "")]),
           ("activity_logs", [("action", "enum name"), ("item_name · details", ""), ("item_id · order_id", "no FK")]),
           ("audit_log", [("entity_type · entity_id", ""), ("old_values · new_values", "JSONB"), ("no API reads it", "")]),
           ("ai_consents", [("user_id", "PK → users, cascade"), ("version · accepted", ""), ("scopes", "e.g. groq_text")]),
           ("ai_usage", [("kind · provider · status", ""), ("reserved cost", "micro-USD"), ("token counts", "")]),
           ("order_number_counters", [("day", "YYYYMMDD, primary key"), ("last_value", ""), ("no user link", "kept forever")])]
    yy = y4
    for r in range(2):
        hrow = 0
        for i in range(3):
            name, rows = row[r * 3 + i]
            role = "data" if name != "order_number_counters" else "key"
            t = table(40 + i * (tw + 20), yy, tw, name, rows, role,
                      note="user_id → users, cascade" if name not in ("order_number_counters", "ai_consents") else None)
            hrow = max(hrow, t.h)
        yy += hrow + 20
    n = c.note(40, yy + 6, W - 80, "Order lines cascade through orders; other user data links directly to users. The global counter has no owner. Later legacy localId duplicates are index-exempt. Item "
                                  "and category names are not unique in the database; the API checks them under an "
                                  "advisory lock.", "key")
    c.height = n.bottom + 36
    return c


# =========================================================================== backend concepts
@diagram("middleware-onion")
def middleware_onion() -> Canvas:
    c = new("middleware-onion", "The layers around every request",
            "Nested layers a request passes through, outermost first: ServerErrorMiddleware, AIBodyLimit, security "
            "headers, request id, CORS, ExceptionMiddleware, then the router with its dependencies and handler. The "
            "right column lists what each layer can send back. Crashes become a plain 500 from the outermost layer, "
            "without the request id or security headers.")
    y = c.header("The layers around every request",
                 "Each middleware wraps the previous one, so the last one added (AIBodyLimit) is the outermost of ours.")
    y += 40
    layers = [("ServerErrorMiddleware · Starlette", "platform"), ("AIBodyLimit · pure ASGI", "server"),
              ("Security headers", "server"), ("X-Request-ID", "server"), ("CORS", "server"),
              ("ExceptionMiddleware · Starlette", "platform")]
    x0, w0, inset, step_y, step_b, core_h = 40, 520, 24, 52, 22, 176
    h0 = len(layers) * (step_y + step_b) + core_h
    for i, (label, role) in enumerate(layers):
        x, yy = x0 + i * inset, y + i * step_y
        w, h = w0 - 2 * i * inset, h0 - i * (step_y + step_b)
        c.rect(x, yy, w, h, fill_of(role), COLOR[role], 1.6, 18)
        c.text(x + 18, yy + 33, label, 18, 600, COLOR[role])
    cx, cy = x0 + 6 * inset, y + 6 * step_y
    cw, ch = w0 - 12 * inset, core_h
    c.card(cx, cy, cw, "Router and handler", ["route match, JSON parsed", "get_db, get_current_user",
                                              "field validation → 422", "your code"], "key", min_h=ch, ts=19, bs=16.5)
    rx = x0 + w0 + 30
    rw = W - 40 - rx
    yy = y
    items = [("ServerErrorMiddleware", "unexpected crash → plain 500 {detail, timestamp}; no X-Request-ID or security "
                                       "headers (A-13)", "fail"),
             ("AIBodyLimit", "body over 2 MB → 413 (12 KB for AI JSON); /ai without a token → 401 before reading the "
                             "body; slow AI upload → 408; these replies skip the inner header layers", "server"),
             ("Headers and request id", "nosniff, DENY, Referrer-Policy, Cache-Control: no-store (HSTS in production); "
                                        "echo or create X-Request-ID", "server"),
             ("CORS", "answers browser preflights; not an access control; no effect on the Android app", "server"),
             ("ExceptionMiddleware", "handled errors: 4xx, IntegrityError → 409, validation → 422, rate limit → 429; "
                                     "they pass back out through the header layers", "platform")]
    for t, b, role in items:
        card = c.card(rx, yy, rw, t, b, role, ts=19, bs=16.5, pad=15)
        yy = card.bottom + 14
    c.arrow([(x0 + 26, y - 30), (x0 + 26, y - 4)], "main")
    c.text(x0 + 40, y - 12, "request in", 15.5, 400, MAROON, SERIF, "start", True)
    c.height = max(yy, y + h0) + 36
    return c


@diagram("async-model")
def async_model() -> Canvas:
    c = new("async-model", "How one backend instance runs",
            "Gunicorn starts two Uvicorn worker processes. Each worker has one event loop that interleaves many "
            "requests while they wait on PostgreSQL through an asyncpg pool of 5 plus up to 10 overflow connections, "
            "or on Brevo and Groq over httpx. Argon2 password hashing runs in a worker thread so the loop keeps "
            "serving. The timeline is an illustration, not a measurement.")
    y = c.header("One instance: processes, event loops and waiting",
                 "Async helps while a request waits for the database or the network. CPU-heavy work must leave the loop.")
    y += 6
    pw = (W - 80 - 32 - 20) / 2
    bw = pw - 32
    boxes = [("asyncpg pool", "5 connections + up to 10 overflow; one session per request; 8 s statement timeout", "data"),
             ("Thread pool · anyio.to_thread", "Argon2 at login, register and password changes, so the loop is not blocked", "server"),
             ("This worker's memory", "rate-limit counters: best effort, not shared, reset on restart", "platform")]
    heights = [Canvas.measure(bw, t, b, ts=18, bs=16.5, pad=14) for t, b, _ in boxes]
    tl_h = 60 + 3 * 44 + 34
    panel_h = 52 + tl_h + sum(heights) + 2 * 12 + 18
    mark = len(c.parts)
    lanes = [("Request A", [(0.00, 0.12, "run"), (0.12, 0.52, "wait"), (0.52, 0.64, "run")]),
             ("Request B", [(0.14, 0.24, "run"), (0.24, 0.48, "wait"), (0.64, 0.74, "run")]),
             ("Request C", [(0.26, 0.36, "run"), (0.36, 0.86, "wait"), (0.86, 0.97, "run")])]
    for k in range(2):
        px = 56 + k * (pw + 20)
        py = y + 52
        c.rect(px, py, pw, panel_h, "#FBF6EC", COLOR["server"], 1.4, 14)
        c.text(px + 16, py + 34, f"Uvicorn worker {k + 1}: one event loop", 19, 600, COLOR["server"])
        tx, tw = px + 112, pw - 134
        ty = py + 56
        for li, (name, segs) in enumerate(lanes):
            ly = ty + li * 44
            c.text(px + 16, ly + 24, name, 15.5, 400, INK3, SERIF, "start", True)
            for a, b, kind in segs:
                x1, x2 = tx + a * tw, tx + b * tw
                if kind == "run":
                    c.parts.append(f'<rect x="{x1:.1f}" y="{ly + 7:.1f}" width="{x2 - x1:.1f}" height="24" rx="6" fill="{COLOR["server"]}"/>')
                else:
                    c.parts.append(f'<rect x="{x1:.1f}" y="{ly + 7:.1f}" width="{x2 - x1:.1f}" height="24" rx="6" fill="none" '
                                   f'stroke="{COLOR["server"]}" stroke-width="1.6" stroke-dasharray="5 4"/>')
        c.text(px + 16, ty + 3 * 44 + 20, "solid: Python running · dashed: waiting on I/O", 15, 400, INK3, SERIF, "start", True)
        by = py + 52 + tl_h
        for (t, b, role), h in zip(boxes, heights):
            c.card(px + 16, by, bw, t, b, role, ts=18, bs=16.5, pad=14)
            by += h + 12
    outer_h = 52 + panel_h + 20
    frame(c, mark, 40, y, W - 80, outer_h, "platform", "Render instance · one container · Gunicorn supervises")
    yb = y + outer_h + 70
    half = (W - 80 - 24) / 2
    h1 = c.card(40, yb, half, "PostgreSQL", "up to 30 connections from one instance (2 × 15); a deploy briefly runs "
                                            "old and new instances side by side", "data", bs=17)
    h2 = c.card(40 + half + 24, yb, half, "Brevo and Groq · httpx", "awaited calls with timeouts; AI routes release "
                                                                    "their database session before calling Groq",
                "service", dashed=True, bs=17)
    c.arrow([(h1.cx, y + outer_h + 3), (h1.cx, yb - 5)], "data", both=True)
    c.arrow([(h2.cx, y + outer_h + 3), (h2.cx, yb - 5)], "optional", both=True)
    c.height = max(h1.bottom, h2.bottom) + 36
    return c


@diagram("dependency-graph")
def dependency_graph() -> Canvas:
    c = new("dependency-graph", "FastAPI dependencies used by a protected route",
            "A protected route asks for CurrentUser and DB. get_current_user needs the bearer token and get_db; "
            "FastAPI caches get_db per request, so the user is loaded through the handler's own session. get_db opens "
            "one shared business AsyncSession per request, finishes its remaining transaction at teardown and cannot undo earlier commits. AI routes use a "
            "separate Principal dependency that opens short sessions of its own.")
    y = c.header("What FastAPI builds before your handler runs",
                 "Arrows point from a function to what it needs. FastAPI resolves this graph once per request.")
    y += 8
    route = c.card(40, y, W - 80, "Route · PUT /api/v1/items/{item_id}",
                   "async def update_item(item_id: str, data: ItemUpdate, db: DB, current_user: CurrentUser)",
                   "key", mono=True)
    y2 = route.bottom + 70
    cw = (W - 80 - 2 * 24) / 3
    deps = [("item_id + ItemUpdate", ["path parameter and JSON body", "validated after DB and CurrentUser resolve: "
                                                                       "bad input → 422"], "note", False),
            ("DB", ["Annotated[AsyncSession,", "Depends(get_db)]"], "server", True),
            ("CurrentUser", ["Annotated[User,", "Depends(get_current_user)]"], "server", True)]
    hm = max(Canvas.measure(cw, t, b, mono=m) for t, b, _, m in deps)
    dc = []
    for i, (t, b, role, m) in enumerate(deps):
        card = c.card(40 + i * (cw + 24), y2, cw, t, b, role, mono=m, min_h=hm)
        c.arrow([(card.cx, route.bottom + 3), (card.cx, y2 - 5)], "flow")
        dc.append(card)
    y3 = y2 + hm + 70
    gb = ["creates AsyncSessionLocal(); connection on first SQL", "teardown: commit remaining transaction", "on error: rollback uncommitted work only",
          "always: close"]
    gc = ["decode the JWT (type access)", "SELECT the user (noload)", "session_version, is_active, verification → 401 / 403"]
    hh = max(Canvas.measure(cw, "get_db()", gb, kicker="core/database.py"),
             Canvas.measure(cw, "get_current_user()", gc, kicker="api/deps.py"))
    g1 = c.card(dc[1].x, y3, cw, "get_db()", gb, "server", kicker="core/database.py", min_h=hh)
    g2 = c.card(dc[2].x, y3, cw, "get_current_user()", gc, "server", kicker="api/deps.py", min_h=hh)
    c.arrow([(dc[1].cx, dc[1].bottom + 3), (g1.cx, y3 - 5)], "flow")
    c.arrow([(dc[2].cx, dc[2].bottom + 3), (g2.cx, y3 - 5)], "flow")
    loop_y = g2.bottom + 48
    c.arrow([(g2.x + 60, g2.bottom + 3), (g2.x + 60, loop_y), (g1.cx, loop_y), (g1.cx, g1.bottom + 5)], "main")
    c.text((g1.cx + g2.x + 60) / 2, loop_y + 30, "get_current_user needs get_db too; FastAPI caches it,",
           16, 400, MAROON, SERIF, "middle", True)
    c.text((g1.cx + g2.x + 60) / 2, loop_y + 52, "so both share the request's one session", 16, 400, MAROON, SERIF, "middle", True)
    bearer = c.card(dc[2].x, loop_y + 76, cw, "HTTPBearer(auto_error=False)", "reads Authorization: Bearer <token>; "
                                                                               "missing → 401 from get_current_user",
                    "platform", ts=18, bs=16.5)
    c.arrow([(g2.right - 40, g2.bottom + 3), (g2.right - 40, bearer.y - 5)], "flow")
    ai = c.card(40, bearer.y, cw * 2 + 24 - 0, "AI routes are different",
                ["Principal = Annotated[AIPrincipal, Depends(principal)]: principal() opens its own short session, "
                 "calls get_current_user and returns only the user id.",
                 "reserve() and settle() use short transactions of their own, so no connection is held while waiting "
                 "up to 25 s for Groq."], "service", dashed=True, bs=16.5, min_h=bearer.h)
    c.height = max(ai.bottom, bearer.bottom) + 36
    return c


# =========================================================================== onboarding and environments
@diagram("local-setup")
def local_setup() -> Canvas:
    c = new("local-setup", "Local development set-up",
            "On the laptop, PostgreSQL 16 and the FastAPI server run in the Docker Compose dev stack (or a Python "
            "virtual environment), and Metro serves the JavaScript bundle. The phone reaches Metro and the API over "
            "USB with adb reverse for ports 8081 and 8000, over the local Wi-Fi address, or through an Expo tunnel. "
            "Expo Go runs everything except the voice microphone, which needs an APK with the native module. A "
            "preview APK calls staging, not the laptop, and the development profile also needs expo-dev-client, "
            "which is not installed.")
    y = c.header("Your laptop and your phone during development",
                 "Pick one connection. USB with adb reverse is the most reliable: the phone then reaches the laptop as localhost.")
    y += 8
    mark = len(c.parts)
    inner_y = y + 48
    cw = (W - 80 - 32 - 2 * 18) / 3
    lap = [("API · Docker Compose", ["docker-compose.dev.yml", "uvicorn --reload on port 8000", "runs alembic upgrade head"], "server", False),
           ("PostgreSQL 16", ["postgres:16-alpine", "port 5432, data in a volume", "pgAdmin optional: port 5050"], "data", False),
           ("Metro bundler", ["npm run start:local", "EXPO_PUBLIC_API_URL = http://localhost:8000", "port 8081"], "client", False)]
    hm = max(Canvas.measure(cw, t, b) for t, b, _, _ in lap)
    lc = [c.card(56 + i * (cw + 18), inner_y, cw, t, b, role, min_h=hm) for i, (t, b, role, _) in enumerate(lap)]
    alt = c.card(56, inner_y + hm + 16, W - 112, "Or without Docker",
                 "a Python 3.12 virtual environment running uvicorn app.main:app --reload against your own local PostgreSQL 16",
                 "plain", ts=18, bs=16.5, pad=14)
    lap_h = (alt.bottom - y) + 18
    frame(c, mark, 40, y, W - 80, lap_h, "platform", "Your laptop")
    y = y + lap_h + 30
    cwc = (W - 80 - 2 * 20) / 3
    conns = [("USB + adb reverse", "adb reverse tcp:8081 tcp:8081 and tcp:8000 tcp:8000; the phone uses localhost", "key", False),
             ("Same Wi-Fi", "set EXPO_PUBLIC_API_URL to http://<laptop-IP>:8000", "platform", True),
             ("Expo tunnel", "serves the bundle from anywhere; the API address must still be reachable", "platform", True)]
    hc = max(Canvas.measure(cwc, t, b, ts=19, bs=16.5) for t, b, _, _ in conns)
    cc = []
    for i, (t, b, role, dashed) in enumerate(conns):
        card = c.card(40 + i * (cwc + 20), y + 10, cwc, t, b, role, dashed=dashed, ts=19, bs=16.5, min_h=hc)
        c.arrow([(card.cx, y - 26), (card.cx, card.y - 5)], "main" if i == 0 else "reply", both=True)
        cc.append(card)
    y = y + 10 + hc + 30
    mark = len(c.parts)
    ph = [("Expo Go (SDK 54)", "scan the QR code; every screen and typed assistant questions work", "client", False),
          ("EAS APK", "needed for the voice microphone (native module); a preview APK calls staging, not this laptop; "
                      "the development profile needs expo-dev-client, not installed", "client", True),
          ("Android emulator", "reaches the laptop at 10.0.2.2, for example http://10.0.2.2:8000", "plain", False)]
    hp = max(Canvas.measure(cw, t, b, ts=19, bs=16.5) for t, b, _, _ in ph)
    for i, (t, b, role, dashed) in enumerate(ph):
        c.card(56 + i * (cw + 18), y + 48, cw, t, b, role, dashed=dashed, ts=19, bs=16.5, min_h=hp)
    # Connections and app shells are independent choices, not three paired configurations.
    for card in cc:
        c.arrow([(card.cx, card.bottom + 3), (card.cx, y - 10), (W / 2, y - 10)], "reply", radius=0)
    c.arrow([(W / 2, y - 10), (W / 2, y - 3)], "main", radius=0)
    ph_h = 48 + hp + 18
    frame(c, mark, 40, y, W - 80, ph_h, "client", "Phone or emulator · choose the shell independently of the connection")
    y += ph_h + 26
    n = c.note(40, y, W - 80, "Backend tests drop and recreate every table. Run them only against a separate, disposable "
                             "local database whose name contains “test”, never this one.", "risk", "Tests never use this database")
    c.height = n.bottom + 36
    return c


@diagram("dev-workflow")
def dev_workflow() -> Canvas:
    c = new("dev-workflow", "From a code change to a phone",
            "Create a feature branch and commit; a feature push alone does not trigger this CI workflow. Render can independently auto-deploy its linked branch if enabled. A pull request to main runs CI: "
            "backend tests, mobile tests and advisory scans. The build-apk label adds a preview APK that talks to "
            "staging. Merging can deploy the backend through a configured CI deploy hook or Render "
            "auto-deploy if it is on. A production AAB is built by hand and uploaded to Play internal testing.")
    y = c.header("Your change, from laptop to users",
                 "The left lane is what you do; the right lane is what GitHub, Render and Expo do after you push.")
    f = Flow(c, [("me", "On your laptop", "client"), ("gh", "On GitHub, Render and Expo", "platform")],
             top=y + 4, widths=[46, 54], gap=34)
    f.step("me", "Create a branch", "git switch -c feature/short-name", num="1")
    f.step("me", "Change the code", "backend, mobile or docs", num="2")
    f.step("me", "Run it locally", "the API and Expo on your phone", num="3")
    f.step("me", "Run the tests", "pytest on a disposable database · npm test · tsc · lint", num="4")
    last = f.step("me", "Commit", "small, focused commits", num="5")
    f.y = f.top + 54
    f.prev = None
    g1 = f.step("gh", "Push the branch", "no CI trigger for a feature push; linked Render auto-deploy may still run", num="6",
                role="platform")
    c.arrow([(last.right + 3, last.cy), (last.right + 18, last.cy), (last.right + 18, g1.cy), (g1.x - 5, g1.cy)], "main")
    f.step("gh", "Open a pull request to main", "CI: test-backend and test-frontend; advisory mypy and Trivy", num="7", role="platform")
    f.step("gh", "Optional: label build-apk", "an EAS preview APK that talks to staging", num="8", role="service", dashed=True,
           kind="optional")
    f.step("gh", "Review", "read every job, advisory ones too; the ruleset seen on 7 Oct needs a PR but no checks", num="9",
           role="platform")
    f.step("gh", "Merge to main", "production deploy if auto-deploy or hook configured; migrations run at container start", num="10", role="fail", kind="main")
    f.step("gh", "Release the app", "by hand: eas build --profile production → AAB → Play internal testing", num="11",
           role="client")
    f.note("0007 blocks automatic downgrade below it: test fresh schema and a synthetic 0006 upgrade and follow the release gate "
           "before merging. Mobile changes reach people only through a new build.", "risk", title="Before you merge", after=True)
    c.height = f.finish() + 30
    return c


@diagram("environments")
def environments() -> Canvas:
    c = new("environments", "Three environments",
            "Development uses Expo Go (a development build would first need expo-dev-client), a local API on port "
            "8000 and a local PostgreSQL with development data. Staging uses the preview APK, staging-api.carekosh.com, the staging Render service and the "
            "documented vitaltrack_staging database. Production uses the production AAB through Google Play, "
            "api.carekosh.com, the production Render service and the documented neondb database. The API address is "
            "fixed in each app build; the database and secrets are set on each backend service.")
    y = c.header("Three environments, one codebase",
                 "Same code everywhere. The app build decides which API it calls; each backend service decides which "
                 "database and secrets it uses.")
    cols = [("Development", "your laptop", [
                ("App", "Expo Go via npm run start:local (no voice); a development build needs expo-dev-client",
                 "client"),
                ("API address", "http://localhost:8000 (USB) or http://<laptop-IP>:8000", "platform"),
                ("Backend", "uvicorn --reload, ENVIRONMENT=development", "server"),
                ("Database", "local PostgreSQL 16, development data only; tests use a separate *_test database",
                 "data")]),
            ("Staging", "release candidates", [
                ("App", "Preview APK (EAS profile preview), installed directly", "client"),
                ("API address", "https://staging-api.carekosh.com", "platform"),
                ("Backend", "Render staging service, set up in the dashboard only (not verified)", "server"),
                ("Database", "documented: vitaltrack_staging on Neon, test data only", "data")]),
            ("Production", "real people", [
                ("App", "Production AAB through Google Play, internal testing first", "client"),
                ("API address", "https://api.carekosh.com", "platform"),
                ("Backend", "Render service from render.yaml: branch main, health check /live", "server"),
                ("Database", "documented: neondb on Neon, real data", "data")])]
    gap = 22
    cw = (W - 80 - 2 * gap) / 3
    top = y + 10
    rh = [max(Canvas.measure(cw - 28, t, b, ts=18, bs=16.5, pad=14) for col in cols for t, b, _ in [col[2][i]])
          for i in range(4)]
    total = 76 + sum(rh) + 3 * 36 + 18
    for i, (name, sub, rows) in enumerate(cols):
        x = 40 + i * (cw + gap)
        c.rect(x, top, cw, total, "#FBF6EC", "#D3BF9E", 1.4, 14)
        c.text(x + 16, top + 36, name, 23, 500)
        c.text(x + 16, top + 60, sub, 16, 400, INK3, SERIF, "start", True)
        yy = top + 76
        for j, (t, b, role) in enumerate(rows):
            card = c.card(x + 14, yy, cw - 28, t, b, role, ts=18, bs=16.5, pad=14, min_h=rh[j])
            if j < 3:
                c.arrow([(card.cx, card.bottom + 3), (card.cx, card.bottom + 31)], "flow")
            yy += rh[j] + 36
    y = top + total + 26
    half = (W - 80 - 24) / 2
    n1 = c.note(40, y, half, "Fixed when the app is built: the EAS profile embeds EXPO_PUBLIC_API_URL, and app.config.js "
                              "refuses a preview build aimed elsewhere than staging or a production build aimed elsewhere than "
                              "api.carekosh.com. An empty URL is not refused; the app then falls back to localhost:8000.", "lens", "Build time")
    n2 = c.note(40 + half + 24, y, half, "Set on each backend service: DATABASE_URL, a different SECRET_KEY per "
                                         "environment, FRONTEND_URL, mail, Sentry and AI settings. Live values are not "
                                         "verified here.", "lens", "Run time")
    c.height = max(n1.bottom, n2.bottom) + 36
    return c


@diagram("domains-email")
def domains_email() -> Canvas:
    c = new("domains-email", "Domains, TLS and email links",
            "As documented (live DNS, proxy and certificate settings are not verified here): Cloudflare serves DNS for "
            "carekosh.com; api.carekosh.com and staging-api.carekosh.com point to Render, which terminates TLS and "
            "forwards to the FastAPI service. Emails go out through the Brevo HTTP API; their links use FRONTEND_URL, "
            "so the verification, password-reset and account-deletion pages open on the API host itself.")
    y = c.header("Domains, TLS and email links",
                 "The app only knows a hostname. DNS decides which server answers, and the API also serves the pages "
                 "behind email links.")
    f = Flow(c, [("req", "An API request", "client"), ("mail", "An email link", "service")], top=y + 4, widths=[50, 50], gap=36)
    a = [f.step("req", "CareKosh app", "calls https://api.carekosh.com/api/v1/… (staging builds: staging-api.carekosh.com)",
                num="1", role="client")]
    a.append(f.step("req", "DNS at Cloudflare", "documented: the carekosh.com zone points the API hostnames at Render; "
                                                "live records and proxy mode not verified", num="2", role="platform"))
    a.append(f.step("req", "Render edge", "a Render-managed TLS certificate for the custom domain; forwards to the service",
                    num="3", role="platform"))
    api = f.step("req", "FastAPI service", "Gunicorn + 2 Uvicorn workers serving /api/v1", num="4", role="server")
    f.prev = None
    f.y = f.top + 54
    e1 = f.step("mail", "The API sends an email", "only if MAIL_PASSWORD is set; sender MAIL_FROM", num="1", role="server")
    f.step("mail", "Brevo HTTP API", "api.brevo.com/v3/smtp/email; MAIL_PASSWORD is the API key", num="2", role="service",
           dashed=True, kind="optional")
    f.step("mail", "The person's inbox", "a verification, password-reset or deletion email", num="3", role="plain")
    link = f.step("mail", "The link opens on the API", ["FRONTEND_URL + /verify-email?token=…",
                                                        "or /reset-password?token=…", "or /confirm-delete/{token}",
                                                        "served by the same FastAPI service"],
                  num="4", role="server")
    gx = (api.right + link.x) / 2
    c.arrow([(link.x - 3, link.y + 40), (gx, link.y + 40), (gx, api.y + 40), (api.right + 5, api.y + 40)], "reply")
    f.note("render.yaml sets FRONTEND_URL to https://api.carekosh.com/api/v1/auth for production (the live value is not "
           "verified). Moving to another host means repointing DNS; installed apps keep working because the hostname "
           "stays the same.", "lens", title="Good to know", after=True)
    c.height = f.finish() + 30
    return c


@diagram("release-gate")
def release_gate() -> Canvas:
    c = new("release-gate", "The release gate for migrations 0007–0010",
            "Merging the feature branch to main would run migrations 0007 to 0010 at the next container start. 0007 "
            "cannot be downgraded, and old instances using COUNT-based order numbers must never write beside the new "
            "counter. The gate: control both deploy triggers, test fresh setup and a populated synthetic 0006 upgrade, stage without discarding shared data, back up and rehearse a restore, "
            "block new writes and drain old writers, deploy and verify, re-seed the counter only if writes could not be paused, "
            "check logs, monitor, then re-enable auto-deploy.")
    y = c.header("The release gate for migrations 0007–0010",
                 "Why a plain merge is unsafe, and the order of steps that makes the release safe.")
    y += 6
    why = c.note(40, y, W - 80, "A configured trigger can deploy a merge; container start runs 0007–0010. 0007 refuses to "
                               "downgrade, so an older image cannot undo it. During a zero-downtime deploy old and new "
                               "instances overlap, and the old COUNT-based order numbers can collide with the new counter.",
                 "risk", "Why a plain merge is unsafe")
    # Three phases side by side, each read top to bottom; the chevrons between the headings give the order.
    f = Flow(c, [("prep", "1 · Prepare", "platform"), ("go", "2 · Release", "fail"), ("after", "3 · After", "server")],
             top=why.bottom + 26, widths=[34, 33, 33], gap=30, gutter=44)
    for left, right in (("prep", "go"), ("go", "after")):
        lx, lw, _, _ = f.lane[left]
        rx, _, _, _ = f.lane[right]
        c.arrow([(lx + lw + 8, f.top + 25), (rx - 9, f.top + 25)], "main", radius=0)
    f.step("prep", "Freeze and record", "control auto-deploy AND CI hook; record deployed commits and actual revisions", num="1")
    f.step("prep", "Stage the candidate", "test fresh schema and synthetic 0006 upgrade; E2E, retries and assistant on staging", num="2")
    f.step("prep", "Back up", "production backup or restore point; rehearse the restore elsewhere", num="3")
    f.prev = None
    f.y = f.top + 54
    f.step("go", "Cut over, writes paused", "block new writes, drain requests, stop old writers; 0010 SHARE-locks "
                                            "orders while it builds its index", num="4", kind="main")
    f.step("go", "Deploy and verify", "Render's commit; alembic current = 0010_order_local_id_unique; /live and /health", num="5")
    f.step("go", "Only if writes could not pause", "run the idempotent counter re-seed SQL (safe to repeat)", num="6",
           dashed=True, kind="optional")
    f.prev = None
    f.y = f.top + 54
    f.step("after", "Check logs and privacy", "real logs with synthetic tokens; nothing secret printed", num="7")
    f.step("after", "Monitor", "order-create errors, 401 and 403 spikes, lock waits", num="8")
    f.step("after", "Re-enable auto-deploy", "only after the checks pass", num="9")
    f.note("Rolling back the image does not roll back the database. 0007 refuses an automatic downgrade; prefer a reviewed "
           "forward fix. Restoring a backup loses writes made after it.", "key", after=True)
    c.height = f.finish() + 30
    return c


def build(names: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in names:
        canvas = REGISTRY[name]()
        (OUT / f"{name}.svg").write_text(canvas.render(), encoding="utf-8")
        print(f"wrote diagrams/{name}.svg  {canvas.width}×{int(canvas.height)}")


if __name__ == "__main__":
    build(sys.argv[1:] or list(REGISTRY))
