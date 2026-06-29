# CareKosh — AI Features Feasibility & Roadmap

> **Markdown companion** generated 2026-06-29 from the canonical HTML version (`CAREKOSH_AI_FEATURES_FEASIBILITY_AND_ROADMAP.html`). For the richly-formatted version, open the HTML.

---

# Free _Voice_ \+ _WhatsApp_ AI

A ₹0 voice assistant + WhatsApp companion for the CareKosh home-ICU inventory app — what's genuinely free, what isn't, the architecture, the emergency-vs-routine feature set, and how it maps to the Adobe Gen-AI role. Web-researched & code-grounded.

WhatsApp-only (no Telegram) · free LLM/STT/TTS only · grounded in vitaltrack-backend/ + vitaltrack-mobile/ · Neon Postgres · post-launch V2+ · 2026-06

#### Contents

  1. 01The verdict
  2. 02The ₹0 stack (research-verified)
  3. 03Code feasibility (feature → API)
  4. 04Architecture
  5. 05The home-ICU feature set
  6. 06The weekend MVP
  7. 07Cost — what's free vs not
  8. 08Risk register
  9. 09Adobe-JD map & interview plan
  10. 10Framework & tooling choices
  11. 11Roadmap & next steps



## 01 · The verdict

✅ A genuinely ~₹0 voice + WhatsApp AI layer is feasible — with two honest costs

### Free LLM, free voice, free inbound WhatsApp. The only real cost is _proactive_ WhatsApp alerts (paid templates) — and in-app push covers that for free.

Everything you described — voice queries for low/out-of-stock, a spoken + on-screen list, reorder reminders with confirm, in-app + WhatsApp notifications — is buildable for ₹0/month, on top of endpoints you already shipped. The catch: WhatsApp _proactive_ (business-initiated) messages aren't free, and a "local" LLM can't run on your Render box. Both have clean free workarounds.

₹0

LLM + voice + inbound WhatsApp

14,400

Free LLM calls/day (Groq)

~70%

Already in your backend

is_critical

Emergency tag already exists

Three framing rules that don't change

**1 · Foundation first.** The first Play Store release ships with **none** of this. AI is the post-traction layer (gated on launch + ~first 50 active users).

**2 · WhatsApp is "where families are" — but it has setup + a small proactive cost.** Cloud API needs Meta **business verification** ; replying to user messages is free, but pushing alerts costs per-template. Use free in-app push for proactive, WhatsApp for the free reply bot + an opt-in report.

**3 · For Adobe, it's a differentiator, not the gate.** Win DSA + system design first; this project wins the room, not the screen.

* * *

## 02 · The ₹0 stack — what's actually free (2025–2026, verified)

Every number below was web-researched and adversarially verified. Sources are linked per row.

### Free LLM (no paid model) — Groq is the strongest single option

Option| Free limits| Verdict  
---|---|---  
**Groq** — Llama 3.1 8B Instant (native tool-calling)| 30 RPM · 14,400 req/day · 6,000 TPM · 500k TPD| FREE Recommended primary. Fast, real function-calling, generous daily cap.  
Groq — Llama 3.3 70B Versatile| 30 RPM · 1,000 req/day · 100k TPD| FREE Smarter, much tighter daily cap — use for hard queries only.  
**Google Gemini Flash** — Free tier| No billing account needed (distinct from paid Tier 1's $250 cap)| FREE Best Hinglish · strong failover.  
Cloudflare Workers AI| 10,000 Neurons/day free (then $0.011/1k)| FREE Another vendor for decorrelated failover.  
OpenRouter `:free` models| ~20 RPM · ~50 req/day (~1,000/day after one-time $10)| FREE Lowest caps; emergency fallback only.  
Self-hosted small model (Gemma/Llama 1–3B via Ollama)| ₹0 software, but needs a host| FREE* Needs an **external free CPU host** (Oracle Cloud Always-Free ARM) — your Render box (0.5 vCPU, no GPU) can't serve it.  
  
Sources: [Groq rate limits](https://console.groq.com/docs/rate-limits) · [Gemini limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/) · [OpenRouter limits](https://openrouter.ai/docs/api/reference/limits)

### Free voice (Hindi + English) — capture on-device, understand in the cloud

Stage| Free option| Note  
---|---|---  
**TTS** (speak the answer)| `expo-speech`| FREE Ships in Expo Go, no native build; Android/iOS/Web; hi-IN + en-IN. **TTS-only.**  
**STT** (hear the user) — on-device| `expo-speech-recognition` (MIT)| FREE Wraps native iOS `SFSpeechRecognizer` / Android `SpeechRecognizer`. SDK 54 via `@sdk-54`. **Needs a dev build** (not Expo Go).  
STT — Hinglish-specialised (server)| **Whisper-Hindi2Hinglish-Swift** (Apache-2.0)| FREE Purpose-built for code-mixed Indian Hinglish; 72.6M params; CPU-fallback (slow on 0.5 vCPU).  
STT — hosted multilingual| Groq **Whisper Large v3**|  FREE 20 RPM · 2,000 req/day · 28,800 audio-sec/day — same free Groq key as the LLM.  
  
Sources: [expo-speech](https://docs.expo.dev/versions/latest/sdk/speech/) · [expo-speech-recognition](https://github.com/jamsch/expo-speech-recognition) · [Whisper-Hindi2Hinglish-Swift](https://huggingface.co/Oriserve/Whisper-Hindi2Hinglish-Swift)

### WhatsApp — the one place "free" has an asterisk

💬 The rule that shapes the whole WhatsApp design

**Inbound-triggered replies are FREE** — answering a user's natural-language query (and any follow-ups) is free _within the 24-hour Customer Service Window_ , which re-opens every time the user messages your bot. No template pre-approval needed.

**Proactive (business-initiated) messages are PAID** — daily reports and low-stock/expiry alerts sent _outside_ that window require **pre-approved template messages** billed per Meta's 2025 per-message pricing. Cloud API also requires **business verification**.

**⇒ Design:** WhatsApp = the **free reply bot** (Q&A) + an **opt-in** daily report; proactive alerts go via **free in-app push** first, mirrored to WhatsApp templates only when the few-paise cost is worth it.

Sources: [Meta WhatsApp pricing](https://developers.facebook.com/docs/whatsapp/pricing) · [2025 pricing update](https://www.ycloud.com/blog/whatsapp-api-pricing-update)

The single recommended ₹0 stack

**LLM:** Groq free (Llama 3.1 8B, tool-calling) → Gemini Flash free failover. **STT:** on-device `expo-speech-recognition` (or Groq Whisper free for Hinglish-heavy users). **TTS:** `expo-speech`. **Embeddings:** local `multilingual-e5-small` in Neon pgvector. **Channels:** free in-app Expo push (proactive) + WhatsApp free reply bot. **Email:** existing Brevo. **Recurring cost: ~₹0** , except optional WhatsApp _proactive_ templates (a few paise each, fully avoidable via in-app push).

* * *

## 03 · Code feasibility — feature → existing API

Verified against `vitaltrack-backend/app/api/v1/`. Every conversational _read_ intent and the email channel already exist; the agent is mostly an orchestrator over them.

User says…| Existing endpoint| Citation  
---|---|---  
"what's running low / out of stock?"| `GET /items/needs-attention`| items.py:170 — pre-sorted, out-of-stock + critical first  
"oxygen kitne hain?"| `GET /items?search=`| items.py:82 — ilike over name/brand  
"add 5 suction catheters"| `PATCH /items/{id}/stock`| items.py:552 — atomic version CAS  
"what did we last update?"| `GET /activities`| activity.py:17 — "Stock: 6 → 4"  
daily-report numbers| `GET /items/stats`| items.py:114 — one call = whole report  
"show me emergency / critical items"| `GET /items?isCritical=true`| items.py:68 — **the emergency-vs-routine split already exists**  
send report| `send_email_via_api()`| email.py:72 — Brevo, production-working  
  
### Gaps to build (all at the edges)

  * **Agent layer:** no LLM client (but `httpx` already present → a free Groq/Gemini call needs **no new dependency**); a `/ai/answer` (read) + `/ai/act` (guarded write) endpoint.
  * **Expiry + staleness:** items have `expiry_date` and `updated_at`, but no endpoint surfaces "expiring soon" or "stale". S — **verify`updated_at` bumps on the atomic stock write first** (the CONC-1 Core update may bypass the ORM `onupdate`; add `updated_at=func.now()` to each CAS if so).
  * **Push:** no `expo-notifications` / device-token store (and `VIBRATE` is blocked in app.json). M
  * **WhatsApp:** a `POST /integrations/whatsapp/webhook` \+ `wa_id↔user` mapping + Meta business verification. M
  * **Voice (mobile):** `RECORD_AUDIO` is **actively blocked** in app.json:30 → unblock + STT/TTS + new store build. L
  * **Semantic search:** no embedding column; Neon supports pgvector (no new infra). M — high JD signal, low user need at this scale.



* * *

## 04 · Architecture

One tool-calling agent whose tools _are_ your endpoints. The model routes and proposes; Postgres owns every number; a human confirms every critical write.

### 4.1 · Agent core — tools = your API, model emits a _delta_ not a number
    
    
    TOOLS = [
      {"name":"get_stats",            "endpoint":"GET /items/stats"},
      {"name":"list_needs_attention", "endpoint":"GET /items/needs-attention"},   # low + out-of-stock
      {"name":"list_critical_low",    "endpoint":"GET /items?isCritical=true ∩ low"}, # emergency-first
      {"name":"search_item",          "args":{"name"}, "endpoint":"GET /items?search="},
      {"name":"get_item_detail",      "args":{"item_id"}, "endpoint":"GET /items/{id}"},  # read qty+version
      {"name":"propose_stock_update", "args":{"item_id","delta:int","reason"}, "endpoint":"→ PROPOSAL (no write)"},
    ]
    
    # ★ Safety: the model emits a SIGNED DELTA, never an absolute quantity.
    # App reads the row, computes new_qty = max(0, current.quantity + delta), then the version-CAS write.
    # A hallucinated number can't corrupt stock — worst case is a wrong sign, caught on the confirm card.

user (Hinglish): "oxygen kitne bache hain?" └► Groq Llama 3.1 8B → search_item("oxygen") → GET /items?search=oxygen (answer from JSON, never memory) └► reply (on-screen list + TTS): "Oxygen: 2 units — LOW (min 10). ⚠ critical item." user: "add 5" └► Groq → propose_stock_update(item, delta=+5, reason="restocked") └► app: new_qty = max(0, 2+5) = 7, version=N → confirm card (critical item ⇒ confirm REQUIRED) └► user: yes → PATCH /items/{id}/stock → atomic CAS (items.py:552) + activity_log + audit_log

**Single agent with tools is enough** at this scale; the "multi-agent" view is just role separation (a cron _scanner_ , the conversational agent, a daily _reporter_) with narrow, least-privilege tool scopes.

### 4.2 · Free LLM strategy + failover

No local model on Render Starter

0.5 vCPU, no GPU → even a 2–3B model OOMs/starves the API. Inference lives in a **free cloud tier** ; Render just makes HTTP calls (`httpx` already a dependency). A truly local model would need an **external free CPU host** (Oracle Cloud Always-Free ARM) — simpler to just use the free cloud tiers.
    
    
    class LLMClient:                          # free-only, decorrelated vendors
        async def chat(self, *a, **k):
            try:    return await self.groq_llama31_8b(*a, **k)   # FREE: tool-calling, 14,400/day
            except (RateLimited, ServerError):
                return await self.gemini_flash(*a, **k)          # FREE failover: best Hinglish
        # if BOTH throttle → deterministic non-LLM reply rendered straight from /needs-attention,
        # so the app stays useful with ZERO LLM (tools are just the existing endpoints).

### 4.3 · Voice pipeline (free, on-device)

  * **STT:** on-device `expo-speech-recognition` (native engines, ₹0, audio never leaves the phone). For Hinglish-heavy users, optionally POST audio to free **Groq Whisper Large v3** or self-host **Whisper-Hindi2Hinglish-Swift**.
  * **TTS:** `expo-speech` reads the answer aloud (hi-IN/en-IN).
  * **The two human gates:** (1) **show the recognised text** ("You said: …" → edit/retry) before acting — STT misfires on medicine names + code-switching; (2) **confirm card** for any critical-stock change.
  * **Why voice is L:** app.json blocks `RECORD_AUDIO` today → unblocking it + STT/TTS + a new store build/review (permission changes can't ship via OTA). The text/WhatsApp agent delivers the same brain with zero new permissions — ship it first.



### 4.4 · WhatsApp channel (free reply bot + free push for proactive)
    
    
    POST /integrations/whatsapp/webhook        # Meta Cloud API → same agent core
      verify(signature)                        # Meta app-secret HMAC
      user_id = map_wa_id(payload.from)        # linked once via in-app "Connect WhatsApp"
      turn = run_agent(user_id, payload.text)  # inbound = FREE within 24h window
      → propose? send interactive buttons [✅ Confirm] [❌ Cancel]  (free reply)
      → else send the grounded answer + on-screen-style list

Message type| Cost| Channel choice  
---|---|---  
Answer a user query / confirm a change| FREE (24h window)| WhatsApp reply bot  
Proactive low-stock / expiry / critical alert| PAID template OR FREE| **In-app Expo push (free)** first; WhatsApp template only if user opts in  
Daily 8AM report| PAID template OR FREE| Free if the user opens the window (messages the bot); else opt-in template or email  
  
**Scheduling:** external cron (Render Cron / GitHub Actions) → a protected `/jobs/daily` endpoint — fires once regardless of worker count (an in-lifespan APScheduler double-fires across your 2 workers). **Event-driven critical-low alert:** a `BackgroundTask` from the stock-write (items.py:559) when a _critical_ item drops below minimum.

### 4.5 · Guardrails (the medical-safety spine) & LLMOps

Concern| Mitigation  
---|---  
Hallucinated quantities| LLM never emits numbers — selects items + proposes deltas; values from Postgres. "If no tool returned it, say you don't know."  
Mis-heard mutation ("50" vs "5")| Show STT text first; **confirm-before-write** for critical items (per NN/g, only for serious/irreversible actions — routine logging stays frictionless to avoid alert fatigue).  
PII through a free LLM tier| Send only item name + quantity; strip `user_id`/email/`supplier_contact`. (Free tiers may train on data.)  
Invalid writes| Agent writes only via the validated REST endpoints (quantity-check migrations) — never raw SQL.  
Rate-limit / outage| Groq→Gemini failover; deterministic non-LLM fallback from the DB.  
LLMOps| A golden **eval set** of ~50–100 real Hindi+English caregiver utterances → intent + delta-sign accuracy in CI; Sentry (already wired) for tool/LLM errors; per-turn cost/latency logging.  
  
* * *

## 05 · The home-ICU feature set — emergency vs routine

The research-backed design principle: **ABC-VED criticality**. Treat _Vital_ (emergency) items with zero-tolerance stock-out logic, separate from routine items — and your data model **already has`is_critical`** as the "V". These are the features that make CareKosh genuinely useful and unique.

The organising idea — ABC-VED, simplified for your app

**VED** = clinical criticality: **V** ital (oxygen, suction catheters, trach tubes — patient can't wait), **E** ssential, **D** esirable. **ABC** = consumption value. You already tag **V** via `is_critical`. The rule: a Vital item that's low is a _red, zero-tolerance_ event regardless of price; a routine item that's low is a gentle nudge. Every feature below keys off this split.

Source: [ABC-VED matrix (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4922040/) · [NN/g — confirm only for serious actions](https://www.nngroup.com/articles/confirmation-dialog/)

#### ① Criticality-aware low-stock alerts (the headline)

uses GET /items?isCritical + /needs-attention · in-app push (free) + WhatsApp (opt-in)

A _critical_ item at/below minimum fires a **red, immediate** alert (in-app overlay + push, optionally WhatsApp); a routine item rolls into the daily digest. Critical items can carry a stricter buffer (e.g. alert at 150% of min, not 100%). Event-driven from the stock-write — instant, not polled. 

#### ② Voice query → spoken + on-screen list

expo-speech-recognition + Groq + expo-speech · "what's low?" / "kya khatam hua?"

Tap-to-talk → "What's running low?" → the app **displays the list** (critical items pinned top, red) **and speaks a summary** : "3 need attention — Oxygen at 2 is critical, plus Gauze and Saline." Hands-free for a caregiver mid-care. The exact flow you described. 

#### ③ Reorder reminders with selective confirm

stale + low detection · "Tap to confirm Oxygen is still at 2"

A daily check nudges: **"Oxygen hasn't changed in 4 days and shows 2 — still correct? Tap to verify or reorder."** Confirmation is reserved for **critical** items (NN/g: over-confirming routine actions causes fatigue). Confirm → log; or one-tap "create order" → your existing orders flow. 

#### ④ Expiry watch (you already store `expiry_date`)

new GET /items/expiring?days=N · in-app + digest

Surfaces items expiring in N days — critical items flagged earlier/louder. Pure win: the data's already there, no model needed; the LLM just verbalises it on request. 

#### ⑤ Stock-sync audit (digital vs physical drift)

stale-item detection + guided check · the #1 real problem no app solves

Periodically asks you to verify items that haven't moved — a quick guided "is this count still right?" walk, scoped to stale/critical items (not all 33). Keeps the app's numbers honest, which is what makes every other feature trustworthy. (Pre-req: the `updated_at` fix in §03.) 

#### ⑥ Daily 8AM digest (multi-channel)

GET /items/stats + needs-attention · in-app + email (free) + WhatsApp (opt-in)

Stock-health %, critical alerts, low-stock list — free via in-app/email; WhatsApp delivery is the opt-in template. The "morning report" you pictured, criticality-sorted. 

**Deliberately deferred (low value / high cost now):** heavy usage-trend ML / anomaly detection (needs months of history first), and a full 33-item voice survey (scope to stale/critical instead).

* * *

## 06 · The weekend MVP that proves it

A WhatsApp reply bot + a single FastAPI route running a Groq function-calling loop over 4 tools, with confirm-before-write on critical items. ₹0, no new infra, no store build.

user (WhatsApp): "kya kya low hai?" └► Groq Llama 3.1 8B → list_needs_attention() → GET /items/needs-attention (free inbound) └► bot: "⚠ Oxygen 2 (critical), Gauze 3, Saline 1 need attention." user: "add 5 oxygen" └► Groq → propose_stock_update(oxygen, delta=+5) → app: 2+5=7, version=N └► CRITICAL item ⇒ bot sends buttons: [✅ Set 2→7] [❌ Cancel] (free reply) └► tap ✅ → PATCH /items/{id}/stock → atomic CAS + activity_log + audit_log └► bot: "Done. Oxygen now 7."

Why this is the right MVP

Touches everything real — NL understanding, tool routing, a guarded critical-item mutation, your existing CAS + audit trail — for **₹0** (Groq free + WhatsApp _inbound_ free + existing backend). Hinglish from day one (the chat text is the transcript, so STT risk is sidestepped). Voice (§04.3) reuses the exact same agent later — you build the brain once and add ears/mouth on top.

* * *

## 07 · Cost — what's free vs not

Layer| Free path| When you'd pay  
---|---|---  
LLM| Groq free (14,400/day) + Gemini Flash free failover| Only if you exceed free RPM/RPD or need a no-train tier for PII → ~₹80–800/mo  
STT / TTS| on-device expo-speech + expo-speech-recognition (₹0) / Groq Whisper free| Never, at this scale  
Embeddings + vector| local e5-small + pgvector on Neon| Never  
In-app push| Expo Push (₹0)| Never  
WhatsApp — inbound replies| **Free** within 24h window| Never  
WhatsApp — **proactive** alerts/reports| **Avoid via in-app push (free)**|  Per-template (a few paise/msg) if you opt to push via WhatsApp  
Email| existing Brevo free tier| Never, at this scale  
Self-hosted LLM (optional)| Oracle Cloud Always-Free ARM (CPU)| A real GPU box only if PII compliance ever mandates on-prem  
  
**Bottom line:** the entire voice + WhatsApp-reply + in-app-alert experience is **~₹0/month**. The only optional cost is pushing _proactive_ alerts _over WhatsApp specifically_ — and free in-app push removes even that.

* * *

## 08 · Risk register

Risk| Sev| Mitigation  
---|---|---  
Medical hallucination (invented item/qty)| **Critical**|  LLM answers only from tool JSON; never states stock from memory.  
Mis-heard critical mutation| **Critical**|  Show STT text → confirm-before-write on critical items → version-CAS + audit.  
Alert fatigue on routine items| High| NN/g: confirm/alert loudly only for _critical_ items; routine → daily digest.  
WhatsApp proactive cost creep| Medium| Default proactive to free in-app push; WhatsApp templates only on explicit opt-in.  
Hinglish STT/intent errors| High| Always surface transcript; fixed tool-enum function-calling; Gemini/Groq handle Hinglish; optional Whisper-Hinglish model.  
Free-tier rate limits| Medium| Groq→Gemini→Cloudflare failover; cache the daily report; DB-rendered fallback.  
PII to free LLM tier| **High**|  Strip identity/contact; send only item+qty; graduate to a no-train tier before scaling.  
Render can't host a model| High| Never run inference on Render; cloud free tier only (or Oracle Always-Free for self-host).  
Meta business verification friction| Medium| Plan it early; ship voice + in-app first so WhatsApp isn't on the critical path.  
  
* * *

## 09 · Adobe SDE-2 (Python & Gen AI) — skill map & interview plan

This project demonstrates 7/9 Gen-AI "Preferred Quals" with a real, deployed, medical system — but the JD gates on DSA + system design first.

JD keyword| CareKosh demonstration  
---|---  
**RAG**|  NL bot grounds answers in live `/needs-attention` \+ `/stats` rows — numbers from Postgres, not the model.  
**Agentic RAG**|  NL → intent → tool-calls → confirm-before-write → atomic endpoint → read back.  
**Multi-agent**|  Scanner (cron) + conversational + reporter roles, least-privilege tool scopes.  
**Vector DB / embeddings / semantic search**|  pgvector on existing Neon; multilingual embeddings bridge "oxygen" ↔ "O2 concentrator" ↔ Hindi terms.  
**AI orchestration**|  Typed intent→tool→confirm state machine (mappable to LangGraph).  
**Production AI deployment**|  Live on api.carekosh.com — user-scoped, rate-limited, audited, on a no-GPU host (forces the free-model design).  
**LLMOps**|  Multilingual eval set, guardrails, ~₹0 cost SLO, Groq→Gemini failover.  
  
The killer talking point — mutation safety on a medical app

"The agent never emits a number — it proposes a signed delta; the value is read from and written to Postgres through my atomic version-CAS endpoint, and any _critical_ -item change needs explicit confirmation. So 'hallucination → bad write' is bounded by grounding + confirm + optimistic locking + audit. And it runs at ~₹0 on a no-GPU box, which is exactly why I designed around free tool-calling tiers instead of a big model."

⚠️ The gate & the trap

2–3 DSA rounds + a system-design round happen **before** anyone opens your project. Blunt split: **~45% DSA · 15% system design · 30% AI build (capped at the WhatsApp agent + pgvector) · 10% behavioral.** The #1 elimination risk is polishing a fun voice demo and getting cut on a DP/graph problem. Your hardened backend (atomic CAS, optimistic locking, Neon pooling, statement timeout, rate limiting) **is** your system-design script — whiteboard the stock-update CAS from memory.

* * *

## 10 · Job-market alignment — framework & tooling choices

The plan is architecturally complete. This section names the _recognised frameworks/tools_ to build it _with_ , so the project also clears recruiter/ATS keyword filters on the 5 target roles (Codvo "RAG + Agentic", Drillo "RAG & LangChain", Sarvam voice, Joveo LLM, CG-VAK RAG & LLM).

The principle — substance-first, keywords-on-top

A **deployed, production** agentic system with **mutation guardrails on medical data** is rarer and stronger than any framework keyword — most applicants only have a notebook RAG demo. These choices don't change the product; they make your real work **legible to filters** and current with 2026 trends. **Add the labels on top of the substance — never drop the substance to chase labels.**

### Map: what you're already building → name it with → keyword unlocked

You're building| Build it with| JD keyword unlocked| Effort  
---|---|---|---  
The intent → tool → confirm agent loop (§04.1)| **LangGraph** `StateGraph` (nodes = your tool calls; edges = the confirm gate)| "LangChain / LangGraph / AI orchestration" — **the #1 filtered keyword**|  S  
The 6 inventory tools (get_stats, needs_attention, search, propose_update…)| Expose them as an **MCP server** (Python `mcp` SDK) the agent connects to| "Model Context Protocol (MCP)" — **the 2026 hot trend; almost no applicant has shipped one**|  S–M  
The eval set + per-turn logging (§04.5)| **Langfuse** (free, self-hostable) for tracing + **Ragas** for RAG-answer eval| "LLMOps / evals / observability"| S  
The chat/voice reply| **Token streaming** (SSE) so the answer renders/speaks as it generates| "streaming LLM responses / production AI"| S  
Semantic search over items| Already: **pgvector** on Neon + `multilingual-e5-small` embeddings| "vector DB / embeddings / semantic search" — ✅ **already covered**|  —  
_(Optional, portfolio-only)_ a true multi-agent flow| One **CrewAI** or LangGraph multi-node flow — e.g. _planner → executor_ for the inspection survey| "multi-agent / CrewAI / AutoGen"| M  
Fine-tuning| **Talk, don't build.** Know _why RAG + tool-calling beats fine-tuning_ for a small, fast-changing inventory (freshness, cost, no GPU)| "fine-tuning tradeoffs" — an interview answer, not a build| —  
  
The résumé bullet you can write — truthfully — after V2.1

**Production agentic-AI assistant (LangGraph)** over a **FastAPI** service exposed as an **MCP server** ; **RAG** with **pgvector** semantic search; multilingual **Hindi-English voice + WhatsApp** ; **confirm-before-write guardrails** on atomic, optimistically-locked writes; **Langfuse** tracing + **Ragas** evals; ~₹0 on free LLM tiers (Groq/Gemini) with vendor failover.

Every bold token is a JD keyword _and_ a thing you actually shipped — that combination is what most applicants can't claim.

The boundary (don't forget §09)

These additions make the project a near-perfect **portfolio** match and win the project-deep-dive round — they do **not** bypass the DSA + system-design screens that _gate_ every one of these roles. Keep DSA at ~45–55%; build the agent with LangGraph + MCP + Langfuse; rehearse the §09 mutation-safety pitch.

### Where these land in the roadmap

  * **V2.0 (MVP):** build the agent on **LangGraph** from the start (same effort as hand-rolled, instant keyword) + **Langfuse** tracing.
  * **V2.1:** wrap the tools as an **MCP server** ; add **Ragas** evals + token streaming; pgvector semantic search.
  * **Portfolio polish:** one **CrewAI** multi-agent demo for the inspection survey, purely for the keyword + the "when is multi-agent worth it" answer.

Keyword sources: the 5 live JDs (Codvo, Drillo, Joveo, Sarvam, CG-VAK) consistently list LangChain/LangGraph, vector DBs, FastAPI, RAG, agentic frameworks (CrewAI/AutoGen/LangGraph), and one names MCP.

* * *

## 11 · Roadmap & what to do now

Phase| Trigger| Ships| Effort  
---|---|---|---  
**V1 (shipped)**|  —| Inventory, stats, orders, audit, hardened backend| —  
**V2.0 — Agentic MVP**|  Play Store launch + ~50 active users| WhatsApp reply bot (Groq free) + 4 tools + confirm-on-critical + in-app push low-stock alerts + daily digest| S–M  
**V2.1 — Criticality + expiry + semantic**|  V2.0 used + retention| Criticality-aware alerts (ABC-VED), expiry watch, stock-sync audit, pgvector semantic search| M  
**V3 — Voice + RAG**|  Engaged cohort| On-device voice (STT→text→confirm→TTS), RAG over notes/history, optional WhatsApp proactive templates| L  
  
  1. **Now:** nothing AI — finish the launch (AAB → closed test → production).
  2. **At ~50 users:** build the §06 WhatsApp MVP (₹0, ~1 weekend). One backend pre-req: verify/fix `updated_at` bumping before the staleness/audit features.
  3. **For Adobe:** keep DSA ~45–55%; build only the WhatsApp agent + pgvector; rehearse the §09 pitch.
  4. **Plan WhatsApp verification early** (Meta business verification has lead time) but keep it off the critical path — voice + in-app deliver the same brain without it.



One-line verdict

A free voice + WhatsApp AI layer is genuinely feasible (~₹0), ~70% already in your backend, and your `is_critical` tag makes the emergency-vs-routine intelligence almost free to build. Ship the foundation first, build the WhatsApp agentic MVP after traction, default proactive alerts to free in-app push, and let voice + criticality be the unique, genuinely-useful differentiator — for caregivers and for the Adobe room.

CareKosh — Free Voice + WhatsApp AI · web-researched (2025–2026 free-tier facts, adversarially verified) + code-grounded · WhatsApp-only, free-LLM-only · forward-looking V2+ (foundation ships first) · 2026-06 
