# CareKosh voice assistant — implementation and setup

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

## Current setup — 9 October 2026

Read the [complete current AI voice architecture](VOICE_INVENTORY_AND_ORDER_DRAFTS.md#complete-ai-voice-architecture--source-review-9-october-2026) for the stack, HTTP routes, data boundaries, quotas and interview explanation, and [Option 1](VOICE_OPTION_1_IMPLEMENTATION.md) for the native model/download implementation record.

1. Install a matching new Android preview APK. The custom AudioRecord/Moonshine module cannot run in Expo Go. Native changes need a new build; a backend deploy does not replace the installed app.
2. Profile menu → Voice setup: enable Assistant. Download the English speech pack to use offline final recognition and genuine provisional live words. Enable tap-to-talk and grant Android microphone permission. No wake word or background recording.
3. If wanted, enable Read answers aloud; install an eligible offline English Android TTS voice and Recheck if unavailable. Hosted TTS is disabled in this mobile release; Alba is not required.
4. For unfamiliar wording, configure the current staging backend with private `GROQ_API_KEY`, `AI_ENABLED=true` and operator-reviewed `AI_DATA_CONTROLS_REVIEWED=true`, then explicitly enable **Groq understanding** (`groq_text` consent) on the phone. Default model: `openai/gpt-oss-20b`. Familiar commands stay local.
5. Optionally enable `AI_TRANSCRIBE_ENABLED=true` on that backend, then explicitly choose **Enable Groq online listening** with separate `groq_audio` consent and fresh local audio opt-in. Default model: `whisper-large-v3`. This uploads finished audio after Stop; text consent alone is insufficient. Live words still need the downloaded local pack.
6. Tap the small **Ask Care Coach** microphone on a main tab → speak/live provisional words → tap again → review/edit final transcript → Send. No request or draft starts from live captions. The answer uses a native in-app layer; detailed tables/drafts remain until dismissed.
7. Inventory queries and unsaved drafts resolve against actual account-owned data. Only touch confirmation in Create Order saves an order; voice cannot save/change stock/apply/send. Reviewed inventory-report export also requires touch approval.

Provider errors remain visible; there is no automatic cloud/offline substitution. Cloud modes write consent/usage metadata, not inventory/orders. Sarvam, Kokoro and Piper/Alba are backend alternatives, not selected mobile providers. Current defaults/paid pricing and dated verification limits are in the architecture guide. Live settings, installed revisions and broad phone/provider accuracy need separate checks.

## Earlier hosted/Alba design — historical only

The following sections preserve the 29 September implementation and its checks. Their UI labels, meter, iOS support, hosted-only transcription, Alba prerequisites and “not fully offline” description are **superseded**. Follow the current steps above; do not enable a hosted worker merely to obtain spoken replies. Test counts and deployment statements below describe that date, not today's state.

## Historical implemented flow — 29 September 2026

- Profile → AI & Voice: account-specific settings, adult-pilot consent, microphone and Alba playback switches, voice preview.
- Typed questions/quick chips, English tap-to-record (28 seconds), editable transcript and explicit Send.
- Visible microphone level/timer, serialized recording preparation/stop/cancellation and audio-mode restoration. The meter is advisory, not a speech-confidence score or noise canceller.
- Conservative whole-command parser → optional Groq structured intent. The model receives the question and whether previous-item context exists, not the inventory.
- Whole-utterance transcription checks: malformed/low-quality responses require a new recording; uncertain segments are never silently dropped. Near-digital-silence recordings are rejected before upload to Groq.
- TypeScript readers for quantity, stock status, recorded supplier, summary, low stock and out of stock. Ambiguous names require selection.
- Read-only cards: no Edit, Buy, Order or WhatsApp tools. Close/Stop cancels the turn. Typed/manual use survives provider failures.
- Existing server-authoritative inventory: fresh, complete, account-owned mobile data answers without a new inventory request. Other states use the existing item query. Restored disk data is not automatically certified. No new inventory database/offline-write queue.
- Session epochs, pending-write checks, pagination duplicate/completeness checks, stable name/ID ordering, targeted refresh and native reconnect wiring.
- Five authenticated AI routes: capabilities, consent, transcribe, interpret, speak. DB sessions close before provider inference.
- PostgreSQL atomic reservations, daily account/global request and conservative cost-credit limits, cross-worker concurrency leases, bounded uploads and timeouts. No automatic failover.
- Time-limited ffmpeg decoding validates actual duration and normalizes WAV audio. Seekable M4A uses a private temporary server file, removed on normal/error/cancellation exits. Do **not** advertise “audio never touches disk.” Container crashes/platform caches need operational retention review.
- Separate Alba worker code, checksum-gated and rights-gated. No weights are bundled and no substitute voice is used.

AI routes write consent and usage metadata only. **They cannot write inventory or orders.**

## 1. Accounts and external setup

Groq is the only new **AI-provider account/key**. It is **Groq**, not xAI's Grok.

Add GROQ_API_KEY privately in the existing Render **staging backend service → Environment**. Never paste it into chat, Git, HTML, mobile code, Expo public variables or app settings. Use a separate production key later.

Before external processing:

1. Verify Groq inference Zero Data Retention/data controls for the correct organisation/project. Disable unused Batch/Fine-tuning where appropriate. A paid plan is not proof of privacy configuration.
2. Review provider terms, consent copy, age/audience controls and the privacy policy. This local draft is not published. The 18+ declaration is not age verification.
3. Choose a small test allowance and monitor Groq usage. Free access is quota-limited, not a production guarantee.

No OpenAI, Anthropic, ElevenLabs or Sarvam account is required.

## 2. Backend configuration

Local development uses the gitignored vitaltrack-backend/.env. The committed .env.example contains blank secrets and safe defaults.

Install requirements and ffmpeg; review/apply migration **0008_ai_consent_usage** to the intended staging database through the normal migration procedure. Then configure:

| Variable | Staging value / purpose |
|---|---|
| GROQ_API_KEY | Your private Groq key |
| AI_ENABLED | true after review |
| AI_DATA_CONTROLS_REVIEWED | true only after reviewing controls/disclosures |
| AI_TRANSCRIBE_ENABLED | true for recording tests |
| GROQ_STT_MODEL | whisper-large-v3 |
| GROQ_INTENT_MODEL | openai/gpt-oss-20b |
| AI_TIMEOUT_SECONDS | 25 |
| AI_USER_DAILY_REQUESTS | 50 default; each STT/intent/TTS attempt counts |
| AI_GLOBAL_DAILY_REQUESTS | 500 default across accounts/workers |
| AI_GLOBAL_CONCURRENCY | 4, with one active call per account |
| AI_USER_DAILY_BUDGET_MICROUSD | 100000 = $0.10 conservative daily credits |
| AI_GLOBAL_DAILY_BUDGET_MICROUSD | 1000000 = $1 conservative daily credits |
| AI_INTERPRET_RESERVE_MICROUSD | 5000 credits per attempt |
| AI_TRANSCRIBE_RESERVE_MICROUSD | 1000 per attempt, decoded recording ≤30 seconds |
| AI_SPEAK_RESERVE_MICROUSD | 1000 per attempt for capacity accounting |
| AI_SPEECH_ENABLED / AI_ALBA_RIGHTS_APPROVED | Keep false until the speech gate is cleared |

Credits are reserved before work and **not refunded on failure**, preventing unlimited failed retries. Actual token/audio metadata is recorded separately; minimum audio accounting is 10 seconds. Credits are an application limit, **not an exact invoice or provider-enforced dollar ceiling**. Reassess reservation amounts on price/model changes. Hosting and use of the key outside CareKosh are not covered.

The Dockerfile installs ffmpeg; local decoder tests require it too. The additive migration creates ai_consents and ai_usage without rewriting stock. AI_ENABLED=false disables external processing while preserving normal use.

Do not deploy this branch until its other existing uncommitted changes have also passed the normal review.

## 3. Alba: additional configuration, not another AI subscription

See voice-service/README.md. Before spoken replies:

1. Resolve Alba model/data provenance and runtime obligations. Hosting alone is not clearance.
2. Provision en_GB-alba-medium.onnx and the matching .onnx.json outside Git/the image, on a separate private service.
3. Configure verified model/config SHA-256 checksums and rights approval. Measure target CPU/memory requirements.
4. Generate a strong internal PIPER_SERVICE_TOKEN, shared only by backend and worker.
5. Set backend PIPER_SERVICE_URL to its secure endpoint and the same token.
6. Verify readiness/playback, then enable AI_ALBA_RIGHTS_APPROVED and AI_SPEECH_ENABLED.

This can add hosting cost. No service has been deployed, and Iris's desktop runtime is not embedded in the phone. If rights cannot be cleared, explicitly choose an alternative before public voice release; no silent substitution.

## 4. Mobile build

The SDK 54-compatible expo-audio dependency and lockfile are included.

1. Use the existing **preview/staging** EAS profile and API URL. No Groq key in EAS.
2. Install a **new native build**. Existing AABs do not gain microphone support from this code change.
3. Inspect the **merged release manifest**: microphone present, camera/system-overlay still blocked, unwanted background-audio services and foreground-service permissions absent. Config introspection does not replace binary inspection.
4. Profile → AI & Voice → Enable assistant. Begin with typed quick commands.
5. Enable cloud processing after the adult-pilot disclosure, then microphone. Record → Finish → review → Send.
6. Spoken replies stay unavailable until the server reports approved Alba support.

Voice recording is native Android/iOS only in V1; web keeps typed input. The assistant is an in-app modal, not a system overlay.

## 5. Remaining release verification

Automated tests use synthetic data/provider mocks. No real recording/key was submitted during implementation.

Local verification on 29 September 2026: **193 backend tests passed** against a newly created disposable PostgreSQL instance using the real Alembic migration chain; **48 mobile tests passed**; TypeScript and backend Ruff passed. Mobile lint has zero errors and three existing warnings in untouched inventory/orders/builder screens. Android JavaScript export passed; this is **not an APK/native build**. Expo config introspection confirmed microphone permission and service-removal declarations; inspect the final binary as well. These results do not replace the release gates below.

- Test actual Groq schema/transcription in staging with consent and a small allowance.
- Build and test physical Android/iOS devices: microphone quality, playback, Bluetooth, permission denial, background/interruption, logout, cancellation.
- Privately evaluate held-out Indian-English speakers, real item vocabulary and noise. Do not commit identifiable voices or real inventory fixtures.
- Benchmark warm/cold Alba loading, checksum failure, timeouts, memory and playback on the actual target.
- Publish reviewed privacy/Play Data Safety disclosures; settle metadata-retention scheduling and crash-temp cleanup. No legal-compliance certification is implied.
- End-to-end verify dashboard agreement, fresh-answer zero inventory calls, stale/offline labels and account isolation.
- Pagination checks detect duplicate/changing counts but are not an atomic multi-page snapshot. Concurrent changes on other devices can require another refresh.

This is **not fully offline**: basic typed reads can use eligible cached data; transcription/hosted understanding need internet; V1 Alba uses its service. No unmeasured recognition-quality guarantee is made.

## Iris patterns

Reviewed Iris again on 29 September, including its Vosk/listening pipeline, hosted transcription and interpretation adapters, echo/cancellation guards, intent dispatcher, Piper worker and optional Kokoro/Gemini voice layers. Reused bounded capture, explicit state and validation patterns, not its always-listening desktop microphone path. Alba speaks; Whisper transcribes; the intent model interprets.

The Jarvis/LiveKit tutorial does not change the selected V1 stack. No new provider account, dependency or model download was added by this review. See [the review and implementation record](VOICE_AGENT_REVIEW_2026-09-29.md) for adopted improvements, deferred alternatives and verification limits.

## Official references checked

- [Groq structured outputs](https://console.groq.com/docs/structured-outputs)
- [Groq speech-to-text](https://console.groq.com/docs/speech-to-text)
- [Groq data controls](https://console.groq.com/docs/your-data)
- [Expo SDK 54 audio](https://docs.expo.dev/versions/v54.0.0/sdk/audio/)
- [Piper Python API](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_PYTHON.md)
