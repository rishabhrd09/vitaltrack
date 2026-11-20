"""New diagrams for the interview books, drawn with the reviewed system-design toolkit (paperkit).

Same colour meanings as every CareKosh diagram: olive phone, slate backend, ochre data, plum outside
services, brick failures, taupe platform, maroon main path. A dashed outline means "only when configured".
Facts were checked against the code at a14b623 (21 November 2026).
"""

from __future__ import annotations

from paperkit import COLOR, INK2, INK3, MAROON, MONO, SERIF, Canvas, Card, Flow, fill_of  # noqa: F401

W = 1000
REGISTRY: dict = {}


def diagram(name: str):
    def register(fn):
        REGISTRY[name] = fn
        return fn
    return register


def render(name: str) -> str:
    return REGISTRY[name]().render()


def new(name: str, title: str, desc: str) -> Canvas:
    return Canvas(name, W, title, desc)


def under(c: Canvas, mark: int) -> None:
    c.parts.insert(mark, c.parts.pop())


def frame(c: Canvas, mark: int, x: float, y: float, w: float, h: float, role: str, label: str, dashed: bool = False) -> None:
    c.rect(x, y, w, h, fill_of(role), COLOR[role], 1.2, 16, "7 6" if dashed else None)
    under(c, mark)
    c.kicker(x + 16, y + 30, label, COLOR[role], 13)


def row(c: Canvas, x: float, y: float, total: float, items, role: str, gap: float = 18, dashed: bool = False,
        ts: float = 21, bs: float = 18, pad: float = 18) -> list[Card]:
    n = len(items)
    cw = (total - gap * (n - 1)) / n
    h = max(Canvas.measure(cw, t, b, ts=ts, bs=bs, pad=pad) for t, b in items)
    return [c.card(x + i * (cw + gap), y, cw, t, b, role, dashed=dashed, min_h=h, ts=ts, bs=bs, pad=pad)
            for i, (t, b) in enumerate(items)]


# =========================================================================== book 1
@diagram("frontend-layers")
def frontend_layers() -> Canvas:
    c = new("frontend-layers", "Inside the phone app",
            "Screens are Expo Router files under app/. They read server data through TanStack Query hooks and write "
            "through mutation hooks. Hooks call service modules, which all use one API client in services/api.ts. "
            "The client adds the bearer token, shares one refresh call, enforces a 90-second deadline and maps errors. "
            "Tokens live in SecureStore; the query cache is persisted to AsyncStorage without auth queries; Zustand "
            "holds auth and UI state. The Android-only native module handles recording and on-device recognition.")
    y = c.header("Inside the phone app", "Each layer only talks to the one below it. The server stays the source of truth.")
    lx, lw = 40, 590
    sx, sw = lx + lw + 30, W - 40 - (lx + lw + 30)
    layers = [
        ("Screens · app/ (Expo Router)", ["(auth): login, register, verify-email-pending, forgot and reset password",
                                          "(tabs): dashboard, inventory, orders · item/[id] · order/create · builder · search · profile · assistant"]),
        ("Hooks · hooks/", ["useServerData: useItems, useCategories, useOrders, useStats, useActivities",
                            "useServerMutations: create, update, stock, delete; invalidate after success"]),
        ("Services · services/", ["items, categories, orders, auth, assistant: one function per API call"]),
        ("API client · services/api.ts", ["base URL from EXPO_PUBLIC_API_URL + /api/v1",
                                          "Bearer token; on 401 one shared refresh, then one retry",
                                          "90 s overall deadline; error shapes mapped to messages"]),
    ]
    cards = []
    yy = y + 6
    for t, b in layers:
        card = c.card(lx, yy, lw, t, b, "client", ts=20, bs=16.5, pad=16)
        if cards:
            c.arrow([(lx + lw / 2, cards[-1].bottom + 2), (lx + lw / 2, card.y - 4)], "flow")
        cards.append(card)
        yy = card.bottom + 34
    api = c.card(lx, yy + 30, lw, "CareKosh API over HTTPS", ["JSON in and out; camelCase business fields"], "server",
                 ts=20, bs=16.5, pad=16)
    c.arrow([(lx + lw / 2, cards[-1].bottom + 2), (lx + lw / 2, api.y - 4)], "main", "fetch", label_dx=12,
            label_anchor="start", label_dy=8, both=True)
    c.kicker(sx, y + 4, "State and storage on the phone", COLOR["data"], 12.5)
    store = [
        ("SecureStore", ["access and refresh tokens (keys vitaltrack_access_token, vitaltrack_refresh_token)"]),
        ("TanStack Query", ["in-memory server data; staleTime 30 s; copied to AsyncStorage (auth queries excluded); cleared at login and logout"]),
        ("Zustand stores", ["useAuthStore: user + isAuthenticated, persisted through SecureStore", "useAppStore: UI state"]),
        ("Native module", ["modules/carekosh-voice (Android): AudioRecord and Moonshine recognition"]),
    ]
    yy = y + 18
    for t, b in store:
        card = c.card(sx, yy, sw, t, b, "data" if t != "Native module" else "client", ts=19, bs=15.5, pad=14)
        yy = card.bottom + 14
    c.height = max(api.bottom, yy) + 36
    return c


@diagram("event-loop")
def event_loop() -> Canvas:
    c = new("event-loop", "One instance: processes, event loops and threads",
            "A Render instance runs one container. Gunicorn supervises two Uvicorn worker processes. Each worker has "
            "one asyncio event loop that interleaves many requests at their await points, a database pool of 5 plus 10 "
            "overflow connections, and a thread pool used for Argon2 hashing so the loop is not blocked. Outbound calls "
            "use httpx with timeouts. Separate processes share nothing in memory; PostgreSQL stores business data; Redis shares hosted rate-limit counters.")
    y = c.header("One instance: processes, event loops and threads",
                 "Async helps while a request waits for the database or the network. CPU-heavy work must leave the loop.")
    mark0 = len(c.parts)
    top = y
    ww = (W - 80 - 32 - 18) / 2
    bottoms = []
    for i in range(2):
        x = 56 + i * (ww + 18)
        mark = len(c.parts)
        a = c.card(x + 14, top + 96, ww - 28, "Event loop", ["request A awaits PostgreSQL; meanwhile the loop runs request B; A resumes when its rows arrive"],
                   "server", ts=19, bs=16, pad=14)
        b = c.card(x + 14, a.bottom + 12, ww - 28, "asyncpg pool", ["5 connections + up to 10 overflow; 8 s statement timeout"],
                   "data", ts=19, bs=16, pad=14)
        t = c.card(x + 14, b.bottom + 12, ww - 28, "Thread pool", ["anyio.to_thread runs Argon2 hashing and verification"],
                   "server", ts=19, bs=16, pad=14)
        frame(c, mark, x, top + 48, ww, t.bottom + 16 - (top + 48), "server", f"Uvicorn worker {i + 1} · own process")
        bottoms.append(t.bottom + 16)
    inst_h = max(bottoms) + 18 - top
    frame(c, mark0, 40, top, W - 80, inst_h, "platform", "Render instance · one container · Gunicorn supervises")
    y = top + inst_h + 70
    db = c.card(40, y, 560, "PostgreSQL", ["shared business data; Redis holds hosted quota counters",
                                           "up to 2 × 15 = 30 connections from one instance"], "data", ts=20, bs=16.5, pad=16)
    out = c.card(626, y, W - 40 - 626, "Outside calls", ["Brevo email and optional AI providers"], "service",
                 dashed=True, ts=20, bs=16.5, pad=16)
    c.arrow([(320, top + inst_h + 3), (320, y - 4)], "data", both=True)
    c.arrow([(out.cx, top + inst_h + 3), (out.cx, y - 4)], "optional")
    c.height = max(db.bottom, out.bottom) + 30
    return c


@diagram("session-transaction")
def session_transaction() -> Canvas:
    c = new("session-transaction", "One request: session, connection, transactions",
            "get_db opens an AsyncSession without a connection. The first SQL, the user lookup in get_current_user, "
            "checks out a pooled connection and begins a transaction. The handler's UPDATE runs in that transaction and "
            "the handler commits, which ends it and returns the connection. db.refresh starts a new transaction. After the "
            "response is built, get_db commits that read and closes the session. An error before a commit rolls back; an "
            "error after a commit cannot undo it.")
    y = c.header("One request: session, connection, transactions",
                 "A session is a unit of work that can span several transactions. Example: PUT /api/v1/items/{id}.")
    f = Flow(c, [("code", "Your code", "server"), ("sess", "AsyncSession (get_db)", "server"), ("pg", "PostgreSQL", "data")],
             top=y + 4, widths=[34, 33, 33])
    f.step("sess", "Session created", "AsyncSessionLocal(); no connection yet", num="1", ts=19, bs=16)
    f.step("code", "get_current_user", "SELECT users … noload('*')", num="2", ts=19, bs=16)
    f.step("pg", "Connection checked out", "the first SQL begins transaction 1 (autobegin)", num="3", ts=19, bs=16)
    f.step("code", "Handler writes", "name lock, SELECT item, UPDATE … WHERE version = :v, activity and audit rows", num="4", ts=19, bs=16)
    f.step("pg", "await db.commit()", "transaction 1 commits; the connection goes back to the pool", num="5", role="data", ts=19, bs=16)
    f.step("code", "db.refresh(item)", "new SQL → transaction 2 begins on a pooled connection", num="6", ts=19, bs=16)
    f.step("sess", "get_db teardown", "the function-scoped DB dependency exits before the response is sent: commit (nothing left to write), then close", num="7", ts=19, bs=16)
    f.divider("When something fails")
    f.step(["code", "sess"], "Error before step 5", "get_db catches it, rolls back transaction 1: nothing from this request is stored", num="!", role="fail", link="none", ts=19, bs=16)
    f.step(["sess", "pg"], "Error after step 5", "the commit stands; rollback only affects transaction 2. A missing reply does not prove nothing was saved", num="!", role="fail", link="none", ts=19, bs=16)
    c.height = f.finish() + 30
    return c


@diagram("migration-chain")
def migration_chain() -> Canvas:
    c = new("migration-chain", "The database migration chain", "Thirteen revisions on main. Revision 0007 has a one-way downgrade boundary.")
    y = c.header("Thirteen migrations on main", "Read downward. Alembic applies each missing revision before the API starts.")
    steps = [
        ("0001_initial", "users, refresh_tokens, categories, items, orders, order_items, activity_logs", "main"),
        ("0002_add_username", "login with email or username", "main"),
        ("0003_email_verification", "verification flag, token digest and expiry", "main"),
        ("0004_version_audit_log", "items.version, audit_log (JSONB), quantity ≥ 0", "main"),
        ("0005_account_deletion_token", "deletion token digest and 24 h expiry", "main"),
        ("0006_order_item_qty_positive", "order line quantity > 0", "main"),
        ("0007_session_order_safety", "users.session_version, order_number_counters, token-digest indexes · downgrade raises", "one-way"),
        ("0008_ai_consent_usage", "ai_consents, ai_usage", "main"),
        ("0009_ai_provider_scopes", "consent scopes and provider column", "main"),
        ("0010_order_local_id_unique", "unique (user_id, local_id) for new orders; legacy duplicates kept", "main"),
        ("0011_sarvam_personal_keys", "ai_sarvam_credentials (ciphertext), credential source", "main"),
        ("0012_openai_personal_keys", "encrypted personal OpenAI credentials", "main"),
        ("0013_supply_reviews", "review runs, proposals, confirmations, stock revisions and closed submissions", "main"),
    ]
    yy = y + 10
    prev = None
    for name, body, kind in steps:
        role = "data" if kind == "main" else ("fail" if kind == "one-way" else "server")
        card = c.card(110, yy, W - 150, name, body, role, mono=False, ts=18.5, bs=16, pad=12)
        c.text(70, yy + 30, name[:4], 22, 500, MAROON, SERIF, "middle")
        if prev:
            c.arrow([(70, prev.bottom - 8), (70, yy + 8)], "flow")
        prev = card
        yy = card.bottom + 12
    c.text(110, yy + 26, "Ochre: applied in order · brick: the one-way step", 16, 400, INK3, SERIF, italic=True)
    c.height = yy + 50
    return c


@diagram("ai-guard")
def ai_guard() -> Canvas:
    c = new("ai-guard", "One cloud AI request",
            "Every /api/v1/ai route is refused without a bearer token before the body is read, and bodies are capped. "
            "principal() authenticates in its own short session. reserve() takes a short transaction with a lock "
            "timeout and a global advisory lock, re-checks consent and scope, daily budgets, request counts and "
            "concurrency, and inserts a reserved ai_usage row. The provider call runs with no database connection held "
            "and is cancelled if the phone disconnects. settle() records success at an estimated cost or failure at the "
            "full reservation.")
    y = c.header("One cloud AI request", "Checks first, a short reservation, the provider call with no database connection held, then settlement.")
    f = Flow(c, [("phone", "Phone", "client"), ("api", "API", "server"), ("db", "PostgreSQL", "data"), ("prov", "Groq / Sarvam", "service")],
             top=y + 4, widths=[24, 30, 26, 20])
    f.step("phone", "POST /ai/interpret", "Bearer token; JSON question (≤ 12 KB)", num="1", ts=19, bs=16)
    f.step("api", "AIBodyLimit", "no bearer → 401 before reading; too big → 413; slow upload → 408", num="2", ts=19, bs=16)
    f.step("api", "principal()", "own short session → get_current_user; rate key = the account", num="3", ts=19, bs=16)
    f.step("db", "reserve()", "lock_timeout, global advisory lock; consent + scope; budgets, daily counts, concurrency; INSERT ai_usage 'reserved'; COMMIT", num="4", ts=19, bs=16)
    f.step("prov", "Provider call", "strict JSON intent, transcript or WAV; timeout; cancelled if the phone leaves", num="5", dashed=True, ts=19, bs=16)
    f.step("db", "settle()", "success: estimated cost (never above the reservation); failure: keeps the reservation", num="6", ts=19, bs=16)
    f.step("phone", "Answer", "validated result; inventory is never changed by these routes", num="7", kind="reply", ts=19, bs=16)
    f.note("Refusals: 503 feature off or not reviewed · 403 no consent for this scope · 429 budget, allowance or busy, with Retry-After · 499 the phone closed the request.",
           "risk", title="Typical refusals", after=True)
    c.height = f.finish() + 30
    return c


@diagram("container-start")
def container_start() -> Canvas:
    c = new("container-start", "From Dockerfile to a serving container",
            "The builder stage installs build tools and the Python dependencies into a virtual environment. The "
            "production stage starts again from python:3.12-slim, installs only runtime packages, creates a non-root "
            "user, copies the virtual environment and the code, and declares a health check on /live. At start the "
            "entrypoint finds the database host, waits for pg_isready, runs alembic upgrade head and stops on failure, "
            "then execs Gunicorn so it receives signals directly.")
    y = c.header("From Dockerfile to a serving container", "Build once, start many times. Every start runs the migrations before it serves.")
    f = Flow(c, [("build", "docker build · once per deploy", "platform"), ("start", "Container start · docker-entrypoint.sh", "server")],
             top=y + 4, widths=[50, 50], stagger=0)
    f.step("build", "Builder stage", "python:3.12-slim + build-essential, libpq-dev; python -m venv /opt/venv; pip install -r requirements.txt", num="1", ts=19, bs=16)
    f.step("build", "Production stage", "fresh python:3.12-slim + libpq5, curl, postgresql-client, ffmpeg; no compilers", num="2", ts=19, bs=16)
    f.step("build", "Least privilege", "appuser (uid 1000) owns the code; USER appuser", num="3", ts=19, bs=16)
    f.step("build", "Copy and configure", "COPY --from=builder /opt/venv; PYTHONUNBUFFERED, PYTHONDONTWRITEBYTECODE, ENVIRONMENT=production", num="4", ts=19, bs=16)
    f.step("build", "Contract", "HEALTHCHECK curl /live · ENTRYPOINT the script · CMD gunicorn with 2 CareKoshUvicornWorker processes", num="5", ts=19, bs=16)
    f.prev = None
    f.prev_lanes = []
    f.step("start", "Find the database", "host and port parsed from DATABASE_URL when DATABASE_HOST is unset", num="6", link="none", ts=19, bs=16)
    f.step("start", "Wait for it", "pg_isready up to 30 times, 2 s apart; then continue anyway", num="7", ts=19, bs=16)
    f.step("start", "alembic upgrade head", "on failure: exit 1, so the deploy fails instead of serving a mismatched schema", num="8", role="data", ts=19, bs=16)
    f.step("start", "exec gunicorn", "--bind 0.0.0.0:$PORT; exec replaces the shell, so Gunicorn receives Render's SIGTERM directly", num="9", ts=19, bs=16)
    c.height = f.finish() + 30
    return c


# =========================================================================== book 3
@diagram("crypto-primitives")
def crypto_primitives() -> Canvas:
    c = new("crypto-primitives", "Five tools that people mix up",
            "Encoding changes representation and anyone can reverse it. A fast hash is one-way and suits long random "
            "tokens. A password hash is one-way, salted, slow and memory-hard. Encryption is reversible with a key. A "
            "MAC or signature proves integrity and origin. CareKosh uses base64url inside JWTs, SHA-256 for one-time "
            "token digests, Argon2id for passwords, Fernet for personal Sarvam keys and TLS in transit, and HMAC-SHA256 "
            "to sign JWTs.")
    y = c.header("Five tools that people mix up", "Ask two questions: can it be reversed, and who needs a key?")
    items = [
        ("Encoding", "fail", [("Reverse?", "yes, by anyone"), ("Key?", "none"), ("Here", "base64url header and payload of every JWT")]),
        ("Fast hash", "data", [("Reverse?", "no"), ("Key?", "none"), ("Here", "SHA-256 digests of verify, reset and delete tokens")]),
        ("Password hash", "data", [("Reverse?", "no; guesses cost time and memory"), ("Key?", "none; a random salt per hash"), ("Here", "Argon2id in users.hashed_password")]),
        ("Encryption", "service", [("Reverse?", "yes, with the key"), ("Key?", "secret key"), ("Here", "Fernet for personal Sarvam keys; TLS on the wire")]),
        ("MAC / signature", "server", [("Reverse?", "nothing to reverse"), ("Key?", "secret (HMAC) or private key"), ("Here", "HS256 = HMAC-SHA256 over each JWT")]),
    ]
    cw = (W - 80 - 2 * 18) / 3
    hmax = max(Canvas.measure(cw, t, kv=kv, bs=16.5, kv_label=86) for t, _, kv in items)
    for i, (t, role, kv) in enumerate(items):
        col, line = i % 3, i // 3
        c.card(40 + col * (cw + 18), y + 8 + line * (hmax + 18), cw, t, role=role, kv=kv, bs=16.5, kv_label=86, min_h=hmax)
    note_y = y + 8 + 2 * (hmax + 18)
    c.note(40 + 2 * (cw + 18) + 4, y + 8 + hmax + 18 + 6, cw - 4,
           "Passwords are hashed, never encrypted. JWTs are signed, not encrypted: anyone holding one can read its claims.",
           "key", title="Remember")
    c.height = note_y + 10
    return c


@diagram("session-key-meanings")
def session_key_meanings() -> Canvas:
    c = new("session-key-meanings", "Three things called a session key",
            "A TLS session key is negotiated per connection between the phone and the TLS terminator and never reaches "
            "the application. SECRET_KEY is a long-lived server secret that signs every JWT with HMAC-SHA256; it is not "
            "a session key. The application's session is a refresh_tokens row identified by the jti claim, plus the "
            "user's session_version generation number.")
    y = c.header("Three things called a session key", "Name which one you mean. PostgreSQL records refresh state. Browsers transport their refresh token in a cookie.")
    items = [
        ("TLS session keys", "platform", [("Layer", "transport (HTTPS)"), ("Made by", "the TLS handshake, per connection"),
                                          ("Lives", "client and Cloudflare edge"), ("App sees", "never")]),
        ("SECRET_KEY", "server", [("Layer", "application"), ("Made by", "the operator; env variable"),
                                  ("Lives", "server memory only"), ("Used for", "HS256 signing of every access and refresh token")]),
        ("The app session", "data", [("Layer", "application data"), ("Made by", "login, register, refresh"),
                                     ("Lives", "refresh_tokens row (jti) + users.session_version"),
                                     ("Ends", "logout revokes one row; password change or reset ends all")]),
    ]
    cw = (W - 80 - 2 * 18) / 3
    hmax = max(Canvas.measure(cw, t, kv=kv, bs=16.5, kv_label=82) for t, _, kv in items)
    for i, (t, role, kv) in enumerate(items):
        c.card(40 + i * (cw + 18), y + 8, cw, t, role=role, kv=kv, bs=16.5, kv_label=82, min_h=hmax)
    c.height = y + 8 + hmax + 34
    return c


def auth_flow(name: str, title: str, subtitle: str, desc: str, lanes, widths) -> tuple[Canvas, Flow]:
    c = new(name, title, desc)
    y = c.header(title, subtitle)
    return c, Flow(c, lanes, top=y + 4, widths=widths)


PHONE = ("phone", "Phone", "client")
API = ("api", "API", "server")
DB = ("db", "PostgreSQL", "data")
MAIL = ("mail", "Email · browser", "service")
PHONE_MAIL = ("phone", "Phone · email · browser", "client")


@diagram("flow-register")
def flow_register() -> Canvas:
    c, f = auth_flow("flow-register", "Registration", "One request creates the account; the email arrives after the reply.",
                     "The register screen posts name, email, optional username and password. The API applies a "
                     "rate limit and Pydantic validation, checks that the email and username are free, makes a random "
                     "verification token and stores only its SHA-256 digest, hashes the password with Argon2id in a worker "
                     "thread, inserts the user, a refresh-token row and an activity row, commits and replies 201 with tokens. "
                     "A background task then sends the verification email through Brevo if mail is configured. The app "
                     "discards the tokens and shows the verify-email-pending screen.",
                     [PHONE, API, DB, MAIL], [26, 29, 25, 20])
    f.step("phone", "POST /auth/register", "name, email, optional username, password", num="1", ts=19, bs=16)
    f.step("api", "Limit and validate", "3 per hour per IP; EmailStr; password 8–128 with upper, lower, digit → else 422", num="2", ts=19, bs=16)
    f.step("db", "Is it free?", "SELECT by email, then username → 400 'Email already registered' or 'Username already taken'", num="3", ts=19, bs=16)
    f.step("api", "Make secrets", "token_urlsafe(32) → keep only its SHA-256 digest (24 h expiry); Argon2id hash in a worker thread", num="4", ts=19, bs=16)
    f.step("db", "INSERT and COMMIT", "users · refresh_tokens (jti) · activity_logs user_register", num="5", ts=19, bs=16)
    f.step("phone", "201 AuthResponse", "tokens + user; the app clears the tokens and shows 'check your email'", num="6", kind="reply", ts=19, bs=16)
    f.step("api", "Background task", "after the reply, only if mail is configured: send_verification_email", num="7", link="none", ts=19, bs=16)
    f.step("mail", "Email arrives", "Brevo delivers the link with the raw token", num="8", dashed=True, kind="optional", ts=19, bs=16)
    c.height = f.finish() + 30
    return c


@diagram("flow-verify")
def flow_verify() -> Canvas:
    c, f = auth_flow("flow-verify", "Email verification", "The link carries the raw token; the database only ever held its digest.",
                     "The email links to FRONTEND_URL/verify-email?token=…, which in production is the API's own HTML page. "
                     "The API hashes the token and runs one conditional UPDATE that matches the digest and an unexpired "
                     "time, sets is_email_verified and clears the token. One row means success; zero rows means an invalid or "
                     "expired link. Resend replaces the digest and answers the same way whether or not the account exists.",
                     [PHONE_MAIL, API, DB], [32, 34, 34])
    f.step("phone", "Open the link", "FRONTEND_URL/verify-email?token=… · production: api.carekosh.com/api/v1/auth", num="1", ts=19, bs=16)
    f.step("api", "GET /auth/verify-email", "an HTML page served by FastAPI; compute sha256(token)", num="2", ts=19, bs=16)
    f.step("db", "One conditional UPDATE", "SET is_email_verified = true, token = NULL WHERE digest matches AND expiry > now() RETURNING id", num="3", ts=19, bs=16)
    f.step("phone", "Result page", "1 row → 'Email verified'; 0 rows → 400 'invalid or has expired'", num="4", kind="reply", ts=19, bs=16)
    f.step("phone", "Log in", "now accepted: the policy check passes", num="5", ts=19, bs=16)
    f.divider("Resend")
    f.step("phone", "POST /auth/resend-verification", "3 per hour per IP", num="6", ts=19, bs=16)
    f.step("api", "Same reply for everyone", "503 if mail is off; otherwise one generic message whether or not the account exists", num="7", ts=19, bs=16)
    f.step("db", "Replace the digest", "new token and expiry; the old link stops matching; email sent in the background", num="8", ts=19, bs=16)
    f.note("Where verification is enforced: login (403 EMAIL_NOT_VERIFIED), refresh, and every protected route through get_current_user. "
           "Only when REQUIRE_EMAIL_VERIFICATION is true and mail is configured, and only for accounts that have an email.",
           "lens", title="Policy", after=True)
    c.height = f.finish() + 30
    return c


@diagram("flow-login")
def flow_login() -> Canvas:
    c, f = auth_flow("flow-login", "Login", "Prove the password once, then carry two signed tokens.",
                     "The login screen posts an identifier and a password. The API lowercases the identifier, looks it up as "
                     "an email if it contains @ and as a username otherwise, and locks the row. Argon2 verification runs in a "
                     "worker thread. A wrong password or unknown account gets the same 401. A disabled account gets 403, an "
                     "unverified email 403 when the policy applies. Success creates an access token and a refresh token, "
                     "stores a refresh-token row, updates last_login and logs the activity in one commit.",
                     [PHONE, API, DB], [30, 38, 32])
    f.step("phone", "POST /auth/login", "identifier (email or username) + password", num="1", ts=19, bs=16)
    f.step("api", "Limit and normalise", "5 per minute per IP; identifier lowercased; '@' → email, else username", num="2", ts=19, bs=16)
    f.step("db", "SELECT … FOR UPDATE", "one user row, locked for this transaction", num="3", ts=19, bs=16)
    f.step("api", "Check the password", "Argon2 verify in a worker thread → 401 same message for unknown user or wrong password; 403 disabled; 403 EMAIL_NOT_VERIFIED", num="4", ts=19, bs=16)
    f.step("api", "Mint two tokens", "access: sub, iat, exp (30 min), type, session_version · refresh: + jti, 30 days", num="5", ts=19, bs=16)
    f.step("db", "Record and COMMIT", "INSERT refresh_tokens (jti, expiry, user agent, IP); last_login; activity user_login", num="6", ts=19, bs=16)
    f.step("phone", "200 AuthResponse", "tokens → SecureStore; user → Zustand; old query cache cleared; go to the tabs", num="7", kind="reply", ts=19, bs=16)
    c.height = f.finish() + 30
    return c


@diagram("flow-request")
def flow_request() -> Canvas:
    c, f = auth_flow("flow-request", "What happens during a session", "Every protected request proves itself again: signature first, then the database.",
                     "The API client reads the access token from SecureStore and sends it as a bearer token. Middleware caps the "
                     "body and adds headers. HTTPBearer reads the header; decode_token verifies the HS256 signature and expiry; "
                     "the token type must be access. get_current_user loads the user and compares session_version, checks "
                     "is_active and the verification policy. The handler then filters every query by the user's id, so another "
                     "person's row is simply not found.",
                     [PHONE, ("mw", "Middleware", "server"), ("deps", "Dependencies", "server"), ("h", "Handler + PostgreSQL", "data")],
                     [22, 24, 28, 26])
    f.step("phone", "Bearer token", "services/api.ts reads SecureStore and adds Authorization", num="1", ts=19, bs=16)
    f.step("mw", "Outer layers", "body cap, request id, security headers on the way out, CORS for browsers", num="2", ts=19, bs=16)
    f.step("deps", "HTTPBearer", "no header → 401 Not authenticated", num="3", ts=19, bs=16)
    f.step("deps", "decode_token", "HS256 signature and exp checked; type must be 'access' → else 401", num="4", ts=19, bs=16)
    f.step("h", "SELECT the user", "noload('*'); missing or session_version differs → 401; inactive → 403; unverified with policy → 403", num="5", ts=19, bs=16)
    f.step("h", "Owner-scoped query", "WHERE user_id = current_user.id; someone else's id → 404", num="6", ts=19, bs=16)
    f.step("phone", "Response", "headers added on the way out; 401 starts the refresh flow", num="7", kind="reply", ts=19, bs=16)
    c.height = f.finish() + 30
    return c


@diagram("flow-refresh")
def flow_refresh() -> Canvas:
    c, f = auth_flow("flow-refresh", "Expiry and refresh", "A refresh token works exactly once: using it rotates the pair.",
                     "When a call returns 401 the phone first reuses a newer access token if another request already refreshed, "
                     "otherwise it starts one shared refresh for every waiting call. The API decodes the refresh token, locks the "
                     "user row, checks session_version and the policy, and claims the token with a conditional UPDATE that only "
                     "succeeds if it is not revoked and not expired. It then issues and stores a new pair. A second use of the "
                     "same token finds nothing to claim and gets 401. The phone deletes tokens only on 401 or 403 from refresh.",
                     [PHONE, API, DB], [32, 34, 34])
    f.step("phone", "A call gets 401", "access token expired (default 30 min)", num="1", role="fail", ts=19, bs=16)
    f.step("phone", "One shared refresh", "use a newer stored token if there is one; otherwise every waiting call shares one promise", num="2", ts=19, bs=16)
    f.step("api", "POST /auth/refresh", "body: refresh_token; decode; type 'refresh' and a jti → else 401", num="3", ts=19, bs=16)
    f.step("db", "Lock the user", "SELECT … FOR UPDATE; session_version equal; active; verification policy", num="4", ts=19, bs=16)
    f.step("db", "Claim it once", "UPDATE refresh_tokens SET is_revoked = true WHERE jti, user, not revoked, not expired RETURNING id → none: 401", num="5", ts=19, bs=16)
    f.step("api", "New pair", "new jti, new 30-day expiry; INSERT the new row; COMMIT", num="6", ts=19, bs=16)
    f.step("phone", "Store and retry once", "saved only if no logout happened meanwhile; the original call is retried", num="7", kind="reply", ts=19, bs=16)
    f.note("Refresh says 401 or 403 → tokens deleted, signed out. Timeout or 5xx → tokens kept, the call fails: an outage is not proof of revocation. "
           "Each refresh starts a new 30-day window, so an active phone stays signed in; there is no absolute session limit.",
           "lens", title="On the phone", after=True)
    c.height = f.finish() + 30
    return c


@diagram("flow-logout")
def flow_logout() -> Canvas:
    c, f = auth_flow("flow-logout", "Logout", "Local cleanup is immediate; server revocation is best effort and covers one refresh token.",
                     "Tapping log out marks the store unauthenticated at once, reads both tokens, deletes them from SecureStore "
                     "and clears the query cache in memory and in AsyncStorage. In the background the app posts /auth/logout "
                     "with the access token as bearer and the refresh token in the body; the server marks that refresh row "
                     "revoked and logs the activity. If the access token has expired, the app refreshes once in memory and "
                     "logs out with the rotated pair. The old access token stays valid until it expires.",
                     [PHONE, API, DB], [36, 32, 32])
    f.step("phone", "Tap Log out", "isAuthenticated = false at once; the router shows login", num="1", ts=19, bs=16)
    f.step("phone", "Local cleanup", "read both tokens, delete them from SecureStore, clear the query cache and its AsyncStorage copy", num="2", ts=19, bs=16)
    f.step("api", "POST /auth/logout", "background, 30 s limit; Bearer access; body: refresh token", num="3", ts=19, bs=16)
    f.step("db", "Revoke one row", "matching jti and user → is_revoked = true; activity user_logout; COMMIT", num="4", ts=19, bs=16)
    f.step("phone", "Expired access?", "logout got 401/403 → refresh once in memory → logout with the rotated pair", num="5", link="none", ts=19, bs=16)
    f.note("The access token is not revoked: it works until its exp (at most 30 minutes by default). There is no 'log out everywhere' endpoint; "
           "a password change or reset increments session_version, which ends every session at its next request.",
           "risk", title="The logout window", after=True)
    c.height = f.finish() + 30
    return c


@diagram("flow-reset")
def flow_reset() -> Canvas:
    c, f = auth_flow("flow-reset", "Forgot and reset password", "A one-hour single-use link, then every existing session ends.",
                     "Forgot-password answers the same way whether or not the account exists, and refuses with 503 if mail is "
                     "off. For an active account it stores the SHA-256 digest of a random token with a one-hour expiry and emails "
                     "a link to the API's reset page. Submitting the form posts the token and the new password. The API locks "
                     "the matching row, stores a new Argon2id hash, clears the token, increments session_version, clears any "
                     "deletion token, revokes every refresh token and sends a notification email.",
                     [PHONE_MAIL, API, DB], [32, 34, 34])
    f.step("phone", "POST /auth/forgot-password", "email; 3 per hour per IP", num="1", ts=19, bs=16)
    f.step("api", "Same reply for everyone", "503 if mail is off; unknown or disabled account → the same generic message", num="2", ts=19, bs=16)
    f.step("db", "Store the digest", "SHA-256 of token_urlsafe(32), expiry now + 1 h; COMMIT", num="3", ts=19, bs=16)
    f.step("api", "Background email", "Brevo sends FRONTEND_URL/reset-password?token=…", num="4", ts=19, bs=16)
    f.step("phone", "Open and submit", "the API's HTML form, or the app's reset screen: token + new password", num="5", kind="optional", ts=19, bs=16)
    f.step("api", "POST /auth/reset-password", "5 per hour per IP; new password validated", num="6", ts=19, bs=16)
    f.step("db", "Lock the matching user", "digest, unexpired, active … FOR UPDATE → none: 400 'Invalid or expired reset token'", num="7", ts=19, bs=16)
    f.step("db", "Rotate everything", "new Argon2id hash; token cleared; session_version + 1; deletion token cleared; all refresh rows revoked; COMMIT", num="8", ts=19, bs=16)
    f.step("phone", "'Password changed' email", "background notification; log in again everywhere", num="9", kind="reply", ts=19, bs=16)
    c.height = f.finish() + 30
    return c


@diagram("flow-delete")
def flow_delete() -> Canvas:
    c, f = auth_flow("flow-delete", "Account deletion", "Two steps: ask in the app, confirm from the email. Nothing is deleted until the form is submitted.",
                     "DELETE /auth/me locks the user row, needs an email address and a working mail service, stores the digest "
                     "of a random token with a 24-hour expiry and emails a link. Opening the link only shows a confirmation page. "
                     "Submitting it looks the user up by digest and expiry with a row lock and deletes the user; foreign keys with "
                     "ON DELETE CASCADE remove that person's rows in every table. Cancel, a password change or a reset clears the token.",
                     [PHONE_MAIL, API, DB], [32, 34, 34])
    f.step("phone", "DELETE /auth/me", "Profile → Delete account (Bearer)", num="1", ts=19, bs=16)
    f.step("api", "Checks", "row lock re-checks the session; no email → 400; mail off → 503", num="2", ts=19, bs=16)
    f.step("db", "Store the digest", "deletion_token = SHA-256 of a random token, expires in 24 h; COMMIT", num="3", ts=19, bs=16)
    f.step("api", "Background email", "Brevo sends FRONTEND_URL/confirm-delete/{token}", num="4", ts=19, bs=16)
    f.step("phone", "Open the link", "GET shows a confirmation page only; nothing changes", num="5", kind="optional", ts=19, bs=16)
    f.step("api", "POST the form", "SELECT by digest and expiry FOR UPDATE → none: 400 page", num="6", ts=19, bs=16)
    f.step("db", "DELETE the user", "ON DELETE CASCADE: categories, items, orders and lines, activity, audit, refresh tokens, AI rows; COMMIT", num="7", role="fail", ts=19, bs=16)
    f.note("POST /auth/cancel-delete clears the token. A password change or reset clears it too. The global order-number counter keeps no user link and stays.",
           "lens", title="Cancelling", after=True)
    c.height = f.finish() + 30
    return c


@diagram("token-timeline")
def token_timeline() -> Canvas:
    c = new("token-timeline", "A session over time",
            "At login the phone receives an access token valid for 30 minutes and a refresh token valid for 30 days. "
            "Each refresh revokes the presented refresh token and issues a new pair with a new 30-day expiry. Logout "
            "revokes the current refresh token, but the access token keeps working until it expires. A password change "
            "increments session_version, so every older token fails at its next use. If the phone does not refresh for "
            "30 days, the refresh token expires and the person must log in again.")
    y = c.header("A session over time", "Default lifetimes: access 30 minutes, refresh 30 days from its own issue. Times are examples.")
    events = [
        ("0:00", "Login", "access A1 (until 0:30) · refresh R1 (until day 30) · row R1 stored", "server"),
        ("0:31", "A call gets 401", "A1 expired; the phone refreshes with R1", "fail"),
        ("0:31", "Refresh", "R1 revoked · new access A2 (until 1:01) · new refresh R2 (30 days from now)", "server"),
        ("0:40", "R1 used again", "nothing to claim → 401; R2 is untouched (no reuse detection)", "fail"),
        ("0:45", "Logout", "R2 revoked · tokens deleted on the phone · a copy of A2 would still pass until 1:01", "data"),
        ("or", "Password change instead", "session_version + 1 and every refresh row revoked: A2 and R2 fail at their next use", "data"),
        ("30 days idle", "Refresh token expires", "refresh → 401 → the phone signs out; log in again", "fail"),
    ]
    yy = y + 6
    line_x = 150
    first = yy
    mark = len(c.parts)
    for when, title, body, role in events:
        card = c.card(190, yy, W - 230, title, body, role, ts=19, bs=16.5, pad=14)
        c.text(line_x - 18, yy + 28, when, 17, 500, MAROON, SERIF, "end")
        c.parts.append(f'<circle cx="{line_x}" cy="{yy + 22:.1f}" r="7" fill="{COLOR[role]}"/>')
        yy = card.bottom + 14
    c.parts.insert(mark, f'<line x1="{line_x}" y1="{first + 10:.1f}" x2="{line_x}" y2="{yy - 20:.1f}" '
                         f'stroke="{INK3}" stroke-width="2.4"/>')
    c.height = yy + 24
    return c


@diagram("fernet-envelope")
def fernet_envelope() -> Canvas:
    c = new("fernet-envelope", "How a personal Sarvam key is stored",
            "The plaintext key is wrapped in a small JSON envelope that also names the owner and the provider. MultiFernet "
            "encrypts it with the primary key from AI_CREDENTIAL_ENCRYPTION_KEY: AES-128-CBC with a random IV and an "
            "HMAC-SHA256 tag over version, timestamp, IV and ciphertext. Only the token is stored. Decryption tries the "
            "primary key, then any previous keys, then checks that the envelope names the same owner and provider; any "
            "failure is a 503 asking the person to replace the key.")
    y = c.header("How a personal Sarvam key is stored", "Encrypted because the server must use the key again later. The database never holds the plaintext.")
    f = Flow(c, [("app", "Application", "server"), ("crypto", "Fernet (cryptography)", "service"), ("db", "PostgreSQL", "data")],
             top=y + 4, widths=[31, 35, 34])
    f.step("app", "Build the envelope", '{"v":1, "owner": user id, "provider": "sarvam-speech", "key": …}', num="1", ts=19, bs=16)
    f.step("crypto", "MultiFernet.encrypt", "with the primary key from the environment: AES-128-CBC, random IV, timestamp, HMAC-SHA256 tag", num="2", ts=19, bs=16)
    f.step("db", "Store only the token", "table ai_sarvam_credentials, column ciphertext; one row per user; the key itself stays in the environment", num="3", ts=19, bs=16)
    f.divider("Using it later")
    f.step("db", "Read the row", "only for the signed-in owner", num="4", link="none", ts=19, bs=16)
    f.step("crypto", "MultiFernet.decrypt", "tries the primary key, then up to 3 previous keys; a bad tag fails", num="5", ts=19, bs=16)
    f.step("app", "Check the envelope", "v = 1, same owner, same provider → use it; otherwise 503 'could not be unlocked'", num="6", ts=19, bs=16)
    c.height = f.finish() + 30
    return c

@diagram("backend-layers")
def backend_layers() -> Canvas:
    c = new("backend-layers", "Inside the inventory API", "A stock edit passes from ingress to the database and back.")
    y = c.header("Inside the inventory API", "Follow a signed-in inventory edit from the network boundary to durable stock.")
    for title, body, role in [
        ("Render container", "Gunicorn manages two CareKoshUvicornWorker processes by default.", "platform"),
        ("Admission and parsing", "CORS wraps ingress, capacity and body checks. Invalid requests can return early.", "server"),
        ("Router and dependencies", "The API includes ten resource routers. The stock handler needs an authenticated owner and a function-scoped database session.", "server"),
        ("Owner-scoped write", "Compare the submitted version, update the item, record history and advance the supply revision in the write transaction.", "data"),
        ("Response", "Return the saved row on success. Return 409 for a stale version so the client can reload before retrying.", "client"),
    ]:
        card = c.card(80, y + 14, W - 160, title, body, role, ts=21, bs=18)
        y = card.bottom + 12
    c.height = y + 24
    return c


@diagram("big-picture")
def big_picture() -> Canvas:
    c = new("big-picture", "One inventory, two clients", "The Worker serves the browser UI. Both clients call the API through Cloudflare. PostgreSQL holds stock and Redis shares rate limits.")
    y = c.header("One inventory, two clients", "Loading the browser application and reading a stock quantity are two separate requests.")
    browser, phone = row(c, 48, y + 14, W - 96, [
        ("Web browser", "A Cloudflare Worker serves the compiled React files. JavaScript in the browser sends inventory requests."),
        ("Android phone", "An installed Expo / React Native build uses the API URL selected by its build profile."),
    ], "client")
    edge = c.card(90, browser.bottom + 52, W - 180, "Cloudflare API hostname",
                  "The proxied API hostname selects the Render origin. A hostname-specific transform sets the origin verification header.", "platform")
    for client in (browser, phone):
        c.arrow([(client.cx, client.bottom + 2), (client.cx, edge.y - 4)], "main")
    api = c.card(90, edge.bottom + 48, W - 180, "FastAPI on Render",
                 "Ingress and capacity checks precede protected handlers. Access tokens identify the account. The handler applies the business rules.", "server")
    c.arrow([(edge.cx, edge.bottom + 2), (api.cx, api.y - 4)], "main")
    db, limiter = row(c, 48, api.bottom + 48, W - 96, [
        ("PostgreSQL on Neon", "Stock, orders, account sessions and Supply Review records. A write transaction groups the changes that must commit together."),
        ("Redis in hosted environments", "API workers share rate-limit counters. These counters have a different lifetime from inventory records."),
    ], "data")
    for resource in (db, limiter):
        c.arrow([(resource.cx, api.bottom + 2), (resource.cx, resource.y - 4)], "flow")
    c.height = max(db.bottom, limiter.bottom) + 32
    return c


@diagram("release-paths")
def release_paths() -> Canvas:
    c = new("release-paths", "Promoting a tested change", "Check the merged revision on staging and release each affected component.")
    y = c.header("Promoting a tested change", "A Git revision, a Worker version and an Android version identify different artifacts.")
    for title, body, role in [
        ("Review", "Open a pull request to main. Run the applicable checks and record the merged SHA. Confirm production auto-deploy settings before relying on a manual gate.", "platform"),
        ("Stage", "Advance the staging branch to the candidate. Verify the affected deployment, then repeat the changed user journey with a staging account.", "client"),
        ("Release the affected component", "Web: dispatch Release CareKosh web from the tested main revision. API: deploy the tested SHA on the production Render service. Android: validate the signed build on the internal track.", "server"),
        ("Verify", "Record the active Worker version, Render SHA and Android version where relevant. Check API readiness and the user journey. An image rollback leaves the database schema in place.", "data"),
    ]:
        card = c.card(64, y + 12, W - 128, title, body, role)
        y = card.bottom + 16
    c.height = y + 22
    return c
