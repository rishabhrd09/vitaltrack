# AUDIT & VERIFICATION PROMPT — Make `CAREKOSH_BACKEND_INTERVIEW_GUIDE.html` Interview-Trustworthy

## ROLE
You are simultaneously an **adversarial technical fact-checker**, a **primary-source verifier**, and a **senior backend-Python interviewer**. Your job is to make a single self-contained HTML interview-prep "textbook" something a candidate can trust **cold, the night before a mid/senior backend interview** — and defend aloud against a skeptical senior engineer. Trust here means four things at once:
1. **Factually correct** — every code citation matches THIS backend; every conceptual claim matches an authoritative primary spec.
2. **Internally consistent** — no chapter, FAQ, rapid-fire, glossary, or diagram contradicts another.
3. **Interview-aligned** — explanations are framed, scoped, and nuanced the way real interviewers ask and follow up.
4. **Structurally sound** — the HTML renders correctly, diagrams are present and legible, links resolve, counts are consistent.

You are **adversarial by default**: every claim is guilty until proven by (a) the exact backend line it describes, or (b) the exact section of an authoritative primary spec. You do not accept "this is generally true." You accept "RFC 7519 §4.1.4 says X" or "`auth.py:1208-1209` does X." A confidently-stated wrong claim in an interview is **worse than an omission**, so weight false-precision, citation drift, and over-claiming most heavily. **Do not rewrite the whole guide** — diagnose, prioritize, and specify surgical, evidence-backed fixes.

---

## INPUTS (all absolute paths)

- **Guide under audit (the artifact):**
  `/Users/rishabh/courses_tutorials/vital_track/first_playstore_version/vitaltrack/CAREKOSH_BACKEND_INTERVIEW_GUIDE.html`
  Single self-contained HTML file (~566 KB). **22 chapters; 33 collapsible FAQs (Q01–Q33); ~35 rapid-fire Q&As; 6 inline-SVG diagrams** (`system-architecture`, `request-lifecycle`, `layered`, `er-diagram`, `auth-rotation`, `scaling`); **378** citation chips of the form `<span class="fileref">app/api/v1/auth.py:1208-1209</span>`. Chapter ids: `ch-market`, `ch-bigpicture`, `ch-lifecycle`, `ch-structure`, `ch-async`, `ch-fastapi`, `ch-config`, `ch-database`, `ch-datamodel`, `ch-auth`, `ch-crud`, `ch-security`, `ch-reliability`, `ch-testing`, `ch-deploy`, `ch-scaling`, `ch-patterns`, `ch-faq`, `ch-rapidfire`, `ch-resources`, `ch-glossary`, `ch-endpoints`.

- **Backend it documents (GROUND TRUTH for every code claim):**
  `/Users/rishabh/courses_tutorials/vital_track/first_playstore_version/vitaltrack/vitaltrack-backend`
  FastAPI; async SQLAlchemy 2.0 + asyncpg + PostgreSQL; JWT access/refresh with refresh-token **rotation**; Argon2 hashing; slowapi rate limiting; OWASP security headers; `/health` (readiness) + `/live` (liveness); `items.version` optimistic-concurrency CAS; denormalized order-item snapshot; Docker multi-stage + Render deploy; Alembic migrations; audit/activity logging. **This is the only code that counts.** Current line counts on `main` for sanity-checking range bounds: `auth.py`=1259, `items.py`=657, `orders.py`=619, `categories.py`=307, `main.py`=337, `security.py`=220, `deps.py`=179, `config.py`=175, `database.py`=163, `activity.py`=56. Route-decorator counts: `auth.py`=18, `items.py`=8, `categories.py`=6, `orders.py`=6, `activity.py`=1.
  > **CRITICAL CONTEXT — citation drift is an expected risk.** The guide was authored against an earlier checkout, then **moved** next to this backend. Spot-checks suggest citations are currently in sync on `main`, but you must **open and re-verify every chip, not assume**. Drift = wrong line numbers, renamed symbols, removed/added code, or a chip resolving to real-but-unrelated code.

- **Build pipeline + prior research artifacts (provenance — consult, do NOT treat as authoritative; the live backend and primary specs always win):**
  `/Users/rishabh/courses_tutorials/vital_track/goal_9_fresh/vitaltrack/build/interview_guide/` *(if present)*
  Contains: `assemble.py`, `STYLE_CONTRACT.md`, `part_head.html`, `part_foot.html`; `fragments/01_market.html … 22_endpoints.html` (one per chapter; FAQs ≈ `18_*`, rapid-fire ≈ `19_*`); `diagrams/{system-architecture,request-lifecycle,layered,er-diagram,auth-rotation,scaling}.html`; `research/` JSON (`code_auth.json`, `code_core.json`, `code_crud.json`, `code_datamodel.json`, `code_infra.json`, `codebase_verify.json`, `deep_research_web.json`, `docs.json`, `jobs.json`, `local_materials.json`, `refs.json`). Use these to understand *intent* and *what was originally claimed vs. what code/spec says* — never cite them as proof of current state. **Prefer routing each fix to its source fragment/diagram file** (so the HTML can be regenerated via `assemble.py`) while also noting the assembled-HTML location for traceability. Respect `STYLE_CONTRACT.md` for tone/length.

---

## METHOD (disciplined, evidence-first — do not pattern-match)

1. **Build the claim inventory.** Parse the HTML. Extract: every `<span class="fileref">` chip (file + line range + the sentence(s) it supports); every chapter / FAQ (Q01–Q33) / rapid-fire / glossary assertion *without* a chip (these are higher-risk); every diagram's labels/arrows/flows.
2. **Code claims → open the code.** For each chip, open the exact `file:LINES` range in THIS backend (read the range; `grep`/`sed -n` to confirm). Record the operative code line as evidence.
3. **Conceptual claims → quote the spec.** For each contestable claim, quote the specific clause (section number + operative sentence) from the named primary source. Paraphrase-only is NOT acceptable evidence.
4. **Adversarial multi-vote on contestable claims.** "Contestable" = anything a senior engineer could reasonably push back on. Generate **≥3 independent skeptical readings**, each trying to show the claim is wrong, oversimplified, or true-only-under-unstated-assumptions. Mark "verified" only if all three converge on a primary source. If they disagree, flag "contested" and summarize the disagreement + your resolution.
5. **Internal-consistency sweep.** Cross-read chapters vs. FAQs vs. rapid-fire vs. glossary vs. diagrams vs. the endpoint catalog. Any value stated two ways (status code, line number, algorithm name, token lifetime, route method, default) is a self-contradiction finding — report **both** locations and rule on the correct value.
6. **Structural/rendering integrity.** Confirm: HTML tags balanced and the file renders; all 6 SVG diagrams present and legible (no overlapping/truncated text, readable without relying on color alone); intra-page anchor links (TOC → chapter ids, FAQ jumps) resolve; declared counts are internally consistent (22 chapters, 33 FAQs, ~35 rapid-fire, 6 diagrams, 378 chips) and no chapter/FAQ/diagram is missing or duplicated.
7. **Severity + fix.** Assign CRITICAL / MAJOR / MINOR (scale below). Every finding MUST carry ground truth (`file:line` excerpt OR spec §) and **precise replacement wording** — not vague advice.

---

## LENS 1 — CODE-CITATION FIDELITY & DRIFT (against THIS backend)

For **every** `<span class="fileref">file:LINES</span>` chip, perform all three:
1. **Existence/range check** — file exists at that path AND the line range is in-bounds (use the line counts above). A chip whose end exceeds the file length or whose path is gone is a finding.
2. **Semantic check** — open the lines and confirm the *surrounding prose actually describes what that code does today*. A chip that resolves to real code but supports a wrong sentence is a **MAJOR** finding, not a pass. Verify the *characterization*, not just existence (e.g. a CAS `UPDATE ... WHERE version=:v RETURNING` must be described as compare-and-swap **with the correct miss-behavior** — which HTTP status on a lost race?).
3. **Drift classification** — when wrong, classify as: `drifted-line` (right symbol, wrong range), `renamed-symbol`, `removed-code` (claim describes code no longer present), `added-code` (code now does something the guide omits/contradicts), or `fabricated` (no such code ever).

**High-value code behaviors that MUST be re-verified against THIS backend:**
- **Refresh rotation** — atomic single-statement CAS `UPDATE refresh_tokens ... WHERE is_revoked = false RETURNING ...`; reuse of a rotated token is detected/rejected; access-vs-refresh lifetimes & revocation match `app/api/v1/auth.py` + `app/models/refresh_token.py` + `app/core/security.py`.
- **JWT algorithm pinning** — decode pins the expected algorithm (e.g. `algorithms=["HS256"]`) at the `jwt.decode(...)` call sites in `security.py`; the guide's `alg:none` / RS256↔HS256 claims map to real call sites.
- **Password hashing** — `CryptContext(schemes=["argon2","bcrypt"], deprecated="auto")` at `security.py:22`: **argon2 is FIRST = active**; `deprecated="auto"` deprecates only the bcrypt fallback. The guide must NOT call bcrypt the default.
- **Transaction/commit semantics** — `get_db` in `database.py` yields, then **commits on success at teardown AND rolls back on error AND closes in `finally`**, while nearly every write handler ALSO commits explicitly before returning. The accurate statement is *"handlers commit explicitly, and `get_db` also commits on clean teardown / rolls back on error"* — flag any wording that says "commit only at teardown" OR "get_db never commits."
- **Optimistic concurrency (OCC)** — the `items.version` CAS (`UPDATE items ... WHERE version=:expected SET version=version+1 RETURNING`); a stale version yields the documented status — confirm which (409/precondition).
- **Order-apply exactly-once** — apply path pre-resolves missing items, then claim-CAS `UPDATE ... WHERE status==RECEIVED RETURNING`; a SECOND apply finds `scalar_one_or_none() is None` → **HTTP 400 "must be in received status"** (double-apply-SAFE but NOT a silent idempotent no-op). This is **DISTINCT** from the status-update CAS endpoint, which returns **HTTP 409**. The guide must not conflate the two or call apply an "idempotent 200."
- **ETag / If-Match → 412** — if the guide claims HTTP conditional-request semantics, confirm the actual response code in handlers. If the backend expresses concurrency via a JSON `version` field rather than HTTP ETags, the guide must say so and not overstate HTTP `If-Match`/`412` support.
- **Health probes** — `/health` = readiness (touches DB/deps), `/live` = liveness (cheap, no deps) in `app/main.py`; confirm they are NOT mounted under `/api/v1`.
- **CORS** — actual `CORSMiddleware` config (origins, `allow_credentials`). If `allow_credentials=True`, the guide must NOT claim `Access-Control-Allow-Origin: *` is used (forbidden combination).
- **Rate limiter** — slowapi key function in `app/utils/rate_limiter.py` (IP vs user vs `X-Forwarded-For`), the limits, and storage backend; the stated algorithm (fixed/sliding window, token bucket) must match slowapi's actual behavior and its multi-instance limitation.
- **Config validators** — Pydantic Settings validators in `app/core/config.py` (SECRET_KEY length/prod guard, `DATABASE_URL` → `postgresql+asyncpg` rewrite, CORS-origins parsing).
- **Model↔migration drift** — `ck_users_email_or_username` CHECK constraint EXISTS in migration `alembic/versions/20260124_add_username.py` but is **absent from the ORM model `__table_args__`** in `app/models/user.py`. Guide must document this as DB-level enforcement, not claim the ORM declares it.

### Route / Endpoint reconciliation (required sub-deliverable for `ch-endpoints`)
Reconcile three ways and report discrepancies:
1. **Catalog ↔ live routers** — enumerate every `@router.{get,post,put,patch,delete}` in `app/api/v1/*.py` (counts above) plus root routes in `app/main.py` (`/health`, `/live`, etc.). The catalog must be a **bijection** with live routes: flag missing rows, extra rows, and wrong-method/wrong-path rows.
2. **CI route-count gate** — read `scripts/check_api_routes.py`. It takes an `--expected <N>` arg (**CLI-supplied at invocation, NOT a hardcoded constant**) and FAILS CI if (a) the `/api/v1` route-object count ≠ expected, (b) any `/health` or `/live` route is mounted under `/api/v1`, or (c) ANY route path contains `/sync`. Confirm the guide describes this gate accurately and does not overstate it. If runnable, derive N from the live enumeration and run `python scripts/check_api_routes.py --expected <N>`; report whether the guide's stated count and gate description are correct.
3. **No live `/sync` endpoint** — confirm NO `/sync` route exists anywhere. `local_id` is a client-supplied dedupe/correlation field, NOT a live idempotent-sync server feature. Any sentence implying a working `/sync` is **CRITICAL** (it would also break CI).

---

## LENS 2 — CONCEPTUAL ACCURACY vs NAMED PRIMARY SOURCES (close the known verification gap)

The **async/DI/Pydantic/SQLAlchemy half** was previously confirmed accurate against official docs (event-loop single-thread; CPU-bound→process pool but GIL-releasing C-extension hashing→thread pool; ~40-token AnyIO `CapacityLimiter`; `expire_on_commit=False`; the two `MissingGreenlet` triggers; AsyncSession-per-task; lazy-load N+1). **Re-confirm only by spot-check; do not re-litigate unless you find a contradiction.**

The **security/systems half** was sourced from primary docs but its **3-vote adversarial verification was NEVER completed — close that gap now.** Treat ALL of the following as UNVERIFIED until the multi-vote passes. For each, quote the authoritative source and render a verdict:

- **JWT / tokens** — RFC 7519 (registered claims `exp`/`iat`/`nbf`/`sub`/`aud`, §4.1), **RFC 8725** (JWT BCP: §2.1 `none` algorithm, §2.2 algorithm/key confusion — always verify `alg` against an allowlist), RFC 7515 (JWS signature/`alg`). OWASP **JWT** + **Authentication** + **Session Management** cheat sheets. Confirm the guide pins a specific algorithm, rejects `alg:none`, and that any RS256↔HS256-confusion explanation matches RFC 8725 §2.2.
- **Password storage** — OWASP **Password Storage Cheat Sheet** (Argon2id recommended params; bcrypt 72-byte input limit + pre-hashing guidance; scrypt/PBKDF2 positioning). Cross-check the "argon2 is active" claim against BOTH the cheat sheet AND `security.py:22`.
- **HTTP semantics / idempotency** — **RFC 9110** (methods, idempotency §9.2.2, status codes incl. 409 §15.5.10, 412 §15.5.13). Confirm any "idempotent" claim against §9.2.2's exact definition (an idempotent method's *effect on server state* is the same for one or many identical requests — NOT that the response status is identical). Cross-check "exactly-once / at-least-once / idempotency keys" against the actual order-apply behavior above; **Stripe idempotency docs** as an industry reference.
- **Conditional requests / ETag** — **RFC 9110 §13 + §15.5.13**, **RFC 7232** (`If-Match`/`If-None-Match`, 304 vs 412).
- **CORS** — **WHATWG Fetch Standard** (CORS protocol) + **MDN CORS**: `Access-Control-Allow-Origin: *` is INCOMPATIBLE with `Access-Control-Allow-Credentials: true` (credentialed requests require an explicit origin echo). Plus preflight semantics.
- **Probes** — **Kubernetes "Configure Liveness, Readiness and Startup Probes"**: liveness → restart container; readiness → remove from LB rotation; confirm `/live`→liveness and `/health`→readiness mapping.
- **Rate-limit algorithms** — fixed window, sliding window, token bucket, leaky bucket — match each description to a canonical reference AND to slowapi's documented behavior.
- **12-factor** — **12factor.net** (esp. III Config, IV Backing services, VI Processes/stateless, IX Disposability, XI Logs).
- **Scaling** — **PgBouncer** (transaction vs session pooling; why transaction-mode breaks asyncpg prepared-statement caching), **PostgreSQL** (MVCC, isolation levels, `RETURNING`, advisory/row locks), **asyncpg**, **Redis** (shared rate-limit/session/cache store), read replicas, sharding.
- **Framework/data layer (spot-check)** — **SQLAlchemy 2.0**, **FastAPI**, **Pydantic v2** official docs for any claim re-touched.

**Diagram-vs-code check:** sanity-check all 6 SVGs against the code path each depicts (e.g. `auth-rotation` must match the atomic `UPDATE ... WHERE is_revoked=false RETURNING` rotation; `request-lifecycle` must match middleware/dependency order in `main.py`; `er-diagram` must not show a relationship the models lack). A diagram contradicting the prose or code is a self-contradiction finding.

---

## LENS 3 — INTERVIEW ALIGNMENT & COMPLETENESS (accuracy is the precondition; this is the differentiator)

For each chapter, FAQ, and rapid-fire, evaluate against how strong mid/senior backend Python interviews actually **ask and probe**:
1. **Question framing** — posed as an interviewer would (open-ended, scenario/trade-off-driven), not a flashcard "define X" softball no loop uses.
2. **The follow-up probe** — interviewers push 1–2 levels deeper ("now what breaks under concurrency / at 10x traffic / if the token is stolen?"). Identify the obvious next follow-up and check whether the guide pre-empts it. A missing follow-up is a **coverage gap**, not a nitpick.
3. **Strong-vs-weak separation** — does the answer signal what makes a senior answer (the trade-off, the failure mode, the "it depends on…")? A single confident assertion with no nuance rider is a finding — interviewers reward the rider.
4. **Depth calibration** — every answer should carry a defensible caveat (edge case, cost, the rejected alternative and why). Mark correct-but-shallow answers.
5. **Coverage gaps** — confirm the guide adequately covers the standard probe set for this stack: connection pooling + event-loop blocking; transaction boundaries + commit/rollback; idempotency / exactly-once vs at-least-once; optimistic vs pessimistic concurrency (the `items.version` CAS); N+1 / eager vs lazy; JWT alg pinning + `alg:none`/RS256↔HS256; refresh rotation + reuse detection + theft response; Argon2id vs bcrypt/scrypt/PBKDF2 + bcrypt 72-byte truncation; CORS `*`-vs-credentials; rate-limit algorithms + multi-instance limits; liveness vs readiness; ETag/`If-Match`→412; 12-factor config; scaling levers (PgBouncer, read replicas, Redis, sharding). Flag any that are missing, thin, or asserted without the "why/when." Distinguish **"missing entirely"** from **"present but no nuance rider."**
6. **Tone & length** — answers should be speakable (≈30–90s spoken for a normal FAQ; rapid-fire = 1–2 crisp sentences). Flag bloated walls of text, marketing padding, or answers so terse they lose the follow-up. Respect `STYLE_CONTRACT.md`.

---

## KNOWN-GOTCHAS RE-CHECK LIST (confirm each STAYED FIXED **and** hunt for siblings — the same *class* of error elsewhere)

1. **`local_id` is NOT a live idempotent-sync feature.** No live `/sync` endpoint; `check_api_routes.py` fails CI if one appears. *Sibling-hunt:* any other "offline sync / idempotent client retry" claim with no endpoint behind it, or any planned/aspirational feature overstated as shipped.
2. **Order-apply is double-apply-SAFE but returns HTTP 400 on a second apply** (NOT a silent idempotent no-op); apply CAS ≈ `orders.py:471-515`; the status-update CAS returning **409** is a *different* endpoint ≈ `orders.py:388-402`. Guide must say 400-on-re-apply and never conflate the two CAS endpoints or call apply "idempotent." *Sibling-hunt:* any other guard called "idempotent"/"exactly-once" that actually errors.
3. **CI Trivy is a PR-only ADVISORY filesystem scan (`continue-on-error`)** — not an image scan, not a deploy gate; the Render deploy hook fires only IF the secret is configured, else Render auto-deploys. Verify against `.github/workflows/ci.yml` + `render.yaml`. *Sibling-hunt:* any CI/CD step described as "blocking/gating" that is actually advisory or conditional.
4. **DB commit is NOT only at `get_db` teardown.** Write handlers commit explicitly; `get_db` (≈ `database.py:106-123`) ALSO commits on clean teardown (≈ line 118) and rolls back on error. State precisely — neither "only at teardown" nor "never commits." *Sibling-hunt:* any transaction/commit claim that is too absolute.
5. **Model↔migration drift:** `ck_users_email_or_username` exists in migration `20260124_add_username` but is absent from the ORM `__table_args__`. *Sibling-hunt:* any "the model enforces X" claim where enforcement actually lives only in a migration (or vice versa).
6. **Active CryptContext scheme is the FIRST listed = `argon2`** (`security.py:21-24`); `deprecated="auto"` deprecates the bcrypt fallback. Guide must not mislabel bcrypt as default. *Sibling-hunt:* any other "default = X" claim that gets first-vs-last list ordering or config precedence backwards.

---

## SEVERITY SCALE
- **CRITICAL** — a candidate stating this would be factually wrong on a core competency, OR it breaks CI / misrepresents security posture. Examples: "there's a working `/sync` endpoint"; "bcrypt is the default hash"; "order-apply is an idempotent 200"; "`Allow-Origin: *` works with credentials"; "`alg:none` is accepted/safe"; a diagram that contradicts the code.
- **MAJOR** — cited code no longer matches the claim (drifted symbol/behavior); a wrong status code; a misattributed endpoint; an over-absolute commit/transaction claim; model-vs-migration confusion; a conceptual claim that contradicts the primary source in a way an interviewer would catch; OR correct-but-shallow on a topic interviewers reliably probe (a real coverage gap).
- **MINOR** — drifted line numbers that still resolve to the correct symbol (log them); stale-but-harmless phrasing; cosmetic catalog mismatch; tone/length/legibility/typo.

When uncertain whether a claim is wrong, mark it **`needs-source`** rather than silently passing it.

---

## REQUIRED OUTPUT (produce all seven sections, in this order)

### 1. Per-chapter trust scorecard
One row per chapter id (all 22) plus rows for the FAQ block, rapid-fire block, and diagrams block. Columns:
`Chapter | Claims checked | Citations verified / total | Factual (0–5) | Interview-alignment (0–5) | Depth/nuance (0–5) | Critical | Major | Minor | Trust grade (A–F) | One-line verdict`

### 2. Prioritized findings table (sorted CRITICAL → MAJOR → MINOR)
`# | Severity | Lens (citation/conceptual/consistency/interview/diagram/structural) | Location (chapter / Qxx / rapid-fire # / diagram — with the chip or quoted sentence, plus assembled-HTML anchor + source fragment file) | The claim as written (verbatim) | Why it's wrong/over-claimed/shallow | Ground truth + evidence (exact spec § + operative sentence OR file:line with operative code) | Drift type (drifted-line/renamed/removed/added/fabricated/conceptual/n-a) | Precise fix (exact replacement text or tight edit instruction)`

### 3. Citation drift ledger
Every chip that failed existence/range or semantic check: `chip-as-written | resolves-to-now | correct chip | note`. Chips that passed need only an aggregate count.

### 4. Route/endpoint reconciliation report
Live-routes-not-in-catalog; catalog-rows-not-live; method/path mismatches; the guide's stated route count vs the actual `--expected` count; whether the guide's CI-gate description (`/sync` block, health-route block, count assertion) is accurate; and confirmation that no `/sync` route exists.

### 5. Internal-consistency report
Every contradiction as `Location A (says X) ↔ Location B (says Y) → which is correct + one-line fix`. Include prose↔diagram, prose↔glossary, and chapter↔FAQ↔rapid-fire conflicts.

### 6. Coverage-gap report (interview lens)
Concepts an interviewer at this level expects that the guide is missing or thin on. For each: the probe an interviewer would actually ask, the follow-up, and the tight addition (one paragraph/bullet) needed to answer it well. Distinguish "missing entirely" from "present but no nuance rider."

### 7. Known-gotchas status + per-topic interview-trustworthy verdict
- **Gotchas:** the 6-item list, each marked `STILL-CORRECT / REGRESSED / NEW-SIBLING-FOUND` with evidence.
- **Per-topic verdict:** for each major topic — *async/event-loop, FastAPI/DI, Pydantic, config/12-factor, database/SQLAlchemy, data model/migrations, auth/JWT, refresh rotation, password hashing, CRUD/concurrency (OCC/CAS), order exactly-once, security headers/CORS, rate limiting, reliability/probes, idempotency/ETag, testing, deploy/Docker/CI (Trivy/Render), scaling, endpoint catalog, diagrams* — output `interview-trustworthy: YES / NO`, and for every NO list the **exact change(s)** required to flip it to YES.

### Appendix — Adversarial-vote log
For each contestable claim that went to a 3-skeptic vote: the claim, the three independent readings, and the resolution.

---

## ACCEPTANCE CRITERIA ("done / trustworthy") — ALL must hold and be evidenced in the report
1. **Zero CRITICAL findings remain** (no false factual claim, no contradicted diagram, no CAS/idempotency/JWT/CORS misstatement, no implied `/sync` endpoint).
2. **Every one of the 378 fileref chips has been opened** against THIS backend and is confirmed or flagged (zero unexamined chips); every chip resolves in-bounds AND the surrounding prose matches the code's actual behavior. Minor line-drift is allowed only if it still resolves to the correct symbol and is logged in the Drift Ledger.
3. **Every contestable security/systems claim carries a quoted primary source** (RFC 7519/8725/9110/7232, OWASP cheat sheets, WHATWG Fetch/MDN, Kubernetes, 12factor.net, SQLAlchemy/FastAPI/Pydantic/asyncpg/PgBouncer/PostgreSQL/Redis docs), verified by adversarial multi-vote with no unresolved disagreement — or is flagged.
4. **All 6 known gotchas are STILL-CORRECT with no unflagged siblings**, OR every regression/sibling is filed as a finding with a precise fix.
5. **The endpoint catalog is a bijection with the live routers** (no missing/extra/mis-methoded rows), the stated route count matches the `--expected` gate, and the `/sync`-absence + CI-gate description are accurate.
6. **Zero unresolved internal contradictions** across chapters, FAQs, rapid-fire, glossary, and diagrams.
7. **Structural integrity confirmed** — HTML renders, all 6 diagrams present and legible, anchor links resolve, declared counts consistent.
8. **Every FAQ/rapid-fire carries a defensible nuance rider** and pre-empts the obvious follow-up; the coverage-gap list is empty or every gap has a specified fix; tone/length is calibrated per `STYLE_CONTRACT.md`.
9. **Every topic in Section 7 reads `interview-trustworthy: YES`**, or each remaining NO has a concrete, scoped flip-to-YES change list.

---

**Working rules:** Work file-by-file and claim-by-claim. Prefer "I opened the code and it says X" / "RFC §N says X" over "this is probably right." Where you cannot verify a primary source, say so explicitly rather than asserting. Prefer exact replacement text over vague advice. If something is already correct, say so briefly and move on — spend your words on what must change. Begin by extracting the chip list and the security/systems claim inventory; report verification as you go, then assemble the final report in the format above.


---

## HOW TO RUN THIS PROMPT

Paste `refinedPrompt` verbatim into a fresh agent session (or a `/deep-research` run, or as the spec for a multi-agent audit workflow). It is self-contained — the only external inputs it needs are the two absolute paths already embedded in it (the guide HTML and the `vitaltrack-backend` checkout), plus the optional build/research directory it also names. For a multi-agent split: one agent on LENS 1 (citation/drift + route reconciliation), one on LENS 2 (conceptual + adversarial multi-vote, which benefits from web/primary-source access), one on LENS 3 + internal-consistency + structural integrity; then a senior-editor agent merges into the single seven-section report. The executing agent needs filesystem read access to both paths and (for LENS 2) web access to the named RFC/OWASP/spec sources. Hand it nothing else; all ground-truth facts, line counts, and known gotchas are baked in.

---

## WHAT THIS AUDIT ADDS OVER THE PRIOR PASSES

- Unifies all three lenses into one weighted pipeline (Draft A's primary-source rigor, Draft B's drift/route-reconciliation precision, Draft C's interview-alignment + structural integrity) instead of forcing a choice between correctness-only and interview-only audits.
- Adds the sixth requirement none of the three fully covered — explicit STRUCTURAL/RENDERING integrity checks (tags balanced, diagrams present and legible, anchor links resolve, declared counts consistent) as a first-class lens with its own acceptance criterion.
- Resolves the drafts' factual disagreements against verified ground truth: 378 chips (not 'every chip' vaguely), `security.py:22 schemes=[argon2,bcrypt]`, `check_api_routes.py --expected` is a CLI arg not a constant, build pipeline + research JSON confirmed present — so the merged prompt states facts the executor can trust.
- Eliminates Draft A's vagueness ('open each cited file') by importing Draft B's three-step per-chip protocol (existence/range -> semantic -> drift-classification) and its explicit drift taxonomy, while keeping Draft A's named-source-per-topic precision.
- Folds the order-apply 400 vs status-update 409 distinction, the get_db dual-commit nuance, and the argon2-first scheme into BOTH the per-behavior code-verify list AND the gotchas list with sibling-hunts, so a known over-claim class can't slip through in a new location.
- Merges the three different output formats into one seven-section deliverable (scorecard + prioritized findings + drift ledger + route reconciliation + consistency + coverage-gap + gotchas/per-topic verdict + adversarial-vote appendix), removing the overlap where each draft proposed a slightly different table schema.
- Makes the 'route reconciliation as bijection' and the CI-gate accuracy check explicit sub-deliverables (Draft B's strength) that Drafts A and C only gestured at, including the runnable `--expected` verification step.
- Tightens acceptance criteria to nine concrete, evidence-bound gates (zero unexamined chips, every contestable claim source-quoted, catalog bijection, structural integrity) so 'done' is testable rather than aspirational.
