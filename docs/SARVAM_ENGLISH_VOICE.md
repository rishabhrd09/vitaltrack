# Sarvam English narration in CareKosh

> **23 October 2026 — diagnostic listener experiment.** Whistle is a separately selected, English-only offline transcription option in the diagnostic APK. Moonshine remains the default; understanding and narration retain their existing settings. See [Whistle setup, privacy controls and device checks](WHISTLE_OFFLINE_LISTENER.md). Earlier dated evidence below retains its original scope.

Source/configuration review: **13 October 2026**, rechecking the 11 October implementation. This guide describes the current local implementation, not a completed Render deployment or a passed OnePlus audio test. No real Sarvam key or paid inference was used in the automated checks.

## Current choices

| Voice | Status | Requirements |
|---|---|---|
| Device English voice | Default; retained | An eligible installed offline Android TTS voice; no Sarvam key |
| Sarvam English | Implemented; optional online narration | Backend configuration, user answer-text consent, internet and API credits |
| Pocket TTS / Alba | Paused in normal builds. A repaired implementation is offered only in the `preview-voice-diagnostics` test build | Phone acceptance on the OnePlus Nord 4 and a second phone |
| Offline fallback for Sarvam | Optional, **off by default** | Choose an offline voice after a successful preview |
| Hosted Kokoro / legacy Piper | Existing backend adapters remain disabled in this mobile release | Separate service, asset/runtime review and a later mobile integration |

Alba repeatedly failed the owner's OnePlus Nord 4/OxygenOS 15 acceptance test while device TTS was audible.
- The separate 13 October offline investigation recorded roughly 10 GB peak memory on its host CPU test path. This is evidence about that measured host workload, not a measured OnePlus memory footprint or proof of the phone's exact failure.
- It is still unproven on the phone and stays paused in normal builds.
- Existing Alba preferences migrate to device speech; no cloud voice is selected automatically.
- Removing its pack does not remove the separate Moonshine recognition pack, inventory or orders.

See the [Alba investigation](POCKET_TTS_ALBA.md#offline-voice-investigation--13-october-2026).

## Model and English voice selection

| Backend setting | Default, with published pricing | Optional latest model |
|---|---|---|
| `SARVAM_TTS_MODEL` | `bulbul:v3` | `bulbul:v4-flash` |
| `SARVAM_SPEAKER` | `ritu` | `aparna_en_companion` |
| Language | `en-IN` | `en-IN` |
| Output | Request WAV at 24 kHz; decoder accepts mono PCM16 | Same; live format still needs verification |
| User pace | Relaxed 0.9 / Natural 1 / Brisk 1.1 | Same |

Sarvam recommends **v4 Flash for new integrations**; its English guide recommends Aparna for an empathetic companion style. The pricing page reviewed here lists v3, with no separate v4 Flash rate. We therefore default to v3/Ritu for a budget-visible pilot while supporting a deliberate backend switch to v4/Aparna after account pricing/access and real voice quality are checked. Neither is claimed to be the acoustically best voice without auditioning it. [REST contract](https://docs.sarvam.ai/api-reference/text-to-speech/convert), [v4 Flash guidance](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/best-practice-guide-for-bulbul-v-4-flash), [pricing](https://docs.sarvam.ai/api/getting-started/pricing).

Leave `SARVAM_SPEAKER` empty to select the default for the configured model. If it is set explicitly, change both model and speaker together. Short v3 names cannot be used with v4 persona IDs. The implementation accepts the documented v3 catalog and a reviewed v4 English shortlist: `aparna_en_companion`, `sanchita_en_companion`, `simran_en_customer`, `shubh_en_narration_gentle`. Invalid pairs make Sarvam unavailable before a billable request. [Voice catalog](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices).

Temperature is fixed at 0.3 for more consistent delivery. “Relaxed” changes generation pace; it is not a separately trained emotional voice. We omit pitch, loudness and preprocessing overrides because the current v4 best-practice page and REST schema disagree about them. Hindi output is not part of this release; selecting a Hindi voice would not itself translate the English answer. It requires a separate language/content and pronunciation review.

## Configure personal keys and activate staging

Personal Sarvam keys are supported through **Settings → Voice setup → Spoken replies → Sarvam account**. Each user creates a key in [Sarvam's dashboard](https://dashboard.sarvam.ai/), pastes it into the masked field and confirms encrypted storage. The backend is a proxy: it briefly decrypts that account's key to call Sarvam over HTTPS. This is encrypted server storage, not end-to-end encryption or a device-only vault. Sarvam requires the secret in its subscription header; it must not be embedded in the APK. [Authentication contract](https://docs.sarvam.ai/api-reference/authentication).

**First staging pilot:** use the operator's own `SARVAM_API_KEY` on its own backend and keep `AI_SARVAM_BYOK_ENABLED=false`. The general terms restrict third-party credential disclosure; no specific permission for a public customer-key proxy was established by this review. Enable third-party personal-key use only under an applicable permitted arrangement. The following encrypted-storage steps remain available for an authorised deployment. [Terms and product-agreement precedence](https://www.sarvam.ai/terms-of-service).

### Exact Render steps for staging

1. Open the **staging backend web service**, confirm its linked Git branch is `feature/backend-hardening-ai-voice-agent-foundation`, and deploy the reviewed revision containing this implementation after it has been committed/pushed. Do not edit the production/main service. The existing Docker entrypoint runs `alembic upgrade head` before Gunicorn; verify deploy logs show **`0011_sarvam_personal_keys`**. If using a different start command, run the migration explicitly before serving this revision. It adds a credential table and a billing-source column; it does not modify stock/order rows.
2. **Skip this step for the operator-key-only pilot.** If an authorised deployment enables personal-key storage, generate a fresh **encryption master key once** on your Mac. This command uses Python's secure random generator and prints a Fernet-compatible key. Do not send its output to chat or commit it:

```bash
python3 -c 'import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())'
```

3. Set the following values in **Render → staging service → Environment** and save/redeploy. Store the operator's Sarvam key as a secret. If personal-key storage is enabled, store the generated master key as a separate secret:

| Variable | Value for this pilot |
|---|---|
| `AI_ENABLED` | `true` |
| `AI_SPEECH_ENABLED` | `true` |
| `AI_SARVAM_ENABLED` | `true` |
| `AI_SARVAM_BYOK_ENABLED` | `false` for the first operator-key pilot; `true` only for an authorised personal-key deployment |
| `AI_CREDENTIAL_ENCRYPTION_KEY` | The generated stable private master key if personal-key storage is enabled |
| `AI_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS` | Leave empty for the first setup |
| `AI_SARVAM_DATA_CONTROLS_REVIEWED` | `true` after reviewing Sarvam terms/answer-text handling |
| `SARVAM_TTS_MODEL` | `bulbul:v3` |
| `SARVAM_SPEAKER` | `ritu` |
| `AI_SARVAM_TRANSCRIBE_ENABLED` | `false` |
| `SARVAM_API_KEY` | Operator's own key for the initial pilot; unset for an authorised personal-key-only deployment |

**Budget for a test day (15 October 2026).** The defaults allow 50 AI requests and 100,000 accounting units per account per day. For staging tests, also set:

| Variable | Suggested staging value | What it allows |
|---|---|---|
| `AI_USER_DAILY_BUDGET_MICROUSD` | `500000` | about 40 Sarvam replies of 300 characters, plus understanding |
| `AI_USER_DAILY_REQUESTS` | `200` | room for previews and follow-up questions |
| `AI_GLOBAL_DAILY_BUDGET_MICROUSD` | `2000000` | at least the per-account value for every tester |

These are CareKosh's own limits, not Sarvam's billing; Sarvam credits still apply. See [cost accounting](#cost-accounting--15-october-2026).

If personal storage is enabled, keep the encryption master key in a password manager as well. Use separate encryption keys and provider accounts for staging and production. Do not replace your JWT `SECRET_KEY`, `DATABASE_URL`, Groq key or other existing settings. Losing the encryption master key makes saved personal credentials unreadable.

Before enabling `AI_SARVAM_DATA_CONTROLS_REVIEWED`, configure the Sarvam workspace's **Model APIs retention override to 0 days**. Separately disable training in **Organisation → General**. These require owner access, do not change historical retention retroactively and do not establish a personal-key user's workspace policy. Review the production consent disclosure for retention and international transfers. [Retention controls](https://docs.sarvam.ai/api/platform/data-retention), [training control](https://docs.sarvam.ai/api/platform/faq).

Keep `AI_TRANSCRIBE_ENABLED` and `AI_DATA_CONTROLS_REVIEWED` as required for your existing Groq listening/understanding; those are different gates. Leave `AI_KOKORO_ENABLED` and `AI_ALBA_RIGHTS_APPROVED` false for this release. `render.yaml` still describes production on `main` and does not enable this feature or provision staging.

4. In the initial operator-key pilot, `sarvam_application_available` should be true and personal setup stays unavailable. For an authorised personal-key deployment, `sarvam_personal_key.setup_available` must be true. Before saving, `configured` and `usable` are false. With no operator key, Sarvam is absent from `speech_providers` until this account has an unlockable saved key. `usable:true` means decryptable/configured, not authenticated by Sarvam or funded. `/health` alone cannot prove the revision or speech configuration.
5. Build/install a new preview APK pointing at this staging service. No API key or encryption key belongs in EAS or `EXPO_PUBLIC_*`. Current build command:

```bash
cd vitaltrack-mobile
eas build --profile preview --platform android
```

6. On the phone, choose **Recheck voice & online understanding**. For the operator-key pilot, explicitly choose the application account, select **Use Sarvam English voice**, accept answer-text consent and press **Preview voice**. For an authorised personal-key deployment, save your key and confirm storage first; saving selects personal billing without enabling voice/consent/automatic reading. Then select Sarvam, consent and test. Enable **Read answers aloud** separately if wanted. Tests consume the selected account's credits.

For local backend work, use the ignored `vitaltrack-backend/.env` with these same settings and run the migration against your local development database. The committed `.env.example` contains blank secrets and disabled defaults. This guide does not perform a deployment, push or APK build.

### Personal-key lifecycle and billing boundaries

- **Save/Replace:** authenticated `PUT /api/v1/ai/sarvam-key` with a printable ASCII key of 8–512 characters and `storage_consent:true`. One atomic upsert per account; no provider call and no automatic consent. Validation checks format, not validity or balance.
- **Status:** `GET /api/v1/ai/sarvam-key` or capabilities returns only `setup_available, configured, usable, updated_at`. No key, ciphertext, masked prefix or suffix is returned.
- **Storage:** Fernet authenticated encryption with an envelope bound to user ID and narration provider; the ciphertext lives in `ai_sarvam_credentials`. The encryption master key stays outside PostgreSQL. No raw API key is stored in mobile preferences, SecureStore, logs or AI prompts. The unsaved masked field is memory-only and clears after submission, leaving Voice setup or backgrounding. CareKosh does not erase the operating system clipboard or promise zero copies in transient process memory. [Fernet and rotation](https://cryptography.io/en/latest/fernet/).
- **Test:** a fixed short English sentence goes through normal consent, limits, synthesis and playback using the **personal** source, even if device voice is selected. Testing does not switch the selected voice or automatic read-aloud.
- **Billing selection:** `credential_source:"personal"` on `POST /ai/speak` uses only the authenticated owner's saved credential; `"application"` uses only the optional operator key. Missing, invalid, revoked, unreadable or quota-exhausted personal credentials never fall back to shared billing or another user. The phone stores only this source choice per account.
- **Remove:** `DELETE /api/v1/ai/sarvam-key` removes this account's live encrypted row, including when the feature is paused or encryption configuration is broken. Removing a selected personal key returns this device to device speech; application billing needs an explicit choice. Removal does not revoke the key at Sarvam or erase encrypted historical database backups. Account deletion cascades the live credential row. Consent withdrawal stops narration but does not remove the saved key.
- **Cancellation:** a save/remove whose response is lost may already have committed. Recheck before retrying. A submitted Sarvam speech request may still consume credits after Stop/logout/removal; those actions prevent late playback, not retroactive provider charges.
- **Rotation:** optional `AI_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS` accepts at most three comma-separated prior Fernet keys. New saves use the primary key; existing rows can unlock with a previous key. There is **no automatic rewrite**: retain old keys until all affected credentials have been re-saved or deliberately re-encrypted. Restored backups may also need the old master key. Never casually regenerate it on each deploy.

## Data flow and permissions

```text
Microphone → Moonshine or opted-in Groq Whisper → reviewed transcript → Send
  → local parser or opted-in Groq interpretation → validated inventory/draft answer
  → concise speechText(answer), at most 640 characters
  → selected Sarvam + read-aloud choice (or touch Hear answer/Preview)
  → authenticated CareKosh POST /api/v1/ai/speak
  → exact sarvam_speech consent + selected credential source + feature/model gates
  → owner-scoped key unlock (personal) or application secret + atomic usage reservation
  → Sarvam POST /text-to-speech, private api-subscription-key
  → base64 decode + bounded mono PCM16 WAV / signal validation
  → no-store audio/wav response → temporary phone file → fresh Expo AudioPlayer
  → actual playback completion or visible failure → release player + delete file
```

Sarvam receives the short narration text, which can contain recorded item names, quantities and suppliers. This request sends no microphone recording, full inventory list, executable task or order mutation. The app computes the answer from the same validated facts shown on screen; Sarvam is a speech generator, not an agent deciding inventory actions. It does not improve recognition or Groq interpretation accuracy. Consent/usage and separately saved encrypted credentials can be written to the database; inventory and order tables are untouched by narration.

Defaults remain device speech and no automatic reading. Choosing Sarvam does not change Groq text consent, online listening, microphone enablement or the recognition pack. Device voice remains explicitly selectable. Offline fallback is off by default and requires the separate previewed choice below; there is no silent online opt-in or billable retry. Each new Preview/Hear answer request can consume credits; no replay cache is implemented. Withdrawing all cloud consent disables Groq online modes and returns narration to device speech; a failed server withdrawal is reported for retry.

## Bounds, cancellation and failures

- CareKosh accepts only English narration text of 1–640 characters and one of three reviewed paces. Speech requests carry only an explicit application/personal billing selector, not a raw key. Raw key text goes only to the separate authenticated storage route. The client cannot choose an arbitrary model, speaker, URL or language.
- The server makes one bounded request: a default 25-second total deadline and a 5-second connect timeout. The response limit was 4 MB; **since 13 October 2026** it is 5.2 MB for Sarvam, enough for the 80-second maximum at 24 kHz. The audio must be mono PCM16 WAV, 8–48 kHz, nonempty, complete and at most 80 seconds. Effectively silent PCM is rejected. These checks do not prove intelligibility or physical phone sound.
- The phone bounds preparation at 35 seconds, player startup at 15 seconds and playback at 95 seconds. It explicitly disables recording mode for playback, uses the media output instead of the earpiece, and respects the phone's selected speaker/headset/Bluetooth route and volume.
- Each reply owns a fresh player. It waits for loaded audio before playing and for a completion event before reporting completion. Cancellation, another question, closing/leaving, backgrounding, logout or account change prevents late results from playing and releases temporary audio. An already submitted provider request may still be charged after cancellation; cancellation cannot undo it.
- **Since 13 October 2026, Sarvam errors name the cause.** There is still no retry and no key switch.
  - A rejected key returns 409 for a personal key ("replace it in Voice setup") or 503 for the CareKosh account.
  - No credits returns 402.
  - Busy returns 429 with `Retry-After`.
  - A rejected request format returns 502.
  - Only the status, Sarvam's error code and `request_id` are logged; never the key or the answer text. See the [review against Sarvam's documentation](#review-against-sarvams-documentation--13-october-2026).
- **Since 15 October 2026, limits explain themselves.**
  - **Per kind, not per account.** Each account may have one understanding, one speech and one transcription request in flight at once. Earlier (13 October 2026), any one request blocked the others, so a question asked while an answer was being spoken was refused.
  - **Cancel reaches the provider.** If the phone disconnects, interpretation, narration and transcription work are cancelled. Transcription cancellation also stops normalization and deletes its temporary source file. A request already accepted by a provider may still be billed; its full reservation stays counted.
  - **Busy.** A long wait for the shared budget lock answers 503 "AI is busy", with `Retry-After: 5`.
  - **Daily limits** say they reset at 00:00 UTC (05:30 in India). `Retry-After` counts the seconds until then; earlier it said "3600".
  - **On the phone.** A 429 keeps the server's wording. A wait of up to 90 s is shown in seconds, a longer one as a local clock time. Understanding and listening retry once only for a 429 marked `X-AI-Error: busy` with a delay of at most 10 s. Daily limits and route rate limits never automatically retry. Speech never automatically retries.
  - **Rate limits.** Soft counters follow the authenticated account, not forwarded IP headers, so clinic Wi-Fi users do not share one AI counter. Each route permits 30 calls/minute, capabilities 60; key routes permit 30 reads, 10 saves and 10 deletes. These counters are per route and per server process: two workers can admit twice a single-worker limit. They are not a distributed abuse-control guarantee. Daily request/budget limits and global/per-kind concurrency are separately enforced in PostgreSQL across workers. Public-scale rollout still needs a deliberate shared limiter/edge policy.
  - **Timeouts.** Each AI attempt has a 70 s phone deadline. A short busy retry can make the whole interaction longer. A timeout says the server took too long and may be starting up, not "Request cancelled". Provider, normalization and upload limits do not certify Render's proxy deadline or cold-start latency.
- Provider/quota/timeout, corrupt/silent audio and playback failures are visible while the factual answer remains on screen. Selecting device voice requires the user's choice. The native Check audio output tone tests a separate native playback path; it does not certify Sarvam's generated clip or Expo player.
- If the user has turned on the [optional offline fallback](#optional-offline-fallback--13-october-2026), a Sarvam failure that happens before any Sarvam audio played is followed by the chosen offline voice reading the same answer once. Nothing else changes.

## Review against Sarvam's documentation — 13 October 2026

On 13 October 2026, Sarvam's REST reference, voice guides, pricing, rate-limit, error, billing, data-retention and legal pages were compared with the code. The raw OpenAPI file returned 404, so each enum was confirmed in two separate pages. No Sarvam API call was made.

**What matches:**

- the endpoint, the `api-subscription-key` header and the JSON fields;
- the model and English speaker pairs (`bulbul:v3`/`ritu`, `bulbul:v4-flash` with four reviewed English voices);
- `en-IN`, the pace and text bounds, 24 kHz WAV output, and the one-clip base64 response;
- personal-key handling: no fallback to shared credits, nothing logged, and no route to any other host.

**Fixed with mocked tests** (`vitaltrack-backend/tests/test_sarvam_transport.py`):

1. Sarvam's error codes are mapped to clear messages (see "Bounds, cancellation and failures" above).
2. The response cap now fits the 80-second limit.
3. The internal per-reply allowance is now 25,000 units. This limits application usage; it does not measure live exchange rates or guarantee the provider's invoice.
4. Sentry no longer adds trace headers to calls to Sarvam or Groq.
5. CI now runs the Sarvam unit tests in `unit_tests/`.

**Still open:**

- **Real WAV format.** Sarvam does not document channels or bit depth. Make one owner-authorised preview call; it uses credits.
- **Retention and training.** Sarvam's pages disagree about the defaults. Set the workspace's **Model APIs** retention override to 0 days. Separately disable training in **Organisation → General**. Review the consent disclosure for retention and transfer abroad; changing it needs a new consent version.
- **Personal keys and Sarvam's terms.** Keep public third-party BYOK off until a permitted arrangement covers customer-key disclosure. This does not prevent an operator-owned-key staging pilot.
- **Voice choice.** Sarvam recommends `ishita` or `ratan` for v3 English; `ritu` is valid. Listen before changing `SARVAM_SPEAKER`.
- **v4-flash and `temperature`.** Sarvam's two pages disagree. Make one real call before setting `SARVAM_TTS_MODEL=bulbul:v4-flash`.
- **Revoked personal keys** keep `usable: true` in capabilities until a request fails. The failure message then says to replace the key.

The full table, with severities and the manual Render steps, is in the [end-to-end review](AI_VOICE_END_TO_END_REVIEW.md#4-sarvam-review-against-current-sarvam-documentation).

## Optional offline fallback — 13 October 2026

**Setting:** Voice setup → Sarvam · English → *If Sarvam is unavailable* → **Use an offline voice when online speech is unavailable**. It is off by default and is shown only while Sarvam is the selected voice.

- **Choosing a voice.** Turning it on lists the offline voices that are ready.
  - Device voice: an installed offline Android English voice.
  - Alba: only in the diagnostics test build, once its verified pack is downloaded.
  - The chosen voice is previewed first and saved only if the preview plays. Turning the setting off removes it.
  - A paused or unknown voice saved earlier loads as "off"; it is never swapped for another voice.
- **When it is used.** Only after Sarvam fails before any Sarvam audio started, for example a timeout, network or provider error, missing consent, or an unavailable key.
  - It reads the **same validated short answer once**, on the phone.
  - It is never used after Stop, another question, leaving the screen, backgrounding or an account change.
  - It is never used once Sarvam audio had started, so nothing is read twice.
- **What it never does.**
  - It never sends a second Sarvam request.
  - It never switches the personal/application key source (no shared-key fallback).
  - It never changes consent, and never downloads a model.
  - A Personal key test never falls back, because it tests the key.
- **What you see.** While reading, the answer shows "Sarvam unavailable · reading with Device voice (offline)…". Afterwards it shows "Read aloud with Device voice (offline) because Sarvam was unavailable." Voice setup also shows the Sarvam reason.
- **When the fallback voice isn't ready.** The message says so truthfully, nothing is spoken, and the answer stays on screen.
- **Charges.** A Sarvam request that was already sent may still be charged. Using the fallback does not reverse that.

Source: `vitaltrack-mobile/features/assistant/narration.ts`, wired in `components/assistant/AssistantExperience.tsx`. Tests: `tests/speech-fallback.test.cjs` covers the state machine, preferences and build flags; `tests/assistant-inline.test.cjs` covers the screen: one answer read once, no second request, no fallback after audio started or after Stop, the honest "not ready" error, and preview-before-save.

## Free credits, cost and existing quotas

Each personal key bills its own Sarvam account. Multiple keys from the same Sarvam account share that account's credits; they do not each grant a new free balance. Sarvam is **not unlimited free TTS**. Current documentation grants new accounts ₹100 in introductory API credits. Published v3 pricing is ₹30 per 10,000 characters: a 300-character reply is about ₹0.90, a 500-character reply ₹1.50, and 640 characters ₹1.92 before any applicable adjustments/taxes. ₹100 could cover roughly 111 replies at 300 characters if those credits are available and used only for speech. Account balances, eligibility and v4 pricing have not been checked. [Pricing](https://docs.sarvam.ai/api/getting-started/pricing), [credits and rate limits](https://docs.sarvam.ai/api/getting-started/ratelimits).

Personal and application sources share the existing CareKosh quotas across all external AI operations: default 50 requests/account/day, 500 globally/day, 100,000 micro-USD account/day and 1,000,000 globally/day. Sarvam speech reserves 25,000 accounting units per attempt (20,000 before 13 October 2026). Earlier (13 October 2026), every attempt was charged its whole reservation, so the default account allowance admitted at most four speech attempts. Preview also counts. This internal accounting is not a live INR/USD calculation, actual invoice or provider billing cap; check both application usage limits and Sarvam credits before changing limits. Do not promise that the credit pool alone determines how many answers the app allows. Earlier, only one in-flight external request per account was allowed; since 15 October 2026 it is one per kind (understanding, speech, transcription). There is no unbounded billable queue.

### Cost accounting — 15 October 2026

The reservation still guards each call. After a **successful** call, the server lowers the charge to an estimate from published prices, never above the reservation. A failed or cancelled call keeps the whole reservation, because the provider may still bill it.

| Call | Estimate | Price source (checked 15 October 2026) |
|---|---|---|
| Sarvam speech (`bulbul:v3`) | 38 micro-USD per character (`AI_SARVAM_SPEAK_MICROUSD_PER_CHAR`) | ₹30 per 10,000 characters is about 34 micro-USD per character at ₹88/USD; 38 adds margin. Taxes are not included. [Sarvam pricing](https://docs.sarvam.ai/api/getting-started/pricing) |
| Groq understanding (`openai/gpt-oss-20b`) | 75 per 1,000 input tokens and 300 per 1,000 output tokens | USD 0.075 and 0.30 per million tokens. [Groq models](https://console.groq.com/docs/models) |
| Groq listening (`whisper-large-v3`) | 31 micro-USD per second, at least 10 s | USD 0.111 per audio hour; Groq bills at least 10 s |

**Examples.** A successful 300-character reply settles at 11,400 units; a 150-character reply settles at 5,700. However, the full 25,000-unit reservation must fit **before each call**. With the default 100,000-unit day and no other AI usage, this permits **seven** 300-character replies or **fourteen** 150-character replies. A remaining balance below the reservation cannot start another call. For identical successful calls, the count is `floor((budget - reservation) / settled_cost) + 1` when the first reservation fits; daily request/global limits can reduce it. One Groq understanding call of 1,500 input and 300 output tokens settles at 203 units. Failures, previews and other AI use consume the same allowances.

Source: `estimated_cost` and `settle` in `vitaltrack-backend/app/services/ai_guard.py`; settings in `app/core/config.py`. Tests: the V-23 tests in `tests/test_ai.py`.

Sarvam states that API output made using consumed account credits, including introductory credits, can be shipped commercially subject to its terms. This does not grant rights to its model weights or make the service an offline open-source voice. [Commercial licensing](https://docs.sarvam.ai/api/getting-started/commercial-licensing).

## Can Kokoro be free instead?

Kokoro-82M weights are Apache-2.0 licensed. The current working tree includes an embedded **diagnostics-only** English experiment through Moonshine 0.1.5, without another Android app or eSpeak. It is not enabled for normal users: phone inference/playback, item pronunciation and the OOV pronunciation-model rights still need acceptance. The weight licence does not automatically cover every dependency. A hosted alternative also has compute/storage costs even without a third-party per-answer speech fee. See [the offline experiment](POCKET_TTS_ALBA.md#kokoro-test-voice-v-41) and the [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M).

For an **embedded** (on-phone) Kokoro, the 13 October evaluation picked one GPL-free route with no new native library: the `TextToSpeech` API in the already-shipped Moonshine 0.1.5 library. It is plan B if Alba fails on the phone; see [the evaluation](POCKET_TTS_ALBA.md#embedded-kokoro-evaluation-and-plan-b). The repository already retains a disabled hosted Kokoro worker (`bf_emma`, ONNX) and backend adapter. That hosted worker is not offline phone inference. Its deployment and real synthesis are unverified. Sarvam is the current optional online integration; switching to Kokoro later requires its own service/device acceptance, UI enablement and consent work. See [the retained Kokoro worker guide](../voice-service/README.kokoro.md).

## Verification and OnePlus acceptance

Automated tests use synthetic audio and mocked provider/device APIs. They exercise exact provider headers/payloads, model/voice matching, separate consent and listening gates, authentication/usage reservation, WAV validation, file cleanup, player completion, cancellation, account changes, spoken answer and second-question wiring. They do not audition Ritu/Aparna or emulate OxygenOS audio hardware.

**Fresh recheck — 13 October 2026:** 312 backend tests passed using a fresh disposable local PostgreSQL database, plus a repeated run of 70 AI/personal-key checks against a disposable database built by Alembic; 269 mobile tests, TypeScript and focused backend/mobile lint checks passed. All 50 registered operations are documented, including the three personal-key routes. The request headers, v3/Ritu model/voice pairing and WAV payload were rechecked against the current [Sarvam REST contract](https://docs.sarvam.ai/api-reference/text-to-speech/convert) and [authentication documentation](https://docs.sarvam.ai/api-reference/authentication). No further implementation defect was found within this reviewed scope. No real provider synthesis, Render configuration/deployment or new Android release build was performed.

Documentation checks found no broken local links across 112 checked files; the system-design check validated 22 SVG diagrams and 35 inline figures. Source-derived voice-settings previews fit narrow screens and large text, and the narration guide and architecture diagrams were inspected in a local browser. These layout previews and mocked audio tests are not physical-device acceptance or proof of live Sarvam availability. Existing microphone/native build and staging URL configuration have no local changes in this integration.

The [offline TTS investigation prompt](OFFLINE_TTS_INVESTIGATION_PROMPT.txt) led to the 13 October changes.
- The Alba diagnosis and repair are tested on a desktop host only.
- The opt-in [offline fallback](#optional-offline-fallback--13-october-2026) is implemented and covered by mocked-device tests.
- Device voice remains manually selectable, and the fallback is off unless chosen. Phone acceptance is pending.

After backend configuration and a new APK:

1. In the first staging pilot, explicitly choose application billing with the operator's configured key. Select Sarvam and press Preview voice. Hear an English sentence, see completion, then repeat at Relaxed pace. Confirm your account shows a small speech usage entry. Test saved personal keys only in an authorised personal-key deployment.
2. Ask a stock question. The visible figures and spoken summary must agree. Test Hear answer with automatic reading off, then turn automatic reading on.
3. Ask another question during speech. Old audio must stop; recording/transcript review and the second answer must work. Repeat after finishing a reply, leaving/reopening settings and returning from the background.
4. Test speaker and Bluetooth separately, with media volume audible.
   - **Internet off, fallback off:** a narration error shows and the answer stays on screen. Then manually select device voice and confirm offline speech.
   - **Fallback on:** after previewing the device voice, ask again with internet off. The same answer is read once by the device voice, the "Read aloud with Device voice (offline)…" note appears, and your Sarvam usage shows no second request.
5. Replace/remove the key, switch to another account and verify it cannot use your key. Check a bad personal key gives a visible error without shared billing. Withdraw consent or change accounts during preparation. No late clip may start. Check that voice still cannot save an order or change stock.

Until these pass, describe Sarvam as implemented and locally verified, **pending live account and device acceptance**. It is not a confirmed fix for physical sound on the OnePlus.

## Independent follow-up — 13 October 2026

The fresh review found stale consent dialogs that could act after an account switch. Dialogs now retain the originating session and turn; backgrounding, leaving or changing accounts makes them ineffective. Additive consent rechecks current scopes before updating. Withdrawal also binds the original account across a slow preference save. Speech-pack actions have the same session guard.

The speech player now records detected partial playback before handling a player error, so optional offline fallback cannot repeat an answer already started online. Voice setup says **Configured · preview to verify** for Sarvam, rather than claiming live key validity or audible output. Large-text provider controls remain individually accessible, and long table units wrap.

The wider query fixes and reproduced results are in the [independent review](AI_VOICE_END_TO_END_REVIEW.md#12-independent-follow-up). They do not add microphone, order-save or stock-update tools. Native Alba changes remain a separate experimental investigation; device, live provider and deployment acceptance are still pending.

## Modular source map

| Responsibility | Source relative to repository root |
|---|---|
| Backend flags, optional shared key and encryption secrets | `vitaltrack-backend/app/core/config.py`, `vitaltrack-backend/.env.example` |
| Fixed English model/speaker, payload, decoding and signal checks | `vitaltrack-backend/app/services/sarvam_speech.py` |
| Bounded provider HTTP and shared WAV validation | `vitaltrack-backend/app/services/ai_provider.py` |
| Authenticated routes, capabilities, scoped consent and quotas | `vitaltrack-backend/app/api/v1/ai.py`, `app/services/ai_guard.py`, `app/schemas/ai.py` |
| Encrypted personal vault, owner-scoped routes and migration | `vitaltrack-backend/app/services/sarvam_credentials.py`, `app/api/v1/sarvam_keys.py`, `alembic/versions/20261011_sarvam_personal_keys.py` |
| Client API, account/session boundaries | `vitaltrack-mobile/services/assistant.ts`, `services/assistantSession.ts` |
| File lifecycle and per-reply audio player | `vitaltrack-mobile/features/assistant/cloudSpeech.ts`, `features/assistant/audioFiles.ts` |
| Optional offline fallback (read once, no second request) | `vitaltrack-mobile/features/assistant/narration.ts`, `features/assistant/preferences.ts` (`speechFallback`) |
| Opt-in migration and voice selection policy | `vitaltrack-mobile/features/assistant/preferences.ts`, `features/assistant/policy.ts` |
| Masked personal key field and explicit billing controls | `vitaltrack-mobile/components/assistant/SarvamKeySettings.tsx`, `features/assistant/sarvam.ts` |
| Voice setup, read-aloud and cancellation orchestration | `vitaltrack-mobile/components/assistant/VoiceSetup.tsx`, `components/assistant/AssistantExperience.tsx` |
| Backend contracts and mobile/device simulations | `vitaltrack-backend/unit_tests/test_sarvam_speech.py`, `vitaltrack-backend/tests/test_ai.py`, `vitaltrack-mobile/tests/cloud-speech.test.cjs`, `tests/assistant-inline.test.cjs`, `tests/voice-policy.test.cjs` |

Microphone capture, Moonshine native inference, Groq interpretation, draft construction, order confirmation and PDF utilities are separate existing modules. No new native library or Python speech-generation server is introduced. Migration 0011 adds encrypted personal-key storage and usage billing-source metadata; no mobile API-key storage is introduced. Registered routes now total 50 operations (47 under /api/v1), and there are 12 application tables plus alembic_version.
