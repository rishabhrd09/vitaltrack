# Option 1 — offline Android voice with optional cloud pilots

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

> **8 October 2026 local feature update:** richer inventory tables, bounded queries and unsaved voice-prepared drafts are implemented locally. Only touch confirmation saves an order; saving does not change stock. Matching backend/mobile deployment and phone acceptance remain pending. [Current flow, code map and verification limits](VOICE_INVENTORY_AND_ORDER_DRAFTS.md). Earlier dated results remain historical.


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

Implementation date: 6 October 2026. This is a local implementation, not a deployed or device-qualified release. No secrets, recordings or model weights are committed. Existing unrelated working-tree changes are preserved.

> **Status (documentation audit, 7 October 2026; re-checked 8 October 2026 against the working tree, `03cfebb` plus uncommitted documentation):** the implementation is now committed and pushed on branch `feature/backend-hardening-ai-voice-agent-foundation`: `07847a4` and `b1c8dd7` (6 Oct) and `03cfebb` (7 Oct, 12:19 IST — tap-to-talk dock, Voice setup screen, text-only Groq consent and the new tests). The branch is **not merged** into `main` (`835fad3`). Staging running `b1c8dd7` is owner-reported (below) and was not re-checked; its backend code is identical to `03cfebb`, but the mobile changes in `03cfebb` reach a phone only through a newly built APK. Production, installed APK versions and real-device recognition remain NOT VERIFIED. The dated sections below are kept as written; statements about current behaviour were corrected against the code on 8 October, and real microphone, Moonshine, Android TTS and Groq behaviour remain NOT VERIFIED. A short current summary is in the [Complete developer guide, C7](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md#c7-the-voice-and-typed-assistant); the endpoint-by-endpoint trace is in [API traceability](API_TRACEABILITY.md).

## Text-only Groq rollout — 7 October 2026 (historical; v2 local extension above)

This section records the historical 7 October rollout. The 8 October speech/understanding follow-up in [the current inventory/draft guide](VOICE_INVENTORY_AND_ORDER_DRAFTS.md) takes precedence for current behavior.
The mobile policy now allows **optional Groq text interpretation** (`CLOUD_TEXT_ENABLED=true`)
while **cloud audio stays disabled** (`CLOUD_VOICE_ENABLED=false`). Moonshine still transcribes
on the phone and Android TTS still speaks locally. Older saved audio-provider choices are
forced back to offline/device. Text understanding starts off for new accounts; enabling
the feature in code does not grant consent on a user's behalf.

In **Voice setup → Understand more wording → Enable Groq understanding**, the user accepts
the disclosure ("I am 18+ and agree"). Only `groq_text` consent is granted in this release.
After **Send**, a question goes to authenticated `/api/v1/ai/interpret` only when all of these
hold: the local matcher found no match, the server reports `interpret: true`, the account has
`groq_text` consent, and the cloud switch is on for this device. Matched commands and local
refusals remain local. That rollout used the v1 body `{"question": <reviewed text>, "has_previous_item": <true|false>}`. The current local implementation adds negotiated `contract_version: 2` for bounded query/draft specifications; v1 remains the default for older APKs.
Groq returns an intent, never stock facts or executable tools. The server and the phone check
its shape; a well-formed intent can still misread the question. The question
can contain item names or anything the user typed or said, so it may itself carry sensitive
words. The inventory list and audio are not sent.
Normal item reads (`GET /api/v1/items`) provide the displayed figures. Provider errors leave basic commands usable.
The phone shows one generic message for every interpret failure. On the server, a provider
timeout or network/DNS error is **504**, another provider error **502**, and a provider 429 is
**429** (`Retry-After: 30`). The phone waits up to 50 s; the server gives Groq 25 s (5 s to
connect) and makes one attempt.
**Withdraw all cloud consent** disables local use immediately and attempts server revocation;
a failed revocation is visibly reported and can be retried.

AI consent and usage metadata are written: an `ai_consents` upsert on enable and on every
withdrawal, and an `ai_usage` row reserved, then settled, for each interpret request that
passes the checks. Inventory and orders are not changed. This is
not a literal zero-database-write mode. Complex historical analytics are still unsupported.

### Staging activation

1. Verify staging is running a backend revision containing `/api/v1/ai/capabilities`,
   `/api/v1/ai/consent` and `/api/v1/ai/interpret`, including its migrations. The remote
   `main` at `835fad3` lacks these routes; feature commit `b1c8dd7` contains them (remote
   tips checked on 7 October). An APK build does not deploy the backend. Do not merge
   into production merely to enable staging; select and review the staging deployment separately.
2. The owner reports `GROQ_API_KEY` is already set on staging. Keep it private in Render;
   never put it in the APK, EAS public variables, Git or chat.
3. In that **staging** service, use the following configuration. Review the actual Groq
   account data controls before setting the corresponding acknowledgement to true:

   ```dotenv
   AI_ENABLED=true
   AI_DATA_CONTROLS_REVIEWED=true
   GROQ_INTENT_MODEL=openai/gpt-oss-20b
   AI_TRANSCRIBE_ENABLED=false
   AI_SPEECH_ENABLED=false
   AI_SARVAM_ENABLED=false
   AI_KOKORO_ENABLED=false
   AI_ALBA_RIGHTS_APPROVED=false
   ```

   Keep existing conservative request, concurrency and budget limits. Default credits
   currently allow at most 20 interpretation attempts per user and 200 globally each day
   (a day starts at 00:00 UTC, 05:30 IST), subject to other usage and tighter provider
   limits. Failed attempts also count. These
   application credits are not Groq billing caps. Use the provider's Free plan for a
   free-tier pilot (it guarantees no capacity) and monitor shared organization limits; do not enable paid billing
   assuming these app limits guarantee zero spend.
4. Build the preview APK from this working directory to include the text toggle and the
   microphone focus fixes (the `preview` EAS profile points the app at
   `https://staging-api.carekosh.com`). Install it, open Voice setup, and choose **Recheck voice &
   online understanding**. If unavailable, verify staging routes/configuration/connectivity.
5. Opt in, then try an unfamiliar typed stock question first, such as “Which supplies should
   I keep an eye on because they are running short?” Compare the result with Inventory.
   Then record, review/edit, and Send. Verify that familiar questions remain usable with
   cloud understanding turned off and that withdrawal blocks future interpretation calls.

Provider references checked on 7 October: [Groq limits](https://console.groq.com/docs/rate-limits),
[structured outputs](https://console.groq.com/docs/structured-outputs), and
[data controls / Zero Data Retention](https://console.groq.com/docs/your-data).
Groq documents optional zero data retention; it is not assumed enabled on this account.
Groq's Services Agreement (last modified 22 June 2026) excludes protected health information
outside a business associate agreement, so questions should carry no patient details.
Live Render flags, actual provider responses and microphone hardware remain unverified.

### Independent verification after staging configuration — 7 October

- Live staging `/live` returned HTTP 200 and `environment: staging`.
- Live staging `/api/v1/ai/capabilities` returned **HTTP 404**, consistent with the
  owner's screenshot showing deployed commit `835fad3`. Environment changes cannot
  add routes absent from the deployed code. `/openapi.json` is also 404, but that alone
  is not an error: this repository disables the documentation endpoint unless DEBUG is on.
- Fresh PostgreSQL 16 cluster, testing-only database, real migrations: **242 backend
  tests passed**, including a new text-only configuration test from authenticated
  request through consent, provider payload/response validation and usage settlement.
- Independent API/voice audit: **54 checks passed**. Table checksums and observed SQL
  confirmed only `ai_consents` and `ai_usage` changed during the audited voice flow.
  Business tables, including items and orders, were unchanged.
- Mobile: **121 tests passed**; TypeScript passed; lint had zero errors and three
  existing warnings. Backend Ruff and the 44-route registration check passed.
- Providers were mocked; no real API key, recording or staging/production database was
  used in these tests. The disposable PostgreSQL server was stopped after completion.
  These results do not prove real-device microphone behavior or actual Groq interpretation.
- Re-run on 8 October 2026 against a disposable local PostgreSQL 16 database: 242 backend
  tests passed, the 89-step API walkthrough matched, 121 mobile tests passed; lint now shows
  zero errors and one warning (two unused imports were removed). Providers were still faked.
- Evidence: a backend log, an audit log and voice database evidence, kept in a private,
  unpublished audit folder (not linked from this public document). The documentation audit's own
  reproduction (same day, separate disposable database) is in
  documentation-audit-2026-10-07/evidence (local review reference; not published).

**Deployment update, 7 October after 12:03 IST:** the owner switched the staging branch
and supplied the successful deployment of `b1c8dd7`. Subsequent live probes returned
`/health` HTTP 200 with `environment: staging` and `database: connected`, and
`/api/v1/ai/capabilities` HTTP 401 `Not authenticated` (previously 404). This detects
the AI middleware's authentication gate, which also rejects unknown paths under
`/api/v1/ai/`; it does not by itself prove the route's response contract or Groq readiness.
These are dated probe results, not a fresh check of today's deployment.
The deployed commit's backend application, migrations, dependencies and Dockerfile match
the local backend used for verification. No real provider call has yet been verified.

Next: verify the authenticated capabilities response reports `interpret: true`, install
the updated local preview build, opt in to Groq understanding, and test an unfamiliar typed
question before testing recorded speech. Staging's free-instance cold start can exceed
the app's request deadline; if unavailable after waking the service, use Recheck.
The backend code in the local tree matches the pushed feature commit; the new regression
test and recent mobile changes remain local. Production/main were not changed by this verification.
*(Later on 7 October: the regression test and those mobile changes were pushed as `03cfebb`.)*

## Provider inventory (Groq listening available; Sarvam and hosted speech not selected)

## Defaults and boundaries

| Layer | Default | Optional explicit choice |
|---|---|---|
| Capture | 9 October local build: one Android AudioRecord, mono PCM16/16 kHz temporary WAV, genuine provisional local words with the downloaded pack, small **Ask Care Coach** microphone; tap again to finish, review/edit, then send arrow. Maximum 28 seconds. Older modules retain Expo AAC/M4A capture and words after stopping. | Same recording; separately consented Groq may provide the final transcript. Without the local pack, live words are unavailable. |
| Listening | Moonshine Small Streaming English, native Android, pinned `ai.moonshine:moonshine-voice:0.1.5` | Current selectable alternative: separately consented Groq `whisper-large-v3`. Sarvam `saaras:v4` is a backend-only, gated alternative, not offered in this app. |
| Understanding | Conservative whole-utterance TypeScript parser and clarification | Groq `openai/gpt-oss-20b`, strict query/draft specification JSON (v2), legacy read intent JSON (v1) |
| Stock | Existing server-authoritative inventory; reuse only a complete, account-owned, non-invalidated snapshot | Existing targeted refresh when needed/online |
| Speaking | Installed, non-network Android English TTS voice | Backend-only alternatives: hosted Kokoro `bf_emma`, Sarvam `bulbul:v3` / `shubh`, Piper/Alba. None is offered while `CLOUD_VOICE_ENABLED=false`. |
| Display/actions | Same deterministic answer object for card and speech; summary, low stock, out of stock, item quantity/status/supplier, close/stop | No stock mutations, voice-triggered order saving, supplier sending or autonomous agent loop; local drafts can be reviewed on Create Order |

Assistant, microphone and spoken replies start disabled until the user enables them. The selected providers default to offline listening and device speech; cloud understanding is off. There is **no local LLM** and no silent cloud fallback: recognition never falls back to a cloud service, and an unmatched question goes to Groq only after opt-in. The app is not advertised as understanding arbitrary instructions offline.

Selecting an offline recognizer does not make every configured path private: enabling cloud understanding sends unfamiliar transcripts/questions to Groq; choosing a hosted voice sends answer text to that service. The consent dialog in Voice setup states this. In the latest local build, Groq text understanding and Groq Whisper listening can be chosen with separate consent. Listening also requires a fresh `audioOptIn` choice; old audio preferences are not restored. Hosted voices and Sarvam listening are not offered.

## Question journey

1. Record on the phone after microphone permission; no background recording or wake word. The unused `listen=1` automatic-start path was removed on 8 October 2026. A microphone tap is required even when such a route parameter is present; text upload still requires Send.
2. In the 9 October local follow-up, one native AudioRecord supplies local streaming words and a temporary mono PCM16/16 kHz WAV; the validated WAV is decoded for final offline Moonshine recognition. Older native builds retain AAC/M4A and words after stopping. Live captions are provisional and never trigger requests by themselves. Optional online listening (`CLOUD_TRANSCRIPTION_ENABLED=true`): send the finished recording through authenticated FastAPI to Groq Whisper only after separate audio consent and provider checks. `CLOUD_VOICE_ENABLED=false` still blocks hosted speech.
3. Review/edit the transcript and press Send. No confidence score is fabricated for Moonshine or Sarvam. The new UI removes the advisory meter; quiet speakers are not rejected by a volume threshold. The decoder still rejects effectively flat-line recordings.
4. Match the **whole** request locally. Exact known item names protect legitimate product words from broad legacy safety checks. Unfamiliar draft paraphrases and compound filters can use separately consented Groq understanding. Unqualified stock edits and order-save/apply/send commands stay blocked.
5. If no fully understood local request matches, optional Groq proposes a bounded v2 query/draft specification; generic legacy refusals no longer block valid draft paraphrases. The server and phone validate shape, and provider validation checks name/unit/quantity grounding; these checks still cannot certify meaning, so a valid specification can misread a question. Its named item must appear in the question, so it cannot invent an item; it can return explicit requested draft quantities grounded in the question, but cannot invent stock facts, execute tools or access inventory.
6. Resolve exact names on the phone. Singular/near-spelling candidates ask for a choice, even if only one is suggested. Size qualifiers are retained. Previous-item context remains local to this session.
7. Only `read_item`, `summary`, `low_stock` and `out_of_stock` read inventory; `close`, `stop_speaking`, `clarify` and `unsupported_action` do not. Read a safe snapshot of the signed-in owner's items. If online and older than 30 s, refresh through existing item reads (`GET /api/v1/items`, filtered by owner on the server). If that refresh fails, eligible last-known data is used with a warning. If known offline, answer immediately from eligible last-known data with a warning. Unowned/restored disk data, invalidated data and any save still running fail closed.
8. Render the validated answer in a compact native in-app layer, with summary statistics, a virtualized table, expandable details, filters/freshness and local draft review actions. Speak its matching text with an installed offline Android voice: automatically only when **Read answers aloud** is on, or on demand with **Hear answer**. Missing supplier data stays “not recorded,” not invented. Close, Stop, backgrounding and account changes cancel results/playback and clear appropriate context.

**Offline inventory limitation:** the user must have synced a complete snapshot in the current login session. A cold restart with only restored disk data does not qualify. This preserves the existing ownership safety boundary; it is not a new offline database. Offline recognition can still produce a transcript without stock data.

## Native offline setup

- The runtime is a local Expo module under `vitaltrack-mobile/modules/carekosh-voice`; Expo autolinks it. This requires a new native Android build (an EAS APK, or a production AAB), not Expo Go or an OTA JavaScript update (OTA updates are disabled: `updates.enabled: false`).
- The published Android library requires **API 26 / Android 8.0**. This release explicitly sets that minimum through `expo-build-properties` and the local module. Android 7 devices cannot install/update to this release. The user delegated this compatibility decision; matching the SDK's supported floor avoids a fragile manifest override. Do not bypass the requirement to claim older-device support.
- The speech pack is not bundled. Voice setup has explicit Download, readiness, progress, Cancel and Remove controls. Leaving Voice setup or the app cancels a download without an error message. The pinned runtime supplies a bundled manifest; downloads are restricted to Moonshine's HTTPS model CDN (`download.moonshine.ai`, redirects not followed). File size and the supplied checksum are verified (the code accepts CRC32C, SHA-256 or MD5; the upstream 0.1.5 catalog lists CRC32C). No caller can supply download URLs. CRC32C detects corruption, not publisher identity; HTTPS and the pinned dependency are part of the trust boundary.
- Pack files are stored in the app's no-backup directory, shared on the device because they contain no account data. Transcripts and user preferences are not stored in the model pack. Partial failed downloads are removed; verified completed files can be reused on retry.
- The current upstream Small English pack is about 142 MB without word-timestamp weights; the app displays the size from its pinned catalog. Allow additional free space and runtime memory. Measure actual release size and peak memory on target phones.
- During recognition, only local file loading/decoding/inference occurs; the SDK's automatic downloader and mic/agent wrapper are not used. In-flight native computation may finish after Cancel, but the result is suppressed; native model memory is released serially, never concurrently with inference.
- Device TTS filters out network-required and not-installed voices. If no offline English voice exists, install one through Android's Text-to-speech settings and use Recheck. There is no silent network TTS fallback. A vendor engine's actual behavior must also be checked in airplane mode.
- The module is Android-only. Web/iOS retain typed questions and, after opt-in, Groq text understanding; do not describe them as having offline listening/device speech from this implementation.
- The selected English streaming model and Moonshine code have an MIT notice, shown in Voice setup (**Offline speech licence**). Review and include the complete transitive native component notices from the exact release artifacts before public distribution; the Moonshine notice is not a licence for all unrelated TTS assets or third-party code.

## Server and external configuration

### No AI-provider account needed for the default local mode

The normal CareKosh login/inventory backend still exists. Listening and device speech need no API key after model/voice installation. A functioning backend is needed for login and a verified stock sync. A suspended Render service is not repaired by this code.

### Additive database migration

Use the normal reviewed migration/deployment procedure. The AI tables come from `0008_ai_consent_usage` and `0009_ai_provider_scopes`, which add consent and usage metadata only, not inventory tables. This branch's head is now `0010_order_local_id_unique`. Upgrading from `main`'s 0006 also applies 0007 (its downgrade refuses) and 0010 (holds a SHARE lock on `orders` until the upgrade commits). Old broad consent is **not** promoted into new-provider permission. AI routes remain registered even when disabled.

### Groq setup (current optional text and audio modes)

Backend-only staging settings for the current optional Groq modes. Interpretation needs `AI_ENABLED`, reviewed controls and a key; only enable `AI_TRANSCRIBE_ENABLED` if online listening is being offered. Each user still grants separate text/audio consent:

```dotenv
GROQ_API_KEY=<private key in Render Environment, never in Git or EXPO_PUBLIC_*>
AI_ENABLED=true
AI_DATA_CONTROLS_REVIEWED=true
AI_TRANSCRIBE_ENABLED=true
GROQ_STT_MODEL=whisper-large-v3
GROQ_INTENT_MODEL=openai/gpt-oss-20b
```

`AI_DATA_CONTROLS_REVIEWED` is an operator attestation, not an API that configures Groq. Verify organisation/project retention controls, terms, adult-pilot disclosures and spending controls before setting it. Hosted transcription is not needed if you use offline listening with cloud interpretation only.

### Sarvam backend alternative (not offered by the current mobile release)

Create a Sarvam account/key and review its pricing/credits, terms, audio/text handling and retention. Groq's controls do not apply to Sarvam. Configure only on the backend:

```dotenv
SARVAM_API_KEY=<private Sarvam key>
AI_ENABLED=true
AI_SARVAM_ENABLED=true
AI_SARVAM_DATA_CONTROLS_REVIEWED=true
AI_TRANSCRIBE_ENABLED=true
SARVAM_STT_MODEL=saaras:v4
AI_SPEECH_ENABLED=true
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_SPEAKER=shubh
```

Saaras and Bulbul consent are separate. They can run without a Groq key. This release sends `language_code=en-IN`; multilingual behavior is not certified just because Sarvam supports more languages. Sarvam does not replace the optional Groq intent adapter in this release.

### Kokoro hosted audition (optional; additional hosting)

No hosted Kokoro account is required for our own worker, but CPU/RAM, storage and hosting are not free guarantees. See `voice-service/README.kokoro.md`. Provision reviewed, checksum-pinned model/voice files outside Git and the image; no model is downloaded automatically by our worker.

Backend environment, after a healthy worker and rights review:

```dotenv
AI_ENABLED=true
AI_SPEECH_ENABLED=true
AI_KOKORO_ENABLED=true
AI_KOKORO_RIGHTS_APPROVED=true
KOKORO_SERVICE_URL=https://<your-private-speech-service>
KOKORO_SERVICE_TOKEN=<strong shared private service token>
```

Kokoro here is **hosted TTS**, not an embedded phone model or recognizer. Default device speech remains available without it. Legacy Alba worker code is preserved but is not offered by the new mobile selection UI or enabled by this change.

### Consent and cost controls

- API endpoints require existing login, matching consent version and the scope for the exact provider/action. The backend accepts six scopes: Groq text, Groq audio, Sarvam audio, Kokoro speech, Sarvam speech and Alba speech. This build offers Groq text and separately Groq audio consent; Sarvam/hosted speech remain unavailable in mobile policy.
- Settings belong to each account on each device. “Withdraw all cloud consent” immediately restores local choices and attempts server revocation. If offline, the screen says to retry server withdrawal; it does not falsely claim success. Withdrawal always writes an `ai_consents` row, even for an account that never consented.
- Daily request limits and PostgreSQL atomic cost-credit reservations still span all providers/workers. One active external call per account. Default Sarvam credits are 5,000 micro-USD/transcription and 20,000 micro-USD/speech attempt; these are conservative application allowances, **not live prices or an exact invoice cap**. Review against actual prices and maximum input length.
- Groq audio accounting has a ten-second floor. Sarvam records the actual duration rounded up (one-second minimum), not the Groq floor. No content is added to the usage ledger.
- All keys remain server-side. There is no BYOK or public “free unlimited API” feature. Flags default off; no code or test turns on production services.

## Required release gates

Local verification for this implementation (6 October 2026; the 7 October re-run above found 242 backend and 121 mobile tests):

- **206 backend tests passed**, using a new disposable PostgreSQL database and the actual Alembic migration chain, including preservation of existing inventory records.
- **64 mobile tests passed**; TypeScript passed. Full mobile lint: zero errors and three pre-existing warnings in untouched inventory/orders/builder screens.
- **5 Kokoro transport/asset-gate tests passed** with synthetic fixtures and a mocked worker. No real voice/model inference was performed.
- Backend Ruff, formatting checks and the 44-route gate passed. Git whitespace check passed.
- Android JavaScript export and isolated Expo prebuild passed; generated configuration declares `android.minSdkVersion=26`. Expo's resolver detects the local module. Kotlin sources parsed/formatted successfully.
- Published Moonshine AAR checked: API 26 minimum, ARM64 present, all 64-bit ELF load segments aligned to at least 16 KB. Re-run `node vitaltrack-mobile/scripts/check-moonshine-artifact.cjs /absolute/path/to/moonshine-voice-0.1.5.aar` when changing the artifact.
- **Not yet verified:** native Kotlin/Gradle release compilation (Android SDK is absent here), packaged APK ZIP alignment, actual device recognition/playback, real cloud inference and real Kokoro synthesis. Parsing Kotlin and exporting JavaScript do not establish native-build success. No live recordings or paid provider calls were made.

1. Complete native release compilation with the selected Android 8.0 minimum and inspect the **merged** manifest and packaged native libraries (including 16 KB page alignment). The Moonshine 0.1.5 library manifest declares `INTERNET`, `ACCESS_NETWORK_STATE`, `RECORD_AUDIO` and a microphone-permission activity, which merge in unless removed. Expo autolinking/prebuild/JS export alone are not APK validation.
2. Install the preview APK on the target Android phone. Download the pack, install an offline English TTS voice, sync stock, then enter airplane mode. Verify recording → correct editable transcript → local intent → labelled stock card → audible reply with no audio/text network requests.
3. Test download failure/cancel/retry/removal, corrupt weights, storage pressure, first-load latency, steady-state latency, memory, permission denial, Bluetooth, backgrounding, logout/login and quick repeated taps. Offline settings must work with all backend AI flags off.
4. Use a private held-out evaluation set with Indian-English accents, actual item names, near-name ambiguities, quantities, noise and unsupported requests. Track entity accuracy, intent accuracy, clarification rate and end-to-end latency. No claim of “best recognition” or a percentage accuracy until measured.
5. Test Sarvam/Groq separately in staging using explicit consent and small budgets. Validate real model IDs, response shapes, rate limits and budget exhaustion. No silent fallback. Check that one provider's consent cannot authorize another.
6. Audition Kokoro only after asset/runtime licence review and deployment. Check pronunciation of numbers, units and suppliers against the card; do not promote it to default merely because generation succeeded.
7. Publish the reviewed privacy/Play Data Safety changes. The repository's policy is a draft; editing it does not publish it. Confirm metadata retention, temporary-file/crash cleanup and provider controls operationally.

No commit, push, deployment, provider account changes or paid inference are included in this implementation step. *(Later: the code was committed and pushed on 6–7 October 2026, and the owner deployed `b1c8dd7` to staging; see the status note at the top.)*

## Primary integration references

- [Moonshine Android SDK](https://moonshine-voice.readthedocs.io/en/latest/using/adding-the-library/) and [published 0.1.5 artifact](https://repo.maven.apache.org/maven2/ai/moonshine/moonshine-voice/0.1.5/).
- [Sarvam STT REST](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe) and [TTS REST](https://docs.sarvam.ai/api-reference/text-to-speech/convert).
- [Kokoro ONNX runtime](https://github.com/thewh1teagle/kokoro-onnx) and [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M).
