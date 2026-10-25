# OpenAI understanding — personal keys and independent voice choices

Source review: **25 October 2026**. Implemented locally for staging review; no deployment, live OpenAI request or physical-phone acceptance is implied. Existing dated guides retain their historical evidence.

## What changes

Voice setup keeps three independent stages. Selecting OpenAI changes only **Understanding**. It never enables recording, uploads audio, changes the selected narrator or grants another provider consent.

| Stage | Choices and purpose |
|---|---|
| Listening | Existing Moonshine, experimental Whistle and explicitly available online listeners turn speech into a reviewed transcript. Typed input also works. |
| Understanding | On-phone parsing first; unfamiliar wording uses the selected Local-only, Groq or personal-key OpenAI policy. |
| Spoken replies | Existing device voice or separately configured/consented Sarvam reads the locally calculated answer. Alba/Kokoro retain their current build gates. |

An example combination is **Whistle → OpenAI → Sarvam**. Another is **Moonshine → Groq → device voice**. Changing one stage preserves the other two. This feature adds no OpenAI listening or OpenAI speaking voice.

OpenAI starts with **GPT-5.4 mini**, pinned to `gpt-5.4-mini-2026-03-17`. It supports the Responses API and structured outputs. The backend also allowlists the `gpt-5.4-mini` alias; arbitrary models and custom API URLs are refused. [Official model reference](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

## End-to-end architecture

```text
Microphone / typed question
  → chosen listener → editable reviewed transcript → explicit Send
  → deterministic on-phone parser
  → if needed: chosen OpenAI provider + separate question-text consent
  → authenticated CareKosh API → account-owned encrypted key
  → fixed OpenAI Responses endpoint → strict contract-3 plan
  → schema validation + semantic grounding against the question
  → existing local executor over account-authorized inventory
  → factual answer/table or unsaved order draft
  → independently chosen narrator
  → touch review/confirmation required to save an order or change stock
```

Only the reviewed question and a Boolean indicating follow-up context are sent with fixed instructions/schema. Inventory tables, audio, credentials for other providers and previous conversation text are not sent. Names included in the question necessarily reach OpenAI.

The model proposes a bounded plan, never inventory facts. Existing contract 3 supports grouped quantity comparisons, criticality, low/out-of-stock conditions, exclusions and draft lines. The same grounding and executor apply to Groq and OpenAI. Unsupported history, forecasting or ambiguous requests still need clarification.

Examples to verify against your own stock:

- “Show critical items that are low in stock.”
- “Show items with quantity less than three, plus all low and out-of-stock items.”
- “Create a draft for two Ambu bags and all low or out-of-stock items.”
- “Which important low-stock items need attention?”

A stronger language model does not guarantee perfect interpretation. Review the displayed filters, rows, quantities and draft suggestions. Familiar commands can finish locally even while OpenAI is selected.

## Manual backend configuration

Use the intended **Render staging backend**, not EAS environment variables. Keep all unrelated ingress, Redis, database and existing Sarvam/Groq settings unchanged.

1. Review this change and deploy the matching backend through the usual process. Apply migration **`0012_openai_personal_keys`** with the existing migration procedure (`alembic upgrade head`). It adds only `ai_openai_credentials`; it preserves Sarvam credentials, consent and business records.
2. In Render → backend service → Environment, configure the following values. Save through the normal reviewed deployment process.

| Variable | Value / action |
|---|---|
| `AI_ENABLED` | `true` for the reviewed assistant pilot |
| `AI_OPENAI_ENABLED` | `true` to offer personal OpenAI understanding |
| `AI_OPENAI_DATA_CONTROLS_REVIEWED` | `true` only after reviewing OpenAI data policy, disclosures and the deployment's logging controls |
| `OPENAI_INTENT_MODEL` | `gpt-5.4-mini-2026-03-17` |
| `AI_CREDENTIAL_ENCRYPTION_KEY` | Keep the existing stable Fernet secret used for personal Sarvam keys. If none exists, generate it privately once and store it as a Render secret. |
| `AI_OPENAI_INTERPRET_RESERVE_MICROUSD` | `50000` (default and minimum; $0.05 allowance per attempt) |
| `AI_USER_DAILY_REQUESTS`, `AI_GLOBAL_DAILY_REQUESTS` | Existing shared assistant request limits; defaults 50 and 500 |
| `AI_USER_DAILY_BUDGET_MICROUSD`, `AI_GLOBAL_DAILY_BUDGET_MICROUSD` | Existing shared daily allowance; defaults 100000 ($0.10) and 1000000 ($1.00) |
| `AI_GLOBAL_CONCURRENCY`, `AI_TIMEOUT_SECONDS` | Existing controls; defaults 4 and 25 seconds |

There is **no operator `OPENAI_API_KEY` configuration** in this implementation. Each user enrolls their own key through the authenticated app. A personal-key failure cannot charge an application OpenAI account or switch to Groq.

Never replace a working encryption master key casually: existing OpenAI **and Sarvam** rows depend on it. For planned rotation, the existing `AI_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS` accepts up to three former keys. Old rows remain readable until re-saved with the current key; rotation does not rewrite them automatically. Keep secrets and backups under restricted access.

If creating the first master key, run this in the configured backend Python environment and paste its output only into the secret manager:

```bash
python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Do not place personal keys or master keys in Git, documentation, EAS, Expo public variables, screenshots or support messages. No new package dependency or native module is introduced. A new APK is needed to receive these settings; a backend deployment alone does not update the installed app.

## User setup on Android

1. Open **Profile → Voice setup → Understanding**. Listening and Spoken replies remain separately selectable.
2. Under **Your OpenAI account**, paste your own API key and tap **Save OpenAI key**. Confirm encrypted storage. The field clears after saving, leaving the screen or backgrounding. Plaintext is not saved in phone preferences.
3. Tap **Check OpenAI key & model**. This explicitly checks model metadata; it sends no question, recording or inventory and generates no answer. Success does not prove credits or query accuracy.
4. Tap **Use OpenAI understanding**, read and accept the separate question-text consent. Saving/checking a key alone does not select OpenAI or grant this consent.
5. Choose your listener and narrator independently. Review a transcript or type a question, then tap Send. Check the answer's filters and rows.
6. Use **Replace OpenAI key** or **Remove OpenAI key** as needed. Removal preserves the selected provider as needing a key; it does not silently select another provider.

Your OpenAI API billing is separate from a ChatGPT subscription. A project key needs access to the configured model and permission for Responses requests; a restricted key also needs model-read permission for the explicit metadata check. Create/revoke keys in your own OpenAI API dashboard. [Official authentication guidance](https://developers.openai.com/api/reference/overview#authentication).

## Security and privacy boundaries

| Boundary | Enforcement |
|---|---|
| Account isolation | Authentication selects the owner; no client-provided owner ID. Separate OpenAI table, encrypted envelope bound to owner and provider; row deletion cascades with account deletion. |
| Secrets | Printable bounded secret input; secret fields omitted from errors/response bodies. Randomized authenticated Fernet encryption; server master secret remains separate from the database. No plaintext retrieval endpoint. |
| Outbound access | Fixed HTTPS OpenAI URLs, verified TLS, no redirects, environment proxies, arbitrary base URL, automatic retries or alternate credential. Outbound tracing headers stay disabled by existing telemetry policy. |
| Provider response | Bounded body, timeout, duplicate/nonfinite/deep JSON rejection, one completed assistant message, strict schema plus existing semantic grounding. Refusals, incomplete output, tool calls and ungrounded values fail safely. |
| Prompt injection | No tools, browsing, SQL, shell, code execution or database credentials are exposed to the model. Model text is validated as data; it is not evaluated as executable code. |
| Business writes | Interpretation reads no business tables and writes only AI usage metadata. Local results use authorized data. Existing touch confirmation and backend ownership/version checks govern actual writes. |
| Billing isolation | Only the signed-in user's personal key is loaded. Failure never uses an application key, another user's key, another model or Groq. |
| Consent | New explicit `openai_text` scope. Old Groq/Sarvam consent does not grant it. Existing consent version remains unchanged because existing scopes/disclosures are not broadened. |

Responses use `store:false`, no background/streaming and no conversation state. This is **not a Zero Data Retention guarantee**: provider abuse-monitoring and account controls still apply. Avoid patient identifiers in questions. Review [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data#v1responses).

Encryption reduces database-only exposure; a compromised live backend/master secret could still expose credentials. Keep Render access, TLS, logs, crash reporting, dependencies and backups protected. No implementation can promise immunity from every attack.

Removing a key deletes the current CareKosh credential row. It does not revoke the key at OpenAI, cancel work already sent, or remove encrypted copies from retained backups. Revoke a suspected key in the OpenAI dashboard. Withdrawing assistant consent blocks new processing but is separate from key deletion.

## Allowances and clear errors

CareKosh reserves at least **50000 microUSD ($0.05)** before each OpenAI interpretation. This is a shared assistant allowance guard, **not** an OpenAI charge, credit balance or guaranteed provider billing cap. Successful requests settle at the configured model's standard published-price estimate; failed/cancelled requests retain the reservation conservatively.

At the current default $0.10 user allowance, at most two failed full reservations fit per day. A completed low-token request settles lower, but another call still needs $0.05 headroom. Other assistant providers share the daily allowance and request counters.

The checked standard rate is $0.75 per million input tokens and $4.50 per million output tokens; reasoning tokens count within the 3072 output limit. Cached input is conservatively counted at full input price. The bounded request estimate is below the $0.05 reservation at these rates; prices and provider billing remain external. [Official pricing](https://developers.openai.com/api/docs/pricing).

| Situation | User-visible outcome |
|---|---|
| Missing/locked key or paused backend | Settings explains the missing configuration; no alternate provider is used. |
| Rejected key/model permission | Replace/check key. Provider 401/403 is mapped to 409, so it does not sign the user out of CareKosh. |
| No API credits/billing quota | Clear OpenAI-credit error (402). No fallback or automatic retry. |
| Provider rate limit | Clear rate-limit error (429); manual retry later only. |
| Local daily allowance/concurrency | Existing CareKosh limit shown before provider work; distinguish it from OpenAI credits. |
| Timeout/invalid/refused/unsafe response | Error or clarification; nothing is executed or saved from the invalid output. |

## API and code map

| Path | Purpose |
|---|---|
| `GET /api/v1/ai/capabilities` | Additive interpretation providers, OpenAI key metadata, configured model and shared limits; legacy `interpret` Boolean keeps its Groq meaning. |
| `GET /api/v1/ai/openai-key` | Current owner's configured/usable/update metadata only. “Usable” means decryptable/configured, not provider-verified credits. |
| `PUT /api/v1/ai/openai-key` | Bounded secret plus literal `storage_consent:true`; authenticated encrypted upsert. |
| `DELETE /api/v1/ai/openai-key` | Remove only current owner's OpenAI row, even if setup is paused. |
| `POST /api/v1/ai/openai-key/check` | Explicit, rate-limited fixed model-metadata request. |
| `POST /api/v1/ai/interpret` | Optional `provider:"openai"`, contract 3 only; omitted provider remains existing Groq behavior. |

Key metadata is limited to 30 requests/minute, enrollment/removal to 10/minute, and model checks to 5/minute per authenticated account and API worker in this publication scope. These are soft endpoint limits; the shared daily interpretation allowance/concurrency guards use PostgreSQL. Interpretation retains existing request, concurrency and spending guards. This OpenAI-only publication has **51 route objects under `/api/v1`**; four were added for OpenAI keys. Unpublished browser/ingress work is outside this commit.

Core implementation: `app/services/openai_interpreter.py`, `openai_credentials.py`, `ai_guard.py`, `app/api/v1/openai_keys.py`, the existing AI routes/schemas, and mobile `OpenAIKeySettings.tsx`, `VoiceSetup.tsx`, `AssistantExperience.tsx`, preferences/provider registry and assistant HTTP service.

The adapter uses Responses structured output, not an autonomous tool loop. Strict schema improves structure, while grounding and touch confirmation enforce meaning and write boundaries. [Official structured-output guidance](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas).

## Verification and remaining acceptance

All provider calls in automated checks use synthetic credentials and mocked transport. Local disposable PostgreSQL 16 and Redis exercise real authentication, persistence, migration and limits. No production/staging database is used.

The [current end-to-end review](AI_VOICE_END_TO_END_REVIEW.md#17-openai-personal-key-understanding--25-october-2026) records final check results. New tests cover credential isolation/rotation, consent, malformed and hostile provider responses, no fallback, no business writes, migration preservation, settings independence, second-question routing and field clearing.

Before release, deploy the reviewed backend/migration and install a matching preview APK. On the Nord 4, verify each listener with OpenAI and Sarvam independently; check the exact complex requests against known inventory; ask a second question. Explicitly authorize one live OpenAI request using your own key/credits to verify real model/schema compatibility. Also test invalid key, quota errors, remove/replace, denied consent and account switching.

Mocked tests do not establish live provider availability, complex-query accuracy or physical microphone/audio behavior. No change here repairs or enables paused Alba/Kokoro. Keep those separate acceptance gates.
