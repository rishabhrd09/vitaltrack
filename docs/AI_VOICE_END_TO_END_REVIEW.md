# CareKosh AI voice assistant — end-to-end review (13 October 2026)

**Scope.** This review covers the whole assistant path:

- voice and typed questions, through understanding and the stock answer;
- the answer sheet and spoken replies, including Sarvam;
- local order drafts and the touch-confirmed order with its PDF.

It also records what was changed on 13 October 2026, the evidence for each change, and what is still open.

**State reviewed.** Branch `feature/backend-hardening-ai-voice-agent-foundation` at `4bd1dff`, plus uncommitted work in the main checkout. Nothing was committed, pushed or deployed. No live database was used. No paid API call was made.

**Evidence labels** (same as the 7 October documentation audit):

- **VERIFIED IN CURRENT CODE**: read in the source at the line given.
- **VERIFIED BY REPRODUCED TEST**: a test in this repository shows it, and it passed on 13 October 2026.
- **NOT VERIFIED**: needs a phone, a live provider or the deployed service.

## Decisions at a glance

| Question | Decision | Why |
|---|---|---|
| Ready for **staging testing**? | **Use the current follow-up results in §16 before deployment.** | Earlier dated counts describe their original candidates. Section 16 records the current reviewed follow-up after `973d2e9`. Deploy the reviewed backend and new APK for staging acceptance; Sarvam retains its existing key/consent configuration. No route or migration is added by this follow-up. |
| Ready for **production**? | **No, pending live acceptance and operator setup.** | Verify the new APK on the OnePlus, real Groq interpretation and real Sarvam decoding/playback, plus the production deployment/privacy controls. Public third-party personal-key use needs a permitted provider arrangement (§4.3). Alba remains a separate experimental gate; keeping it paused does not block verified device/Sarvam speech. |

**Status note (15 October 2026).** The first implementation of V-8 … V-45 is recorded in [§14](#14-october-follow-up-audit-and-fixes). Independent verification then found regressions despite passing suites. The repairs, remaining limits and fresh checks are in [§15](#15-independent-verification-follow-up). Nothing has been committed, pushed or deployed. Alba and Kokoro remain diagnostics-only; Sarvam still needs the operator's staging configuration.

## 1. Trace map

Line numbers are for the working tree on 13 October 2026. All paths are relative to the repository root.

### 1.1 Spoken question to spoken answer

1. **Microphone permission and capture.**
   - `startRecording` asks for permission, waits until CareKosh is back in the foreground, and sets the audio mode to "do not mix" (`vitaltrack-mobile/components/assistant/AssistantExperience.tsx:730`).
   - `MicrophoneCapture.start` begins the recording (`vitaltrack-mobile/features/assistant/capture.ts:38`).
   - A 28-second timer stops the recording.
2. **Live words while speaking.** The native live recorder sends partial transcripts. The "Ask Care Coach" dock shows them only while recording (`vitaltrack-mobile/components/assistant/AssistantDock.tsx:60`).
3. **Final transcript.** `stopRecording` (`AssistantExperience.tsx:699`) calls one of two sources:
   - Moonshine on the phone (`vitaltrack-mobile/features/assistant/offlineVoice.ts:105`);
   - with the separate `groq_audio` consent, Groq Whisper through `POST /api/v1/ai/transcribe`.

   A failed online transcript is never replaced by an offline one. The temporary recording is deleted in `finally`.
4. **Editable transcript and explicit Send.** The transcript goes into the text box. Nothing is understood or fetched until Send is tapped.
5. **Understanding.** `ask()` (`AssistantExperience.tsx:526`) first tries the phone (`routeLocally`, `vitaltrack-mobile/features/assistant/queries.ts`), in this order:
   - an exact item read;
   - draft follow-ups;
   - the complete version 3 inventory/complex-draft grammar (`parsePlan`);
   - the version 2 grammar for compatible simple requests;
   - the legacy phrases.

   Only unmatched text goes online, after this account chose Groq understanding and the server confirms `groq_text` consent. Contract 3 is preferred. Basic requests can use an older contract; detected advanced conditions that the server cannot represent ask for a backend update instead. Local version 3 plans do not need cloud interpretation support.
6. **Validated plan.** Every answer from Groq is checked against the strict contract twice: on the server (`vitaltrack-backend/app/schemas/ai.py`, then `ground_plan` in `app/services/ai_provider.py:234`) and on the phone (`validatePlan`, `vitaltrack-mobile/features/assistant/contracts.ts:115`). `ai_plan_grounding.py` also checks detectable missing/invented conditions, polarity, grouping and quantity-to-item association. Version 2 answers are upgraded with the same meaning (`toPlan`). These checks cannot certify arbitrary language.
7. **Owner-scoped, complete snapshot.** `inventorySnapshot` (`vitaltrack-mobile/features/assistant/snapshot.ts:28`) fetches the signed-in account's full item list. A cache counts only if it was stamped for this session and has not been invalidated. While stock edits are still saving, it refuses to answer. Offline answers are marked "Last known".
8. **Deterministic execution.** `evaluateSelection` (`vitaltrack-mobile/features/assistant/selection.ts:176`) filters, explains and sorts the rows on the phone. Drafts use `prepareDraftResult` (`vitaltrack-mobile/features/assistant/drafts.ts:65`). No model output is ever executed as code or as an ID.
9. **Answer sheet.** The overlay shows:
   - the filters as applied;
   - counts;
   - a table with item, quantity with unit, and status as an icon plus text;
   - a "Why" line on every row;
   - expandable recorded details (`vitaltrack-mobile/components/assistant/AnswerList.tsx`).
10. **Narration.** `playAnswer` (`AssistantExperience.tsx:373`) reads the short answer text with the chosen voice:
    - **Device voice** speaks on the phone.
    - **Sarvam** sends only the answer text to `POST /api/v1/ai/speak`. The server checks the WAV, and the clip plays in a player made for that reply (`vitaltrack-mobile/features/assistant/cloudSpeech.ts:33-108`). The temporary file is deleted in `finally`.
    - **Offline fallback**, if you opted in, reads the same text once when Sarvam fails before playback has started (`narrateWithFallback`). Detected partial playback suppresses fallback, even if an error arrives without a `playing=true` sample.

### 1.2 Typed question

A typed question uses the same `ask()` path from step 5 onwards. Typing never starts the microphone or a speech model (VERIFIED BY REPRODUCED TEST: `vitaltrack-mobile/tests/assistant-inline.test.cjs`, "typed compound query …").

### 1.3 Draft to saved order and PDF

1. The assistant only writes the **in-memory, session-scoped draft** (`writeDraft`, `drafts.ts`). The draft is cleared on logout, on an account change and on app restart.
2. "Review unsaved order draft" opens Create Order. The assistant imports no order-save service.
3. The **only** commit point is the touch confirmation on Create Order (`generatePDF`, `vitaltrack-mobile/app/order/create.tsx:208`). It works in four steps:
   - it re-reads the inventory and asks you to review again if anything changed;
   - `beginSubmission` (`drafts.ts:146`) fixes one `localId`;
   - `createOrderMutation.mutateAsync` (`create.tsx:263`) sends the authenticated `POST /api/v1/orders`;
   - the server returns the existing order for a repeated `localId` (`vitaltrack-backend/app/api/v1/orders.py:279`, `_find_order_by_local_id` at `:159`).
4. The PDF is built from the **order the server returned** (`create.tsx:268`). A re-export uses the same saved order.

### 1.4 Where the server may write, and where it never does

| Route | May write | Never writes |
|---|---|---|
| `GET /ai/capabilities` | nothing | — |
| `PUT /ai/consent` | `ai_consents` (this account) | inventory, categories, orders, activity, audit |
| `POST /ai/interpret`, `/ai/transcribe`, `/ai/speak` | `ai_usage` (reserve, then settle) | inventory, categories, orders, order items, activity, audit |
| `PUT/DELETE /ai/sarvam-key` | `ai_sarvam_credentials` (encrypted) | the same business tables |
| `POST /auth/*` | authentication records | — |
| `POST /orders` | order, order-item and associated activity/audit records through the authenticated order API | No assistant dispatcher exposes this route; the app invokes it from touch review (§1.3). The server authenticates API callers; it does not prove a physical touch occurred. |

**VERIFIED BY REPRODUCED TEST.** The test `vitaltrack-backend/tests/test_voice_plans.py::test_v3_route_captures_one_text_request_and_writes_no_business_data` runs on a migrated PostgreSQL 16 database. It compares serialized rows in six business tables, their counts, and item quantity/version totals before and after interpretation. Rejected hostile output is checked too. A successful interpretation adds only a usage row:

| | items | categories | orders | order items | activity | audit | Σ quantity | Σ version | `ai_usage` |
|---|---|---|---|---|---|---|---|---|---|
| before | 4 | 2 | 0 | 0 | 8 | 4 | 3 | 4 | 0 |
| after | 4 | 2 | 0 | 0 | 8 | 4 | 3 | 4 | 1 |

### 1.5 Groq is not Grok

"Groq" here is Groq Inc.'s hosted inference API at `api.groq.com`. The model is `openai/gpt-oss-20b` for understanding and `whisper-large-v3` for transcription. It has nothing to do with xAI's Grok model.

## 2. Contract version 3: multi-part requests

### 2.1 Why a new version

Version 2 could not represent:

- quantity comparisons;
- critical equipment;
- exclusions;
- priority sorting;
- a draft made from a filtered or previous list.

Its prompt asked Groq to answer "clarify" for these, but nothing on the server could detect a dropped condition. A model that ignored the prompt could, for example, drop "critical" and draft every low item. Version 2's schema and transport are unchanged (VERIFIED BY REPRODUCED TEST: `test_v2_contract_is_unchanged`). The follow-up also rejects signed or fractional amounts that its normalization cannot preserve.

### 2.2 Shape and meaning

![Contract 3: a request becomes a validated plan, then deterministic rows. Each group is an AND of conditions, groups are unioned, exclusions are removed, and rows are sorted; answers show filters and reasons, drafts show Explicit and Suggested quantities, and unclear requests ask first. Below, Voice setup keeps readiness, the saved choice, consent and the provider in use apart.](diagrams/voice-plan.svg "How a multi-part request becomes rows")

```text
Plan     = { version: 3, intent, selection | null, draft | null, clarify_reason | null }
Selection= { scope: inventory | previous, any_of: Condition[1..6], exclude: Condition[0..6],
             sort: none | name | quantity_asc | quantity_desc | shortfall | priority }
Condition= { item_queries[], stock[] (low, out, in_stock, below_minimum),
             quantity[0..2] (lt, lte, eq, gte, gt), critical: true | false | null,
             category, supplier, brand, missing_supplier }
Draft    = { mode: new | edit, lines[0..100], include_selection }
Line     = { operation: set | add | remove, target: named | previous, item_query, quantity, unit }
```

The rows are worked out in this order:

1. Start from **all active items**, or from the **previous list** when `scope` is `previous`. Previous rows are re-read from the fresh snapshot.
2. Each `any_of` group is an **AND** of its fields. A list inside one field (`stock`, `item_queries`) is an **OR**.
3. Take the **union** of the groups. Each item appears **once**, by item ID, keeping every reason it matched.
4. Remove every row that matches **any exclusion**. The removed rows are listed in the answer.
5. Sort the rows.

Draft lines with a quantity take priority over calculated suggestions. If an explicit line also matches an exclusion, the whole proposal asks for clarification before any draft change. A contradictory exclusion is never silently ignored.

### 2.3 Negotiation

- `GET /ai/capabilities` now reports `interpret_contracts: [1, 2, 3]` (`vitaltrack-backend/app/api/v1/ai.py:62`).
- The new app requests cloud contract 3 only when the server lists it. Supported basic requests retain legacy compatibility. An unmatched advanced request that needs contract 3 asks for a backend update or clarification instead of dropping its conditions into contract 2 or 1. Locally parsed v3 plans can run independently of the server's interpretation version.
- APKs that send no version still get the version 1 intent.

All of this is VERIFIED BY REPRODUCED TEST ("version 3 is requested only from servers that list it …").

### 2.4 Server checks on Groq's answer (`ground_plan`)

A plan is rejected (HTTP 502, nothing executed) when its strict schema or deterministic grounding checks fail. Those checks validate explicit names, numbers and supported condition associations; they do not prove every possible natural-language interpretation is correct:

- every **name** (item, category, supplier, brand, unit) appears as words in the question;
- every **comparison** is said with its own wording next to its number: "at most 3" cannot become "less than 3";
- every **exclusion** has an exclusion word ("excluding", "except", "other than", …) at most eight words before it, so a requested item can never be turned into an exclusion;
- every **draft quantity** is bound to its item the same way as in version 2;
- **critical** and **missing supplier** are only accepted when the question says so;
- **previous-list references** are only accepted when the phone reported context.

These checks are VERIFIED BY REPRODUCED TEST: 20 accepted and rejected cases in `test_v3_parameters_are_grounded_in_reviewed_text`.

### 2.5 How the phone executes a plan

- **Stock states** use the same rules as the dashboard and Create Order (`isLowStock`, `isOutOfStock`; `vitaltrack-mobile/types/index.ts:113-152`).
- **Critical** means *critical equipment*: the item is marked critical (★) or its name matches a critical-equipment rule such as "ventilator" or "ambu bag" (`types/index.ts:90-103`). Each row says which rule applied. If one of your categories has "critical" in its name, the app asks which you meant before running anything (`criticalMeaning`, `selection.ts:86`).
- **"What should I order now"** means "low or out of stock", sorted in this order:
  1. out of stock first;
  2. then critical equipment;
  3. then the largest share of the minimum that is missing;
  4. then the largest shortfall;
  5. then the name.

  The filter line states this rule, and every row has a reason, such as "Low stock · critical equipment with 1 left".
- **Names are never guessed.**
  - A near spelling, or one name that matches several items, asks you to choose.
  - A supplier or category said only in part offers the recorded names that contain every word you said.
  - Extra words are never dropped: "wound care that we used last week" is not shortened to "Wound care".
  - An exclusion term that matches no item asks you to choose or rephrase.
- **Follow-ups narrow the list on screen.** Examples: "only the critical ones", "exclude masks", "sort them alphabetically", "create a draft from those". The chain is re-run on fresh stock and is limited to six steps. The one-tap refinement chips appear only when they would change the list.

### 2.6 Drafts

- **Explicit or Suggested.**
  - A quantity from your request is labelled **Explicit · Your request**.
  - A calculated one is labelled **Suggested** with its basis, for example "brings stock from 2 to its minimum of 5" or "1 backup for critical equipment".
  - A quantity edited on Create Order is labelled **Edited**.
- **Add or set.** "Add five more" adds to the line in focus; it needs an open draft. "Set the draft quantity to five" replaces it. If several lines could be meant, you choose one first.
- **Merge, replace or cancel.** A new voice draft never silently changes a manual draft or a draft that has edits. You choose Merge, Replace or Cancel, and a merge refuses to combine two different quantities.
- **Missing minimums.** Items with no minimum stock are listed together in one clarification. Nothing is changed.

### 2.7 Before and after

Baseline: the parser files at `4bd1dff`, which were unchanged in the working tree before this work. Reproduce with the same phrases against both versions.

| Request | Before (on the phone) | After (on the phone) |
|---|---|---|
| How many items have quantity less than 3? Show their names, quantities and status. | not understood | query: quantity < 3 |
| Show items with at most / exactly / more than three remaining | not understood | query: ≤ 3 / = 3 / > 3 |
| Show items below 3 and also all low-stock or out-of-stock items; prepare an order draft for them. | not understood | draft: (quantity < 3) ∪ (low or out) |
| Prepare a draft for critical items that are low or out of stock. | not understood | draft: critical **and** (low or out) |
| Two units of Ambu Bag, plus the other low-stock and out-of-stock items; prepare an order draft. | not understood | draft: Ambu Bag 2 units + (low or out) |
| Which stocks should I consider ordering now? Show why each appears in the list. | not understood | query: low or out, priority order |
| Low-stock wound-care items from supplier Good Supplier, excluding gloves, sorted alphabetically. | not understood | query: low **and** Wound care **and** supplier, minus "gloves", A–Z |
| Only the critical ones · Exclude masks · Create a draft from those | not understood | follow-ups on the previous list |
| Add five more (with a draft open) | refused as a stock edit | draft edit: +5 to the line in focus |
| Set the draft quantity to five | asked for an item called "the draft quantity" | draft edit: set the line in focus to 5 |

"Not understood" means the request went to Groq if you had enabled it, otherwise the app said it needs online understanding. Version 2 had no field for most of these conditions.

## 3. Safety boundary

The boundary is enforced in code, not only in prompts:

- **Nothing to call.** The contract has no save, update or send operation, and no tool, URL or ID field. Unknown fields fail validation on both the server and the phone. The model gets no `tools` parameter.
- **No inventory snapshot goes out.** The interpret request contains only the reviewed question and one boolean. The question itself can include the item names or quantities the person said. VERIFIED BY REPRODUCED TEST, with the HTTP request captured at the transport:
  - exactly one `POST https://api.groq.com/openai/v1/chat/completions`;
  - redirects off and environment proxies ignored;
  - no item, category or other-account name in the body.
- **Imports.** The phone executor and planner import no service, storage or network module (VERIFIED BY REPRODUCED TEST: a source import check).
- **Hostile input fails safe.**
  - Prompt injection in a question, names or suppliers, SQL text, URLs and tool names are all treated as data.
  - Extra fields, invented names, a requested item moved into an exclusion, or a follow-up without context all fail closed with 502.
  - The usage row is settled as "failed", and no business table changes (`test_v3_route_fails_closed_on_hostile_model_output`).
- **Drafts only.** "Create an order" prepares a local unsaved draft. "… and confirm it", "mark it received", "send it to the supplier" and "delete …" are refused. Only the Create Order touch confirmation saves, and a repeated `localId` returns the same order.

## 4. Sarvam review against current Sarvam documentation

The Sarvam documentation and legal pages were read on 13 October 2026. The raw OpenAPI file returned 404, so each enum was confirmed in two separate documentation pages. No Sarvam API call was made.

### 4.1 What matches (VERIFIED IN CURRENT CODE)

- **Endpoint and authentication.**
  - `POST https://api.sarvam.ai/text-to-speech` with the header `api-subscription-key`.
  - Model `bulbul:v3` (default) or `bulbul:v4-flash`, each with an allow-listed English speaker:
    - v3: `ritu`;
    - v4-flash: `aparna_en_companion` and three other reviewed voices.
  - `language_code` is fixed at `en-IN`.
- **Request fields.**
  - Text is 1–640 characters (Sarvam allows 2,500).
  - Pace is 0.9, 1.0 or 1.1, inside Sarvam's 0.5–2.0.
  - `speech_sample_rate` is 24000, `output_audio_codec` is `wav`, and `temperature` is 0.3.
  - `pitch`, `loudness` and preprocessing are not sent. Sarvam's own pages disagree about them.
- **Response.**
  - Exactly one base64 clip.
  - Strict decoding.
  - Mono 16-bit PCM, 8–48 kHz, at most 80 s.
  - A clip that is effectively silent is rejected.
- **Personal keys.**
  - The key is encrypted with an envelope bound to the owner.
  - It is never returned or logged.
  - A missing or unreadable personal key fails with 409/503 and **never** falls back to the shared account (tested).
  - One request is in flight per account, with daily request and budget limits.

### 4.2 Findings and fixes

| # | Finding | Severity | Status |
|---|---|---|---|
| S-1 | A revoked key, exhausted credits and Sarvam's rate limit all showed up as "provider unavailable" or "busy, retry in 30 s". Credits can run out as 402 or as 429 `insufficient_quota_error`. | Medium–High (personal keys) | **Fixed.** `sarvam_failure` (`ai_provider.py:618`) maps them. A rejected key returns 409 for a personal key (replace it in Voice setup) or 503 for the shared account. No credits returns 402. Busy returns 429 with `Retry-After`. A bad request returns 502. The log records only the status, Sarvam's error code and `request_id`, never the key or the text. There is still no retry and no key switch. Tested through the real HTTP adapter. |
| S-2 | The 4 MB response cap allowed only about 62 s of audio, below the 80 s duration check, so a long reply could be billed and then rejected. | Low | **Fixed.** The Sarvam cap is 5.2 MB (80 s at 24 kHz, base64, plus the envelope). Tested with a 70 s clip, plus an oversized response. |
| S-3 | The internal per-reply allowance was increased from 20,000 to 25,000 units. | Low | **Changed.** This is a conservative application quota, not a live currency conversion or guaranteed provider invoice cap. With the default 100,000/account budget, at most four Sarvam attempts fit before other AI usage. Render may override it. |
| S-4 | With Sentry enabled, its default settings would add trace and baggage headers to outbound calls, including to Sarvam and Groq. | Low (privacy) | **Fixed.** `trace_propagation_targets=[]` (`vitaltrack-backend/app/main.py:54`). Verified against sentry-sdk 2.20. |
| S-5 | CI ran `pytest tests/` only, so the 23 Sarvam unit tests in `unit_tests/` never ran in CI. | Medium (test gap) | **Fixed.** `.github/workflows/ci.yml` now runs `tests/ unit_tests/`. |
| S-6 | Sarvam documents WAV/base64 output, but not a guaranteed channel count or PCM bit depth. Automated tests use synthetic PCM16 mono WAV. | Medium (compatibility) | **NOT VERIFIED live.** An authorised real call must verify the implementation's decoding assumptions and actual phone playback (§4.4). [REST response contract](https://docs.sarvam.ai/api-reference/text-to-speech/convert). |
| S-7 | Sarvam's pages disagree about retention and training defaults. The consent text does not mention retention, training or transfer abroad. | Medium | **Operator setup and disclosure review.** Configure the workspace's **Model APIs** retention override to 0 days and disable training in **Organisation → General**. Review consent wording before production; changes require a new consent version. These controls do not establish another user's workspace policy. |
| S-8 | General terms §3.2 restrict third-party credential disclosure; applicable product agreements can take precedence. No specific permission for CareKosh's third-party personal-key proxy was established. | Medium (deployment) | Keep public third-party BYOK disabled pending a permitted arrangement. An operator using its own key on its own backend is a separate documented API integration. [Terms](https://www.sarvam.ai/terms-of-service). |
| S-9 | `ritu` is valid, but Sarvam's own guide recommends `ishita` or `ratan` for v3 English. | Low (quality) | Owner listening test. Set `SARVAM_SPEAKER` to change it. |
| S-10 | The two v4-flash pages disagree about `temperature`. | Low | Applies only if `SARVAM_TTS_MODEL=bulbul:v4-flash`. Check with one real call before switching. |
| S-11 | A revoked personal key still reports `usable: true` in capabilities, because "usable" only means "can be decrypted". | Low | The first failed request now says exactly what is wrong. Not tracking a "rejected" state avoids a migration. |

### 4.3 Pricing, credits and data handling (from Sarvam's pages; owner to confirm)

- **Price.** Bulbul v3 costs ₹30 per 10,000 characters. No price is published for v4-flash.
- **Credits.** New accounts get ₹100 of free credit. Credits are shared across a whole organisation. Sarvam's terms say free credits may have conditions or expire, while other pages say they never expire.
- **Data location.** Data is processed in India but may be transferred abroad. Workspace retention and organisation training controls are separate (see S-7).
- **Commercial use.** Generated audio may be used commercially.

For the first pilot, use the operator's `SARVAM_API_KEY` on its own staging backend and leave `AI_SARVAM_BYOK_ENABLED=false`. The personal-key implementation remains encrypted, isolated and gated; this code review does not approve disclosure of another customer's credentials. Workspace data retention and organisation training controls are separate. Review [Model API retention](https://docs.sarvam.ai/api/platform/data-retention) and the [organisation training setting](https://docs.sarvam.ai/api/platform/faq). Controls for the operator's workspace do not establish the settings of a personal-key user's workspace.

### 4.4 Render and live checks (manual; no authenticated access was used)

1. In the Render dashboard for the **staging** backend, check these variables:
   - `AI_ENABLED`, `AI_SPEECH_ENABLED`, `AI_SARVAM_ENABLED`, `AI_SARVAM_DATA_CONTROLS_REVIEWED`;
   - for the first pilot: operator-owned `SARVAM_API_KEY`, with `AI_SARVAM_BYOK_ENABLED=false`;
   - for an authorised personal-key deployment: `AI_SARVAM_BYOK_ENABLED` and `AI_CREDENTIAL_ENCRYPTION_KEY`;
   - `SARVAM_TTS_MODEL` and `SARVAM_SPEAKER`;
   - `AI_SARVAM_SPEAK_RESERVE_MICROUSD`: if set, use 25000 or more.
2. Deploy the backend from this branch, then open `/api/v1/ai/capabilities` signed in as a test account. It should show `interpret_contracts: [1,2,3]` and the expected `speech_providers`.
3. **One authorised Sarvam smoke call** (it uses credits): in the new APK, choose Sarvam and tap **Preview voice** once. If it fails, the error now names the reason. In the Render logs, look for `Sarvam speech failed: status=… code=… request_id=…`. Neither the key nor the text is logged.
4. In Sarvam, set **workspace → Data retention → Model APIs override → 0 days**. Separately turn off training in **Organisation → General** (S-7). These settings require the appropriate owner access and are not proof of historical deletion.

## 5. Voice setup: three independent stages

Voice setup now has an **Assistant** card and three numbered sections: **Listening**, **Understanding** and **Spoken replies**. A typed registry describes each provider (`vitaltrack-mobile/features/assistant/providers.ts`) and keeps four things apart:

- **Readiness**: what the phone and server can do now. It is worked out each time and never stored.
- **The saved choice**: kept per account in `carekosh-voice-settings-v2:<account>`.
- **Consent**: the server's record of accepted scopes.
- **The provider in use**: the saved choice if its local/server prerequisites hold. Otherwise the screen explains what is missing. Sarvam shows **Configured · preview to verify**; this does not claim a valid key, available credits or audible live output. No choice is swapped silently.

Other changes:

- **On-phone understanding.** "Use on-phone understanding only" turns off Groq for this account without withdrawing server consent. "Withdraw all cloud consent" remains separate.
- **Old preferences.** They load with no automatic online opt-in. Hosted voices that were never released (`kokoro`), Sarvam listening and paused Alba all fall back to the offline defaults (VERIFIED BY REPRODUCED TEST: `vitaltrack-mobile/tests/voice-providers.test.cjs`).
- **Alba** shows as **Paused** in normal builds. It can be selected only in the `preview-voice-diagnostics` test build until it passes the phone checks in [POCKET_TTS_ALBA.md](POCKET_TTS_ALBA.md).

## 6. Answer sheet changes (assistant UI only)

- **Filters understood**: one line under the title, with the full follow-up chain, for example `quantity < 3 → within the previous results · out of stock`.
- **Aligned table**: item, quantity with its unit, and status (icon plus text, never colour alone). A **★ Critical** badge marks critical equipment.
- **Reasons**: a **Why** line on every row. Excluded rows and data notes appear above the table, for example "No active item records supplier …".
- **Draft rows**: these show the stock and the order quantity together with **Explicit**, **Suggested** (with its basis) or **Edited**.
- **One-tap chips**:
  - Only critical, Only low stock, Only out of stock, Sort A–Z and Order priority, each shown only when it changes the list;
  - **Draft these items**.
- **States**:
  - an empty result says so and suggests removing a filter;
  - a clarification shows item or option buttons (category, supplier, critical meaning);
  - while busy, the dock shows "Thinking…" or "Finishing your words…";
  - the "Ask Care Coach" dock still shows real partial words while recording.
- **Accessibility**:
  - every row has one complete spoken label (position, name, quantity, status, critical, why, order and provenance) and an expanded state;
  - section titles are headings;
  - large text switches to stacked rows.

## 7. Findings (all)

| # | Location | Finding | Severity | Status |
|---|---|---|---|---|
| V-1 | `vitaltrack-mobile/features/assistant/contracts.ts` (v2) | Comparisons, critical, exclusions, priority and filtered drafts could not be represented, so they went to clarification or risked a dropped condition. | High (correctness) | Fixed with contract 3 (§2). |
| V-2 | `vitaltrack-mobile/features/assistant/queries.ts` `parseExpanded` (v2 grammar) | Two misreadings. "… in wound care that we used last week" became a category with the history words inside it. "Show items in stock" became the category "stock". | Medium | Fixed. History, usage and forecast words are refused, and "in stock" is not a category. Tested. |
| V-3 | `queries.ts` routing | "Set the draft quantity to five" asked for an item called "the draft quantity". "Add five more" was refused even with a draft open. | Low | Fixed. Both are follow-ups on the line in focus. Tested. |
| V-4 | `contracts.ts` `condition()` (found during this work, before release) | A shallow copy shared the list fields between conditions, so one clause's stock state leaked into another. | High (caught by tests) | Fixed. Each condition owns fresh lists, and the default is frozen. Tested. |
| V-5 | `vitaltrack-mobile/utils/inventoryPdfExport.ts` vs `types/index.ts` | The inventory PDF's "Critical Equipment" count used only the recorded flag; the app also counted name rules. | Low | Fixed in the independent follow-up: count and markers now use `isCriticalEquipment`, with the rule printed in the report. Stock status stays separate. |
| V-6 | Sarvam (S-1 … S-11) | See §4.2. | — | S-1 to S-5 fixed; the rest open. |
| V-7 | `.github/workflows/ci.yml` | `unit_tests/` was not run in CI. | Medium | Fixed (S-5). |

## 8. Acceptance matrix

| Requirement | Evidence | Status |
|---|---|---|
| Comparisons <, ≤, =, ≥, > and ranges | `vitaltrack-mobile/tests/voice-plans.test.cjs`; backend grounding cases | VERIFIED BY REPRODUCED TEST |
| AND/OR, union, de-duplication, exclusions, precedence | voice-plans "union, intersection …" | VERIFIED BY REPRODUCED TEST |
| Critical meaning and ambiguity | voice-plans and inline "critical is clarified …" | VERIFIED BY REPRODUCED TEST |
| Order-now list with reasons | voice-plans "order-now list is transparent …" | VERIFIED BY REPRODUCED TEST |
| Follow-ups (only critical, exclude, sort, draft from those, add more, set) | voice-plans and inline tests | VERIFIED BY REPRODUCED TEST |
| Explicit vs Suggested labels; merge, replace or cancel | voice-plans, inline and existing draft tests | VERIFIED BY REPRODUCED TEST |
| Contract negotiation; unsupported advanced requests blocked on old servers | inline compatibility tests; backend capabilities | VERIFIED BY REPRODUCED TEST |
| No business writes; one text-only provider request | backend HTTP capture and serialized business rows (§1.4) | VERIFIED BY REPRODUCED TEST |
| Hostile model output fails closed | `test_v3_route_fails_closed_on_hostile_model_output` | VERIFIED BY REPRODUCED TEST |
| Sarvam error mapping, no retry, no key switch, size cap | `vitaltrack-backend/tests/test_sarvam_transport.py` | VERIFIED BY REPRODUCED TEST |
| Voice setup stages; no fake selections; migration | `voice-providers.test.cjs`; inline settings tests | VERIFIED BY REPRODUCED TEST |
| Live Groq understanding of the example requests | one run per example on staging | NOT VERIFIED |
| Sarvam real audio, WAV format, voice quality | §4.4 step 3 | NOT VERIFIED |
| Nord 4: overlay layout, TalkBack labels, large text, partial words, speaker playback | new APK on the phone | NOT VERIFIED |
| Alba device acceptance | [POCKET_TTS_ALBA.md](POCKET_TTS_ALBA.md) | NOT VERIFIED (Alba stays paused) |
| *Added 15 October 2026 (§14):* clarifications, proposals and draft review are read aloud | inline V-9 tests | VERIFIED BY REPRODUCED TEST |
| A failed or pending server check is named, never shown as "not configured" | inline and `voice-providers.test.cjs` V-10 tests | VERIFIED BY REPRODUCED TEST |
| Busy, daily-limit and timeout answers explain the wait; successful AI calls are charged their estimate | `assistant-api-errors.test.cjs`; backend V-23 … V-26 tests | VERIFIED BY REPRODUCED TEST |
| Groq plans that drop or change a condition are rejected (contracts 1, 2 and 3) | `test_ai_plan_grounding.py` V-21/V-22 cases | VERIFIED BY REPRODUCED TEST |
| Groq receives only documented schema keywords; the server still enforces the rest | `test_voice_plans.py` V-42 tests | VERIFIED BY REPRODUCED TEST |
| Sarvam can be selected and previewed on staging | Render settings, then Recheck and one Preview (§14.6) | NOT VERIFIED |
| Alba voices, "Alba (updated)" and the Kokoro test voice on the Nord 4 | diagnostics APK on the phone (§14.6) | NOT VERIFIED |

## 9. Initial verification run (13 October 2026)

| Check | Result |
|---|---|
| Backend `pytest tests/ unit_tests/ --migrated-schema` on a fresh PostgreSQL 16 database (all migrations to `0011`) | **375 passed** |
| Backend, same suite on a create-all schema | **375 passed** |
| Backend `ruff check app tests unit_tests` | clean |
| API route gate `scripts/check_api_routes.py --expected 47` | passed (no route added) |
| Mobile `npm test` | **314 passed** |
| `tsc --noEmit` | clean |
| `npm run lint` | 0 errors; 1 existing warning in `app/builder.tsx` (not part of this change) |
| `docs/tools/build_docs.py`, then `check_docs.py --strict` | 115 files, 0 problems |
| `carekosh_system_design/src/check_guides.py` | 0 problems |

All providers were mocked: Groq, Sarvam, Moonshine, Android speech and audio. Data was synthetic. The disposable database ran only on `127.0.0.1` and was deleted afterwards.

## 10. Limits

- **Language.** The phone grammar is deliberately narrow. Every word must be a known filter or a filler word; anything else goes to Groq (if chosen) or to a clarification. Ordinary paraphrases will still often need Groq.
- **Understanding is not guaranteed.** A schema-valid, grounded plan can still be a misreading. The answer shows the applied filters for review. The server's lexical checks and the old-contract marker gate cannot recognize every paraphrase or detect every misreading.
- **Category hints.** A category used as an adjective ("wound-care items") is recognised on the phone only after the category list has been loaded in this session. Before that, the request goes online.
- **Sarvam.** Real audio, voice quality, Sarvam's error bodies in practice, and whether failed requests are billed are all NOT VERIFIED.
- **Phone layout.** The overlay was checked through rendered component trees, not on a phone. Spacing, TalkBack order and large-text behaviour need the Nord 4 check.

## 11. Files changed for this review

- **Mobile**: `features/assistant/contracts.ts`, `selection.ts` (new), `queries.ts`, `drafts.ts`, `core.ts`, `snapshot.ts`, `providers.ts` (new); `services/assistant.ts`; `components/assistant/AssistantExperience.tsx`, `AnswerList.tsx`, `VoiceSetup.tsx`.
- **Mobile tests**: `tests/voice-plans.test.cjs` and `tests/voice-providers.test.cjs` (new), plus harness updates in five existing test files.
- **Backend**: `app/schemas/ai.py`, `app/services/ai_provider.py`, `app/api/v1/ai.py`, `app/core/config.py`, `app/main.py`, `.env.example`.
- **Backend tests**: `tests/test_voice_plans.py` and `tests/test_sarvam_transport.py` (new), plus one assertion updated in `tests/test_voice_drafts.py`.
- **CI**: `.github/workflows/ci.yml`.
- **Docs**: this review, [VOICE_INVENTORY_AND_ORDER_DRAFTS.md](VOICE_INVENTORY_AND_ORDER_DRAFTS.md), [SARVAM_ENGLISH_VOICE.md](SARVAM_ENGLISH_VOICE.md), [API_TRACEABILITY.md](API_TRACEABILITY.md), [CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md), and the voice-flow diagrams.

## 12. Independent follow-up

The initial 375-backend/314-mobile baseline was reproduced before this follow-up. Passing that suite did not expose the following defects. The reviewed starting tree was copied to a recovery snapshot before coordinated edits. Existing documentation and native offline-voice work were preserved.

### 12.1 Confirmed defects and corrections

| Finding | Previously possible | Current behavior and regression evidence |
|---|---|---|
| Signed and fractional quantities | `below -3` could become `below 3`; a negative draft amount could become positive. | Unsupported signs, decimals and fractions clarify or fail validation before use. Recorded names such as `Filter-3` and `Saline0.9%` remain names. Signed number words and signs after punctuation are covered. `voice-plans.test.cjs`, `test_ai_plan_grounding.py`, v2 signed-number cases. |
| Spoken zero | “Exactly zero” was not normalized into a supported comparison. | Zero comparisons now work in local and cloud plans; zero stock still means out of stock. Signed zero is rejected, recorded Zero names stay intact and order quantities remain positive. Positive and adversarial numeric tests. |
| Union routed through a legacy intersection | “Show low-stock items and items from supplier Good Supplier” could return only low-stock supplier items. Polite wrappers could bypass the complete grammar. | Complete v3 plans take precedence; courtesy prefixes preserve the two groups. The single phrase “low-stock items from supplier …” still means an intersection. Parser tests assert resulting item IDs. |
| Courtesy tail became an item name | The expanded grammar could target `hand gloves for me` and block cloud understanding of a valid draft paraphrase. | The entire request goes to interpretation unless the full name is recorded. Existing end-to-end tests still verify one interpretation and a 20-pair glove draft; genuine `Gloves for me` names remain valid. |
| Filter words inside recorded names | Supplier `Low Stock Limited`, brand `Above 3` or category `Critical Care` could introduce unrelated predicates. | Recorded names are fenced before filter checks, including number-word forms such as `Above Three`. Local executor tests and accepted backend plans cover these cases. |
| Explicit quantity contradicts an exclusion | A draft could silently retain an explicitly quantified item even when also excluded. | The whole proposal asks for clarification; neither instruction wins. Existing draft rows remain unchanged. `voice-plans.test.cjs`. |
| Weak model grounding | Schema-valid output could omit a condition, reverse critical polarity, swap thresholds between items or change AND/OR scope. | New pure `ai_plan_grounding.py` checks detectable conditions and clause associations before returning a plan. Generic OR groups remain valid; low/out lists and “3 or more/fewer” keep their intended meaning. Unknown semantics are not guessed. Adversarial and positive backend cases. |
| Advanced request sent to an older contract | An older server could receive wording its contract could not represent. | A conservative marker gate blocks detected unsupported conditions before cloud interpretation. Basic legacy requests remain available; locally parsed v3 requests do not require cloud v3. Inline and provider tests. |
| Consent dialog survived an account change | Confirming an old dialog could grant scopes or change preferences on the newly signed-in account. | Dialogs retain the original session and turn. Account changes, leaving and backgrounding prevent stale actions; additive consent refreshes scopes first. Speech-pack confirmation uses the same boundary. Inline account-switch tests. |
| Withdrawal changed the next account | A slow preference save followed by an account switch could withdraw the next account's consent. | Withdrawal binds the original session and turn before awaiting storage. A delayed-storage regression reproduced the wrong account before the fix and now confirms no late request to the next account. |
| Sarvam configuration presented as readiness | A configured or decryptable key could look proven to work despite revoked credentials or no credits. | Positive UI label is **Configured · preview to verify**. Provider validity, credits and actual sound still require a real request. Settings tests. |
| Partial playback followed by a fallback repeat | A player error with detected progress but no sampled `playing=true` could trigger offline repetition. | Progress marks playback as started before errors are handled. Fallback is suppressed after detected playback. `cloud-speech.test.cjs`. |
| Large-text controls and units | Grouped accessibility could hide nested provider actions; long units could truncate. | Provider controls remain separate accessibility targets; narrow cards and large-text rows stack, and units wrap. Six source-derived browser previews fit their viewport. Native TalkBack acceptance remains open. |
| PDF critical count disagreed with the app | Name-classified critical equipment could be omitted from the PDF count and markers. | Both use the canonical `isCriticalEquipment` helper. The PDF states flag/name-rule provenance without changing stock status. `pdf-reports.test.cjs`. |

The mobile interpreter, selector and draft engine still have no save-order, stock-update or supplier-send operation. The backend interpretation route validates data only; it does not execute a plan. No new route, migration, credential-storage policy or native dependency was added by this follow-up.

### 12.2 Verification of the final candidate

| Check | Final candidate evidence |
|---|---|
| Backend, fresh PostgreSQL 16 through all Alembic migrations to 0011 | **458 passed** |
| Backend, separate fresh PostgreSQL 16 using model-created schema | **458 passed** |
| Backend Ruff: `app tests unit_tests` | clean |
| Registered `/api/v1` route-object gate | **47**, unchanged |
| Mobile full suite | **344 passed**, no failures or skipped tests |
| Mobile TypeScript and ESLint | clean type-check; **0 lint errors, 1 existing warning** in `app/builder.tsx:118` |
| Settings/table previews, 320/390 px and text scale 1/1.6 | **6 passed**, no horizontal overflow; source-derived CSS previews, not native Android |
| Updated review/Sarvam/voice HTML and three architecture SVGs at 390/1440 px | **12 browser checks passed**, no broken loaded images, script errors or SVG text outside its canvas; wide diagrams remain scrollable |
| Strict local documentation links and anchors | **115 files, 0 problems**; external links not fetched by this checker |
| System-design diagrams and inline figures | **22 SVGs, 35 inline figures, 0 problems** |

Providers and acoustic output were mocked. Business data was synthetic, and both disposable clusters used loopback only and were stopped afterwards. The tests include actual HTTP adapters with mocked external transports. Live APIs, Render deployment and physical phone audio are outside this evidence.

### 12.3 Deployment and remaining acceptance

Use the [staging setup guide](SARVAM_ENGLISH_VOICE.md#exact-render-steps-for-staging). For the first pilot, configure the operator's own server-side `SARVAM_API_KEY` and leave public BYOK off. Keep the existing Groq configuration. Verify migration 0011, contract 3 capabilities and the expected staging API URL before installing the new APK.

Then test the requested comparison/union/draft examples, Preview voice, Hear answer, a second question during speech, account changes and offline fallback on the Nord 4. Verify one real Groq interpretation and a real Sarvam WAV/playback. Preview tests consume credits. No such call, deployment or APK build was performed by this review.

**Production remains pending** those checks and operator privacy/disclosure review. Paused Alba belongs to its separate experimental acceptance gate. Customer-supplied third-party keys require a permitted provider arrangement before public enablement; operator workspace settings do not establish every personal workspace's policy.

## 13. Publication candidate

The operator requested a feature-branch commit after the review. This publication candidate contains Sarvam narration, contract 3, the independent correctness/security/UI fixes and their maintained documentation. It uses the previously committed Android microphone/native code. The separate native Alba experiments, diagnostic EAS profile, private audit records and generated coverage data stay local.

Alba selection and native diagnostics are disabled in this candidate. The optional bridge methods are retained for interface compatibility but no diagnostic action is exposed. The earlier 344-test working-tree evidence included three tests for the unpublished diagnostics profile; the clean publication candidate is verified separately before commit/push.

Build a preview APK from a clean checkout of the pushed commit: EAS includes eligible uncommitted local files, so the original checkout's remaining native experiments would otherwise enter its build.


**Publication verification:** 458 backend tests passed on a fresh migrated PostgreSQL 16 database; 341 mobile tests passed. TypeScript is clean; ESLint has 0 errors and the existing Builder warning. Public-clone documentation checks cover 88 files with 0 problems; 22 diagrams and 35 inline figures pass. No native code, main branch, live database, provider call or deployment was changed by the publication preparation.

**13 October 2026 — separate Alba follow-up publication:** The native Alba repair, the `preview-voice-diagnostics` profile and their tests were published later in a separate commit on this feature branch. Normal builds still keep Alba paused. This does not change the original publication evidence above. The follow-up passed 344 mobile tests, TypeScript, lint with no errors, Kotlin 2.2.20 compilation against Android/LiteRT/Moonshine API jars with Expo stubs, JVM recovery checks and real LiteRT 2.1.6 host synthesis. Host synthesis required graphics-driver access outside the sandbox; these checks do not prove phone sound, Adreno behaviour or a real Gradle release build.

## 14. October follow-up audit and fixes

**Why.** The owner tested the APK built from `398bb29` and reported two problems. "Sarvam English · online" could not be selected, and Alba was audible but did not sound good. The first 15 October implementation addressed V-8 … V-45, but independent verification found further defects. The table below preserves that initial audit; §15 supersedes its blanket “Fixed” claims. Nothing was committed, pushed or deployed. No paid provider call was made.

**Evidence labels** are those listed at the top of this review. "Host" means a desktop computer, not the phone.

### 14.1 Why Sarvam could not be selected

Two causes looked identical on the phone.

- **The staging server** may not have Sarvam switched on. That needs the Render settings in [SARVAM_ENGLISH_VOICE.md](SARVAM_ENGLISH_VOICE.md#exact-render-steps-for-staging). This is an owner step.
- **The app (V-10).** When the capability request was still running or had failed, the Sarvam row said "Not configured on this server". A Render cold start or a weak signal produced the same message as a missing key.

Current (15 October 2026): the row says "Checking the CareKosh server…" or "Could not reach the CareKosh server (reason). Tap Recheck." Only a successful answer can say "not configured". A consent-version mismatch is named as well.

### 14.2 All items

Severity is from the audit. Test names are abbreviated; each test title starts with its V-number.

| # | Finding | Severity | Fix (current behaviour) | Test | Status |
|---|---|---|---|---|---|
| V-8 | A reply reached by tapping during speech was never spoken. The speaking state was read from a stale value. | Major | A ref guards `playAnswer`; the old speech stops first. | inline V-8 | Fixed |
| V-9 | Clarifications, proposals and draft review were shown but never spoken. | Major (eyes-free) | `Answer.spoken` holds the spoken form: the question plus up to three choices. Proposals, merges and review are read aloud. | inline V-9 (2) | Fixed |
| V-10 | A failed or pending server check read "Not configured on this server". | Major | `ServerStatus` (checking, failed, loaded) with a short reason and Recheck. The device voice shows "checking". | inline V-10 (2); `voice-providers.test.cjs` (3) | Fixed |
| V-11 | A 429 lost the server's wording and showed a wrong wait. | Minor | The server text is kept. `Retry-After` may be seconds or a date: up to 90 s it shows seconds, otherwise a clock time. Understanding and listening retry once after a short busy answer; speech never retries. | `assistant-api-errors.test.cjs` (4) | Fixed |
| V-12 | AI timeouts said "Request cancelled". | Minor | A 70 s deadline; the message says the server took too long and may be starting up. | `assistant-api-errors.test.cjs` | Fixed |
| V-13 | Refresh while offline removed the answer. | Minor | The answer stays; a failed refresh marks it "Last known". | inline V-13 | Fixed |
| V-14 | The offline-fallback switch could say On with nothing usable saved. | Minor | The switch shows only a saved choice. Choosing is a separate, previewed step, and a voice that cannot play is flagged. | inline V-14 | Fixed |
| V-15 | Removing the last draft line left an empty "ready" draft. | Minor | The draft is cleared: "The draft is now empty. Nothing was saved." | inline V-15 | Fixed |
| V-16 | The answer sheet was too short for choices at large text sizes. | Minor | Its height counts choices, options and proposal buttons; the text scale counted is capped at 2. | inline V-16 | Fixed |
| V-17 | TalkBack gaps. | Major (TalkBack) | Answers that are not read aloud are announced. Expanded row details are in labels. The dock is quiet while recording; the transcript is announced. | inline V-17 | Fixed; phone NOT VERIFIED |
| V-18 | A follow-up could loop on the same clarification. | Minor | One choice resolves the whole follow-up chain, including Refresh and Export. | inline V-18 | Fixed |
| V-19 | Groq listening looked ready offline, and a failed upload lost the recording. | Minor | The take is kept: "Transcribe on this phone instead" or "Discard recording". | inline V-19 | Fixed |
| V-20 | Spoken text was not prepared for speech. | Major (Alba) | `speechFriendly` turns units, symbols, ₹, %, fractions and medical sizes into words. An optional pronunciation map exists. The 640-character limit applies after this. | `speech-text.test.cjs` (3); inline V-20 | Fixed |
| V-21 | Contract-3 checks accepted Groq plans that dropped or changed what was asked. | Major | `require_complete_plan` accounts for every word, number and cue. Operation cues are checked per clause; a follow-up needs a reference. | `test_ai_plan_grounding.py` V-21 cases | Fixed |
| V-22 | Contracts 1 and 2 (older APKs) had no condition grounding. | Minor | `require_v1_conditions` and `require_v2_conditions`. | `test_ai_plan_grounding.py` V-22 cases | Fixed |
| V-23 | Usage was charged at the whole reservation: about 4 Sarvam replies a day. | Major (with Sarvam) | Success settles at an estimate from published prices: Sarvam per character, Groq per token, Whisper per second. A failure keeps the reservation. | `test_ai.py` V-23 (3) | Fixed |
| V-24 | Daily-limit 429s said "wait 3600 seconds". | Minor | The reset is named (00:00 UTC); `Retry-After` counts to it. | `test_ai.py` V-24 | Fixed |
| V-25 | One request per user blocked quick follow-ups; a cancelled request kept running. | Minor | One in-flight call per kind (interpret, speak, transcribe). A disconnected phone cancels the provider call. | `test_ai.py` V-25 (2) | Fixed |
| V-26 | AI request hardening. | Minor | Soft per-account/route/worker limits; budget-lock wait gives 503/`Retry-After: 5`. Consent precedes audio inspection, decoding and provider upload; FastAPI parses multipart framing earlier. Uploads get 30 s; refusals carry security headers and a sanitized request ID. | `test_ai.py`; review regression tests | See §15; optional index migration skipped (pilot scale) |
| V-27 | The consent version was defined in two places. | Minor (latent) | One server constant; a test compares it with the phone. | `unit_tests/test_consent_version.py` | Fixed |
| V-28 | Any audio-focus loss aborted Alba and discarded the warm engine. | Major | A short notification ducks the voice (gain 0.3). A real interruption stops calmly and keeps the engine. | JVM focus and engine policy; inline V-32 | Fixed; phone NOT VERIFIED |
| V-29 | Unplugging headphones kept talking on the loudspeaker. | Minor | "Audio becoming noisy" stops playback. | code review | Fixed; phone NOT VERIFIED |
| V-30 | Backgrounding silently cancelled downloads and on-phone recognition. | Major | Downloads stop only on their own Cancel. Recognition says it stopped. Voice engines are released after 30 s hidden. | inline V-30 (2) | Fixed |
| V-31 | Download robustness. | Minor | Resumable HTTP Range downloads keep finished parts; size and SHA-256 are checked after. Free space counts only missing bytes. | JVM resumable-download checks | Fixed |
| V-32 | Errors were classified and worded inconsistently. | Minor | Stable native codes (`VoiceErrors.kt`). A cancel is silent; an interruption is neutral; suffixes are not doubled. | inline V-32; JVM | Fixed |
| V-33 | The speech pack was re-hashed on every voice turn. | Minor | The verified file stamp is kept per process and forgotten after a load failure. | compile only | Fixed |
| V-34 | A reply seemed to hang about 1.5 s after its last word. | Minor | The audio track drains, then stops at the end. | JVM streaming-drain checks | Fixed |
| V-35 | Nothing responded to memory pressure. | Minor | Low-memory and trim callbacks release voice engines. Low-memory phones see a warning before a download. | compile only | Fixed; phone NOT VERIFIED |
| V-36 | Alba chunks were too short and missed upstream's end-punctuation fix. | Major (quality) | 50-token chunks (the first up to 32); sentence, then comma, then word splits. Pocket TTS PR #296 punctuation and trimmed joins. | JVM chunking checks; host check | Fixed |
| V-37 | Relaxed and Brisk time-stretched Alba, and the pace control was hidden. | Major when pace ≠ 1 | Pace changes the pauses only; no Android speed change. The control is shown with that note. | inline V-37; JVM pauses | Fixed |
| V-38 | Only one Alba voice. | Major (quality), cheap | Charles, Eve, Mary (VCTK, CC BY 4.0), Javert and Marius (CC0), diagnostics builds only. | inline V-38; manifest test | Fixed |
| V-39 | Alba was quiet (about −20 dBFS). | Optional | Evened towards −18 dBFS, at most +4 dB, peak at most 0.9. | JVM loudness; host RMS −18.0 dBFS | Fixed |
| V-40 | Alba's voice state comes from a clip cut mid-word. | Major (quality) | "Alba (updated)": Kyutai's corrected state, packed on the phone and checked by SHA-256 (§14.3). The default stays Alba. | JVM packing; inline V-40; host comparison | Fixed; phone comparison pending |
| V-41 | No calmer offline voice. | Feature | Kokoro-82M test voice through Moonshine 0.1.5, diagnostics builds only (§14.4). | inline and policy V-41 (4); JVM; host check | Fixed; phone release criteria pending |
| V-42 | The strict schema sent to Groq used keywords Groq does not document. | Major risk | Groq gets a portable schema; the server still enforces the dropped rules. Groq errors are mapped and logged without content. | `test_voice_plans.py` V-42 (3) | Fixed |
| V-43 | Some Sarvam authentication failures showed a generic error. | Minor | 401, 403 and `authentication_error` name the rejected key. | `test_sarvam_speech.py` V-43 | Fixed |
| V-44 | The disabled Sarvam transcription path sent `mode` with `saaras:v4`. | Minor (latent) | `mode` is sent only for `saaras:v3`. | `test_sarvam_speech.py` V-44 | Fixed |
| V-45 | A new HTTPS client for every provider call. | Optional | Not changed: per-call clients keep test transport injection and avoid reuse across event loops. | — | Skipped |

### 14.3 Alba sound quality (host evidence)

The host check runs CareKosh's own Kotlin synthesizer on real LiteRT 2.1.6 numerics (see [POCKET_TTS_ALBA.md](POCKET_TTS_ALBA.md)).

- **Before and after V-36 … V-39**, same four replies: loudness is now even at −18.0 dBFS, against −18.9 to −22.3 dBFS before. Time to the first chunk is unchanged (about 0.8–0.9 s on the host). VERIFIED BY REPRODUCED TEST (host).
- **"Alba (updated)" (V-40).** Kyutai regenerated its voice states on 27 September 2026 so that each prompt ends on a short pause (pocket-tts PR #334). On 1 October an upload for other languages put the old English files back. Kyutai's PR #351 (10 October) still names the old state as the cause of chunk-start bursts. So the revert was not a quality decision.
- **Packing.** `pack_voice.py` (host) and `PocketVoiceState.kt` (phone) reproduce the pinned `pt_voice_alba.bin` byte for byte from Kyutai's original state. The updated state packs to 127 frames, which fits the 512-frame KV cache.
- **Comparison**, per state: 72 short replies of one to three words and 24 multi-sentence replies. Both spoke everything at the same speed (real-time factor 0.20 on the host). The updated state starts each chunk after a natural pause (median 80 ms against 40 ms). Whisper `base.en` heard all 72 short replies correctly, against 70 of 72 for the original Alba (one was "Done. Done.").

### 14.4 Kokoro test voice (V-41)

- **Licence check.** The Kokoro-82M weights and voices (hexgrad) and their ONNX export are Apache 2.0. The English pronunciation dictionary comes from CMUdict, which has a BSD-style licence. Moonshine's asset page says its pronunciation data "follow the terms of the projects they come from". Its own out-of-vocabulary model has no separate licence text. **Owner review** is recorded in §14.6.
- **Files.** Exactly the moonshine-voice 0.1.5 file set: the split prosody and decoder stages, `config.json` and the English pronunciation files (108.5 MB), plus about 0.5 MB per voice. They come from Moonshine's Hugging Face mirror at commit `0bf2f2e5`, each checked by size and SHA-256. The library is never asked to download.
- **Voices.** Heart and Bella (US) and Emma (UK). Emma needs the `en_gb` profile, which uses the same English files.
- **Host results** (moonshine-voice 0.1.5 on a Mac, same native core): each voice loads in about 0.2 s and runs at a real-time factor of about 0.10. Phone speed is NOT VERIFIED.
- **Pronunciation.** Moonshine's dictionary misread decimals ("12.5" as "12 up 5") and British spellings ("litres" as "lighters"). CareKosh now says "12 point 5" and uses US spellings for Kokoro only. Whisper's word error rate on CareKosh replies fell from 27–35 % to 10–14 %. Remaining misses are item names such as "Ambu" and "Paracetamol".

### 14.5 Verification (15 October 2026)

| Check | Result |
|---|---|
| Backend, fresh PostgreSQL 16 migrated through all Alembic revisions | **521 passed** |
| Backend, fresh PostgreSQL 16 with the model-created schema | **521 passed** |
| Backend Ruff (`app tests unit_tests`) and the 47-route gate | clean; passed |
| Mobile `npm test` | **378 passed** |
| Mobile TypeScript and ESLint | clean; 0 errors, the existing `app/builder.tsx` warning |
| `scripts/check-pocket-recovery.kt` (JVM) | passed, including packing (two deliberately broken packers were caught) and Kokoro text checks |
| Native module compile against Android, LiteRT 2.1.6 (with the LiteRT API jar) and moonshine-voice 0.1.5 with Expo stubs | Initial run: 72 classes; deprecation warnings include `URL` and the legacy `onError` override. This is not Gradle or release lint. |
| `scripts/pocket-host-check/run.sh` and its `COMPARE` mode | passed |
| `scripts/kokoro-host-check.py` | passed |
| Android JavaScript export of `preview` and `preview-voice-diagnostics` (`--clear`) | both built. In `preview`, the diagnostics, Alba and Kokoro flags are compiled as `false`. |

All providers were mocked in tests. Business data was synthetic, and the disposable database used loopback only. The host checks downloaded public, pinned model files outside Git; no recording or inventory left the computer.

### 14.6 Owner actions and open checks

1. **Sarvam on staging.** Apply the [Render settings](SARVAM_ENGLISH_VOICE.md#exact-render-steps-for-staging), deploy, then tap "Recheck voice & online understanding" and run one Preview (it uses credits).
2. **Review and commit** the working tree, then build the `preview-voice-diagnostics` APK (an EAS build needs the owner's approval).
3. **On the Nord 4:** compare Alba with "Alba (updated)" and the other voices. Try Kokoro Heart, Bella and Emma, and note the time to first audio and real-time factor from "Audio check details". Check a notification during speech (it should duck) and unplugging headphones (it should stop).
4. **Kokoro licence review** before any wider release: Moonshine's out-of-vocabulary pronunciation model has no separate licence text.
5. **Kokoro release criteria:** first audio within 1.5 s, real-time factor below 1, no crash in 20 replies, and acceptable item names.

## 15. Independent verification follow-up

**15 October 2026 — local repairs, not committed or deployed.** Independent verification found that passing the initial suites did not establish safe playback, complete grammar or correct download lifetime. This section records the subsequent repairs. The original private review remains unchanged as historical evidence; it must not be published with the repository.

### 15.1 What changed after the independent review

| Review item | Repair or explicit limit |
|---|---|
| R-1: downloads delay a reopened microphone | A dedicated download worker separates network waits from capture/transcription and synthesis. App-wide download progress and Cancel survive screen closure. Short pack-publication/removal locks prevent a cancelled install from recreating removed files. |
| R-2: stop resets the playback head | Completion is measured while playing; rendered frames are captured before stop. The regression fake resets its counter like Android. This covers Alba, Kokoro and Check audio output; Sarvam keeps its separate player. |
| R-3: narration changes units/codes | Unknown slash expressions and fractional quantities remain intact. Suture pronunciation requires an integer size in suture context. Screen data is unchanged. |
| R-4–R-7: faithful plans are refused | Bounded courtesy grammar, projection/filter distinction, copied-name masking and legacy stock/sort aliases replace the overly narrow checks. Numeric and clause-association checks remain. |
| R-8: alternate Alba reinstall strands controls | Playback readiness follows the selected voice; Remove/catalog depend on any installed voice. Reinstalling only “Alba (updated)” is valid. |
| R-9: budget examples too high | Defaults permit seven 300-character or fourteen 150-character successful replies before other usage, because the next full reservation must fit. No quota was relaxed. |
| R-10: Kokoro alters dotted identifiers | Dates, versions and item codes are preserved before standalone decimal pronunciation. |
| R-11: short daily 429 retries | Automatic retry requires a 429 explicitly marked `X-AI-Error: busy`, a finite delay of 0–10 seconds, and a current, uncancelled turn. Speech, daily limits, generic route limits and old unmarked responses do not retry. |
| R-12: stale download error after account change | Completion and error updates check the originating session/turn. Shared pack readiness can refresh without changing another account's preferences. |
| R-13: first chunk exceeds 32 tokens | Overlong initial pieces are split with the first-chunk limit too. Later chunks remain bounded at 50. |
| R-14: cached status trusts same metadata | Status checks may reuse a metadata stamp. Every fresh recognition engine load re-verifies the catalog checksums; both capture and transcription load failures invalidate the cache. |
| R-15: misleading and header-keyed throttling | Soft AI limits now follow a validated account ID, so forged forwarding headers cannot reset its counter or target another clinic account. Counters remain per route/per worker; shared budget/concurrency enforcement is in PostgreSQL. A distributed public-scale limiter is still an operator design decision. |
| R-16: transcription ignores disconnect | Normalization and Groq/Sarvam transcription now run under the same disconnect guard as understanding/narration. An already-closed request starts no provider work. Cancelled attempts retain the full reservation. |
| R-17: unsafe correlation IDs | Both ordinary responses and early body-limit refusals use the same bounded ASCII request-ID validator. Controls, whitespace and oversized values receive a generated ID. |
| R-18: overstated docs | Consent precedes audio inspection/decoding/provider upload, not FastAPI's multipart framing parser. Loud Alba chunks are attenuated to headroom; old warning/measurement claims are labelled accurately. |
| R-19: bridge declarations differ | Kokoro download returns its declared catalog; frame progress omits absent frames; the current speech method requires a voice ID with an explicit legacy adapter. |
| R-20: dropped “stocked items” clause | “Stocked” is recognized as in-stock. A plan that loses that group is rejected; stock negations remain guarded. |

The server still has no inventory/order-mutation tool for Groq. Drafts remain local proposals until touch confirmation through the existing authenticated save flow. Sarvam's model, voice, consent scopes, key ownership and billing-source boundaries are unchanged. Normal builds keep Alba and Kokoro selection off.

### 15.2 Verification after repairs

All provider responses use mocks; only disposable synthetic PostgreSQL databases are used. Host models and generated audio stay outside Git. Fresh results after the repairs:

| Check | Result and scope |
|---|---|
| Backend, all migrations on PostgreSQL 16 | **640 passed**, no skips |
| Backend, model-created schema on PostgreSQL 16 | **640 passed**, no skips |
| Backend Ruff and route gate | Clean; **47 routes**, unchanged |
| Mobile tests | **390 passed** |
| Mobile TypeScript / ESLint | Clean types; zero lint errors and the existing `app/builder.tsx:118` hook warning |
| Review corpus through actual interpreter, mocked Groq | **202/202 faithful plans accepted; 18/18 hostile plans refused**. This tests the validator, not live Groq accuracy. |
| Portable schema and provider errors | Eleven invalid replies rejected; 270 error/status cases and deeply malformed errors handled without content logging |
| Raw ASGI/middleware checks | Seven JSON/audio/upload/HEAD/OPTIONS/refusal/ordinary keep-alive scenarios finish with no remaining watcher tasks |
| Native JVM regressions | Passed, including Android-faithful playback counter reset, independent workers, first-chunk bound and headroom |
| Synthetic actual ModelPack checks | Passed: same-stamp corruption rejected before engine load, capture not held by blocked HTTP, cancelled removal not undone by late publication |
| Native type compile | **72 classes**, Kotlin 2.2.20 with Android/LiteRT/Moonshine jars and Expo stubs; not Gradle/release lint |
| Host synthesis | Alba and original/updated comparison pass (12 short +4 long replies per state); Kokoro passes all three voices and paces. These are numerical host checks, not Android sound certification. |
| Additional numerical checks | Fresh fp16 comparison: **294,443 values, zero mismatches**. Kokoro short replies: **60/60 pass**. Available pinned files match size/SHA-256; four optional Alba presets were not downloaded or synthesized. |
| Preview and diagnostics JS exports | Both pass with `--clear`. Preview diagnostics/Alba/Kokoro flags are all false; diagnostics flags all true. |
| Generated documentation | Six updated HTML companions regenerated; strict check **121 files, zero problems**. Unrelated/private generated pages left alone. |

The first scratch-only backend run lacked the copied mobile source and skipped its consent-constant check; both complete suites were rerun with that fixture present and passed all 640. An old review probe in scratch also caused a Ruff warning until excluded from the candidate copy. Neither issue was in the application checkout. The original private verification report is preserved; its original verdict does not describe this repaired tree.

### 15.3 Remaining acceptance

- No new commit, push, EAS build or deployment is part of this work. Main is unchanged.
- A real Android release build, OnePlus microphone, speaker/Bluetooth output, TalkBack and repeated questions still need acceptance on the resulting APK.
- Live Groq schema/interpretation and a real Sarvam preview remain unverified. A preview uses credits and cannot be inferred from mocked transport tests.
- Alba/Kokoro host generation is narrower evidence than audible Android playback. Keep both diagnostic gates off for normal users until device acceptance.
- Moonshine's English OOV pronunciation-model licence still needs an applicable rights decision before broader Kokoro distribution. The report did not establish a separate grant. No model, voice or licence was silently replaced.
- Per-worker soft rate counters and configured provider estimates are not a distributed abuse-control guarantee or a provider invoice cap. Render's actual proxy/header/deployment settings were not accessed.

## 16. Query, presentation and order recovery follow-up — 24 October 2026

**24 October 2026 — reviewed for feature-branch publication after `973d2e9`.** This follow-up addresses the owner's Nord 4 screenshots and reviewed query. Publishing the source does not deploy the backend or build an APK. Earlier dated measurements keep their original scope.

### 16.1 Reported query and faithful interpretation

“Please check if there is any important item that needs attention and is low in stock?” now produces one group: **critical equipment AND low stock**. “Important”, “essential” and “life-support” use the existing item rule: marked critical or a matching equipment name. Applied filters expose that meaning; the assistant does not invent a medical importance score.

The local parser and Groq prompt/grounding now agree on repeated predicates such as “and is low”. “Needs attention” alone means low or out of stock; an explicit low-stock predicate narrows it to low only. Separate lists remain unions. The reported `cheyck`, `imprtant`, `tha` and `atatntion` spellings have four bounded filter-word aliases. Copied item, supplier, brand and category names are protected; this is not general autocorrection.

An additional regression fixed “all in-stock items” losing its stock condition. Natural order-priority wording uses current stock and recorded minimums; it does not forecast demand. Unsupported conditions still require clarification or interpretation. Server checks refuse dropped conditions, broadened stock states, incorrect grouping and rewritten names. No contract version, model, mutation tool or endpoint was added.

### 16.2 Presentation and data consistency

- **Brand and entry:** the dock says **Ask CareKosh**, with equal side slots centering the microphone. The answer header says **CareKosh**. It remains an ordinary view inside the app window, with existing microphone consent, transcript review, cancellation and narration callbacks.
- **Answers:** a distinct summary panel, compact metric cards, applied filters, responsive item cards and explicitly labelled stock/order quantities replace the dense presentation. Item details expand in place. Short draft counts are shown first; the complete explanation is still available. Known-saved and uncertain submissions keep their truthful status.
- **Create Order:** item identity, supplier/brand, current/minimum stock and editable quantity have separate rows. Long names and units wrap. Suggested/requested/edited provenance is separate from stock. Editing and add/remove actions lock while submitting or retaining an uncertain request.
- **Emergency backup:** rows and count use the existing critical/stock criteria. The dashboard now opens `mode=emergency`; its initialization selects active critical equipment with quantity at most one, rather than including unrelated out-of-stock items. Existing drafts require an explicit Keep, Replace or Add missing choice; submitted attempts cannot be overwritten.
- **Order history:** readable status and item rows, responsive actions and a header New order action replace the floating button that could cover another action. Existing receive, stock-update, export and removal confirmations retain their callbacks.

### 16.3 “Checking / saving…”: evidence and recovery

The screenshots show an order later present in Recent Orders and a Re-export saved order button. They establish that saving succeeded in that attempt; they do **not** identify the exact native operation that stalled on the phone.

The code had one busy message across capability checks, fresh stock retrieval, saving, PDF generation and sharing. Native photo preparation, printing and file-copy waits were unbounded. A slow-save global success dialog could also overlap the subsequent native PDF/share flow.

The screen now owns its feedback and exposes each stage separately. PDF photo preparation is bounded at 30 seconds, rendering at 45 seconds, file copy at eight seconds and sharing availability at five seconds. A failed copy can use the original generated file. The interactive share chooser has no short timeout. Leaving cancels the app's wait; underlying native work may finish later, but late results cannot start a new share step.

An uncertain save retains the original request and submission ID through retries, including a later rejection. Only a definitive rejection of a newly started first submission can unlock it. Save and PDF completions must still belong to the exact captured request before publishing a saved result, starting another export step or clearing a draft. A late response from an earlier order cannot mark or remove a newer draft. A saved order remains available for re-export without another POST. An explicit Done action clears only the confirmed-saved local draft and returns to Orders; an unknown outcome is never cleared by that action. Stock is not increased by creating an order or exporting its PDF.

### 16.4 Verification and remaining acceptance

Fresh checks use synthetic data and mocked providers. The backend runs against two disposable PostgreSQL 16 databases with Python 3.12 and `ENVIRONMENT=testing`; external network connections are blocked. No live business database, provider credits, EAS build or deployment is used.

| Check | Result |
|---|---|
| Mobile full suite | **453 passed**, no failures or skips; includes typed/reviewed exact-query, draft, listener, Sarvam, microphone, second-question, order and PDF regressions. |
| Mobile TypeScript / ESLint | Clean types; zero lint errors, one existing `app/builder.tsx:118` hook warning. |
| Backend, model-created schema | **671 passed** on disposable PostgreSQL 16 with Python 3.12.13. |
| Backend, all Alembic migrations | **671 passed** on a separate disposable PostgreSQL 16 database. The test cluster is stopped. |
| Backend Ruff / route gate | Clean `app/ tests/ unit_tests/`; **47** API route objects, unchanged. |
| Regular-preview Android JS export | Fresh Metro/Hermes export passed with staging API and Whistle enabled. No EAS/Gradle APK build was run. |
| Independent order review | Focused order, API and mutation checks pass, including late abandoned-request rejection, saved-only Done, and exact-request checks on late save/PDF completion. The final full-suite results include these regressions. |
| Browser layout check | Nine synthetic component previews; no horizontal page overflow at tested 393px and 320px/large-text widths. Mic center: **196.5px** in a **393px** view. |
| Documentation | Four HTML companions regenerated; strict current-guide check passes. The full working-tree scan also reports unrelated non-guide HTML warnings; that unpublished work is excluded from this change. |

Browser previews use the actual component render trees and styles with synthetic data through React Native Web. Icons and native input/share surfaces are approximated; these are layout checks, not Android screenshots or proof of native PDF/audio behavior. The microphone's center measured exactly half the 393-pixel preview width. Narrow 320-pixel and large-text layouts are checked alongside light/dark answer presentation.

No Render variable, API key, database migration or native listener change is needed. Deploy the reviewed backend for the updated cloud interpretation checks and build the ordinary `preview` APK for app changes. Live Groq accuracy, Sarvam playback, the native Android PDF/share chooser and Nord 4 behavior remain device/staging acceptance checks. Test the exact reported query, emergency count/action agreement, an existing draft conflict, PDF failure/re-export, a saved-order Done action, and a second microphone question before release.

## 17. OpenAI personal-key understanding — 25 October 2026

This section records the later local OpenAI implementation; it does not replace earlier dated evidence or imply deployment. The initial checks in §17.2 used the combined local tree, including separate unpublished browser/ingress work. Final checks of the isolated OpenAI-only publication are recorded in §17.4. [Architecture, security boundaries and exact setup](OPENAI_UNDERSTANDING.md).

### 17.1 Scope and safety

- OpenAI is an independent Understanding option. Existing listener/narrator selections, microphone/native code and Sarvam narration remain unchanged.
- Enrollment uses authenticated encrypted per-account storage and separate storage confirmation. OpenAI has a separate owner/provider-bound credential envelope/table; Sarvam keys remain intact.
- A separate `openai_text` consent is required. Saving/checking a key neither grants it nor selects the provider. The unsaved field clears on background/exit/account change.
- Responses uses the pinned GPT-5.4 mini model, strict contract 3, existing semantic grounding, fixed HTTPS endpoints and no tools/automatic retries/fallback credentials. `store:false` is not a Zero Data Retention promise.
- The validated plan is executed against authorized local inventory. The model cannot write business records; orders and stock retain explicit touch confirmation and backend checks.
- Existing shared daily limits/concurrency apply. The minimum reservation is 50000 microUSD ($0.05); it exceeds the checked bounded-request estimate of 30063 microUSD at current standard prices. This is an allowance guard, not the provider's balance or guaranteed bill cap.
- Model/key metadata checking is separate from enrollment and inference. Rejected provider keys do not expire the CareKosh login; quota/rate/timeout errors are sanitized. No application OpenAI key is supported.

### 17.2 Checks actually run

| Check | Result |
|---|---|
| Full backend suite, Python 3.12 / disposable PostgreSQL 16, model-created schema | **831 passed** (`python -m pytest tests/ unit_tests/ -q`) |
| Same suite through actual migrations | **831 passed** (`--migrated-schema`) |
| Isolated Redis/CI-style subprocess | Included in both runs, without inherited `PYTHONPATH`; non-loopback network blocked |
| Backend Ruff | `ruff check app/ tests/ unit_tests/`: clean |
| Mobile full suite | **465 passed**, including independent provider combinations, consent, key clearing, no fallback and second-question routing |
| TypeScript and mobile lint | Clean types; 0 lint errors, one existing `app/builder.tsx:118` warning |
| Preview Android JavaScript export | Offline Metro/Hermes export passed from a clean temporary copy with the new component included. This is not an APK/native build or phone test. |
| Settings visual checks | Actual RN-web components: no horizontal overflow at 393 px light/dark or 320 px with 1.6 font scaling; compact stage label corrected |
| Independent security review | 111 focused backend checks and 12 focused mobile checks passed. Found/fixed deep JSON `RecursionError`; no remaining blocker identified in that review. |
| Web compatibility | 53 unit tests passed; TypeScript and lint clean. Existing Groq capability meaning/default requests remain compatible. |
| Route gate in the initial combined local tree | 55 `/api/v1` route objects; passed. The isolated OpenAI-only publication has 51; unpublished browser routes account for the other four. |
| Documentation | Six affected HTML companions regenerated. Strict current-guide check: 41 files, 0 problems. The full scan also reports 57 unrelated noncurrent links in website artifacts, preview routes and interview content; those files were not changed by this task. |

Migration coverage upgrades a populated 0011 database and compares old business records, consent and Sarvam credentials before/after. Integration tests prove interpretation adds usage metadata while leaving items, categories, orders, lines, activity and audit counts unchanged. Hostile/malformed model responses never reach execution. Key ownership, provider isolation, rotation, paused deletion, account cascade and cancellation are covered.

All credentials/data are synthetic and all provider transports mocked. No paid call, live database change, EAS build, commit, push or deployment was performed for this implementation.

### 17.3 Deployment and remaining acceptance

Review/apply migration `0012_openai_personal_keys` through the intended deployment procedure. Configure OpenAI feature/review flags and the pinned model in Render, preserving the existing encryption master key. Enroll a personal key in Android settings; do not add it to EAS or as an operator backend key. The [setup guide](OPENAI_UNDERSTANDING.md#manual-backend-configuration) lists exact values and limits.

Still required: an explicitly authorized live OpenAI key/model request, complex-query quality checks, and Nord 4 microphone/narration/second-question acceptance with a matching new preview APK. Mocked/host RN-web checks do not prove real provider schema acceptance or physical Android behavior. Existing Alba/Kokoro acceptance gates remain in place. Production readiness also depends on the deployment's ingress, logging, dependency, privacy and operational controls; passing these tests alone is not a production certification.

### 17.4 Final OpenAI-only publication verification — 25 October 2026

The owner requested publication of only the reviewed OpenAI work. An isolated snapshot was built from feature-branch HEAD `08e292e` plus that change. Unpublished browser/ingress edits, private folders and unrelated documentation were excluded. Shared files retain those owner edits locally; only the OpenAI delta is included in this publication.

- Full backend suites on disposable PostgreSQL 16: **771 passed** with model-created schema and **771 passed** with `--migrated-schema`. The earlier 831 results describe the combined local tree; the 60-test difference is unrelated unpublished browser/ingress coverage.
- This snapshot has **51** `/api/v1` route objects (47 existing plus four OpenAI key routes). Local browser work adds four more; it remains unpublished. Route-count checks for the committed snapshot use 51.
- Backend Ruff passes for `app/`, `tests/`, `scripts/` and `unit_tests/`. Strict public-guide checks pass for 34 files with zero problems; the local tree's seven additional private guides are not published.
- Mobile rerun: **465 passed**; TypeScript clean; lint has zero errors and the one existing builder warning. Mobile runtime sources match the earlier successful preview Android JavaScript export. No native source or listener/narrator integration was changed.
- The new endpoint rate limits are per authenticated account and worker in this scope. PostgreSQL retains the shared interpretation allowance and concurrency guards. No unpublished Redis/ingress hardening is claimed by this commit.
- Existing Sarvam, microphone, stock/order, key-isolation, consent, hostile-output, no-fallback and second-question regressions pass. Real OpenAI/provider availability and physical Nord 4 behavior remain acceptance work after deployment.

Publishing this source does not perform a Render deployment, database migration or EAS build. To use OpenAI in the next preview, deploy the same reviewed backend revision, apply migration 0012, configure the documented flags with the stable encryption master key, and enroll the user's key in settings. Other local owner edits remain outside this publication.
