# Inventory answers and voice-prepared order drafts

> **25 October 2026 — personal OpenAI understanding.** Understanding now independently offers Local, Groq or personal-key OpenAI; listening and narration keep their own selections. OpenAI uses the Responses API, strict contract 3 and existing semantic grounding, with encrypted per-account keys and separate `openai_text` consent. It cannot save orders or change stock. [Architecture, exact Render setup, billing limits and acceptance checks](OPENAI_UNDERSTANDING.md). This local implementation adds migration 0012; live provider and phone acceptance remain pending. Earlier dated sections retain their scope.

> **24 October 2026 — query, UI and order recovery follow-up.** The centered **Ask CareKosh** entry, responsive answer/order cards and emergency selection are updated. Important equipment and low-stock predicates remain one intersection; save/PDF progress and recovery are separate. These changes are reviewed for staging; deployment and phone acceptance remain separate. See [verification and remaining phone checks](AI_VOICE_END_TO_END_REVIEW.md#16-query-presentation-and-order-recovery-follow-up--24-october-2026). Earlier dated evidence retains its original scope.

> **24 October 2026 — Whistle in regular preview.** Whistle is a separately selected, English-only offline transcription option in the regular `preview` APK and the diagnostic APK. Moonshine remains the default; understanding and narration retain their existing settings. Regular preview keeps Alba and Kokoro paused. See [Whistle setup, privacy controls and device checks](WHISTLE_OFFLINE_LISTENER.md). Earlier dated evidence below retains its original scope.

> **Update — 13 October 2026.**
> - **Contract 3.** Multi-part requests now use a negotiated contract version 3. It covers quantity comparisons, critical equipment, exclusions, sorting, follow-ups and drafts from a filtered list. Every row in an answer gives its reason. The phone runs these requests itself, without Groq, whenever its grammar covers them.
> - **Voice setup.** It now has three independent stages: Listening, Understanding and Spoken replies.
> - **Sarvam errors** now name the cause.
>
> **Update — 15 October 2026 (working tree).** Clarifications, proposals and draft reviews are now read aloud. Spoken text is prepared for speech, and the server checks Groq's plans more strictly. See [Spoken answers and stricter checks](#spoken-answers-and-stricter-checks--15-october-2026).
>
> Read the [end-to-end review](AI_VOICE_END_TO_END_REVIEW.md) first. The sections below describe the 11 October state, with dated notes where the behaviour changed.

Current local implementation: **11 October 2026**, on `feature/backend-hardening-ai-voice-agent-foundation`, following `4bd1dff`. Alba selection/new downloads are paused after failed OnePlus acceptance; its code is retained. Optional Sarvam English narration now has a separate consented backend and playback path. Microphone, Moonshine/Groq listening, Groq interpretation, local drafts and touch-confirmed order saving retain their existing wiring. A matching backend deployment and new preview APK are required. No Sarvam account or physical phone sound has been verified by this source review. [Activation, key configuration, costs and device checks](SARVAM_ENGLISH_VOICE.md).

## Complete AI voice architecture — source review, 11 October 2026

This is the maintained architecture reference for the **current working tree**, including local changes. Earlier setup documents and `future_plan/` preserve decisions and experiments; they are not evidence that every proposed provider or agent framework is running. Text understanding and optional online recognition use **Groq**; optional online narration uses **Sarvam**. The configured interpretation model is `openai/gpt-oss-20b`; a service environment can override that repository default. The owner's latest feedback reports that basic flows work better with online understanding. That is useful pilot feedback, not a measured recognition/intent accuracy score or independent verification of every device and live setting.

### Technology and responsibility map

| Layer | Current implementation | Responsibility / network boundary |
|---|---|---|
| Application | React Native 0.81.5, Expo SDK 54, TypeScript, Expo Router | Native assistant dock, editable transcript, answer layer and Voice setup. Order review and emergency cards use the same responsive stock data presentation. |
| Permission/audio mode | `expo-audio`, Android `RECORD_AUDIO` | Requests microphone access and foreground audio configuration. No wake word, background listening or system-overlay permission. |
| Microphone capture | Custom Kotlin Expo module `carekosh-voice`, Android `AudioRecord` with `VOICE_RECOGNITION` | One mono PCM16/16 kHz recording feeds a temporary WAV and local caption preview; maximum 28 seconds. Capture and inference use separate threads. A native API compatibility path uses Expo AAC/M4A at 44.1 kHz/128 kb/s on older modules. |
| Provisional live words | Moonshine Small Streaming English; pinned `ai.moonshine:moonshine-voice:0.1.5` | Runs on the phone after the speech pack download. Real partial words can be revised. Without the pack, online listening still provides a final transcript after Stop, but no live captions. |
| Final recognition | Moonshine by default; experimental Whistle in preview; optionally Groq `whisper-large-v3` | Offline mode decodes/transcribes locally. Online mode uploads the finished take through CareKosh after separate audio opt-in. Recognition produces words, not an inventory action. |
| Familiar wording | TypeScript parsers in `core.ts` and `queries.ts` | Routes supported whole requests locally first; no LLM call for a locally resolved request. |
| Unfamiliar wording | Groq-hosted `openai/gpt-oss-20b`, called through Python HTTPX | After Send and text consent, Groq produces one bounded plan: version 3 since 13 October 2026. Basic requests can use an older contract; detected advanced conditions that cannot be represented are blocked. No inventory snapshot, executable code or LLM tool execution is supplied. The question can contain user-entered names and quantities. |
| Contract and grounding | FastAPI/Pydantic schemas + TypeScript contracts | Rejects invalid fields/shapes; checks names, units and quantity-to-item association. A schema-valid result can still misinterpret a sentence. |
| Actual facts and calculations | Session-owned inventory/category snapshots; deterministic TypeScript resolution | Applies supported filters and stock rules to real items. Ambiguous names/units need review; missing supplier/brand stays “Not recorded.” |
| Backend/data | Python 3.12, FastAPI, SQLAlchemy async, asyncpg, PostgreSQL | Existing authenticated inventory API is authoritative. JWT ownership checks, short AI sessions, consent, quota reservations and provider deadlines protect cloud requests. Render/Neon are the documented hosts; live configuration requires separate verification. |
| Local context | In-memory account/session draft and follow-up state; AsyncStorage preferences | Draft survives navigation, not app restart/logout/account change. No persisted write queue or automatic order submission. |
| Answer/speech/report | Native React Native components; device `TextToSpeech` or separately consented Sarvam English via FastAPI/HTTPX and Expo AudioPlayer; local HTML, `expo-print`, `expo-sharing` | Table, speech and PDF use validated result data. Sarvam receives only the concise narration text. Device voice is the default; Alba selection is paused. Reports render locally; an open share sheet does not prove delivery. |

Sarvam English narration is selectable after backend configuration and separate answer-text consent. Sarvam transcription, hosted Kokoro and legacy Piper/Alba remain unselected alternatives; downloaded Pocket/Alba selection is paused. Listening remains Moonshine by default, explicitly selected Whistle in preview, or opted-in Groq. This runtime does not use LangChain, LangGraph, a vector database, RAG, EmbeddingGemma, a multi-agent system or an autonomous planning loop. Sarvam now generates optional speech; it does not recognize or interpret the user's request.

### Spoken output — Sarvam integration, 11 October

The default remains Android device English TTS. Optional Sarvam narration sends at most 640 characters of verified answer text to the authenticated backend, which owns the private API key, model and English speaker. Default: `bulbul:v3` / `ritu`; optional latest `bulbul:v4-flash` / `aparna_en_companion` after account pricing/access review. The phone waits for complete WAV generation and actual player completion.
- **Fallback (13 October update):** no provider is switched automatically. Instead there is an [optional offline fallback](SARVAM_ENGLISH_VOICE.md#optional-offline-fallback--13-october-2026), off by default. If the user chose and previewed an offline voice, a Sarvam failure before any audio leads that voice to read the same answer once. It never sends a second request and never switches key source. See the [complete Sarvam setup and live acceptance checklist](SARVAM_ENGLISH_VOICE.md).
- **Alba:** the retained 209 MB Pocket/Alba pack cannot be downloaded or selected in normal builds. A [repaired implementation](POCKET_TTS_ALBA.md#offline-voice-investigation--13-october-2026) is available only in the `preview-voice-diagnostics` test build until it passes phone acceptance.

### Two different cloud permissions

| User choice | Required local/server checks | What is sent and when |
|---|---|---|
| Groq understanding | Assistant enabled, device `cloud` choice, `groq_text` consent at version `voice-2026-10-06`, enabled server capability | Reviewed question text and a boolean indicating previous context; only after Send when the local parser has no match. The provider receives system/schema instructions too, not actual prior inventory or answer contents. |
| Groq online listening | Selected `inputProvider='groq'`, fresh `audioOptIn`, `groq_audio` consent and enabled transcription capability | Finished WAV/M4A recording through `/api/v1/ai/transcribe` after Stop. Generic stock vocabulary accompanies Whisper; no account item list. Transcript still requires review and Send. |
| Read answers aloud | Selected eligible non-network English Android voice, or separately selected/consented Sarvam English | Device speech stays local. `SARVAM_SPEECH_ENABLED=true` permits the specifically gated narration path; `CLOUD_VOICE_ENABLED=false` keeps other hosted voices unavailable. Alba selection/downloads are paused. |

Mobile flags are `CLOUD_TEXT_ENABLED=true`, `CLOUD_TRANSCRIPTION_ENABLED=true`, `CLOUD_VOICE_ENABLED=false`, `SARVAM_SPEECH_ENABLED=true`, `ALBA_SELECTION_ENABLED=false`. Fresh `sarvamSpeechOptIn` and the server `sarvam_speech` scope are both required for online narration. New-account preferences still start disabled: assistant, microphone, cloud interpretation, audio opt-in and spoken replies. Text consent does not authorize audio, and no provider is silently substituted after failure. **Use offline listening** stops uploads from this device; **Withdraw all cloud consent** disables local cloud use, returns narration to device speech, and attempts server revocation, visibly reporting failure.

### Every assistant HTTP operation

| Operation | Trigger and purpose | Database effect |
|---|---|---|
| `GET /api/v1/ai/capabilities` | Initialization/Recheck, consent changes, and renewed checks before unfamiliar interpretation or online transcription. Reports enabled providers, this account's scopes, `interpret_contracts` (`[1,2]` earlier; `[1,2,3]` since 13 October 2026) and `order_review_guard:true`. | Reads authentication/consent; no AI ledger insert. |
| `PUT /api/v1/ai/consent` | Explicit scope grant or withdrawal in Voice setup. Accepted consent is unavailable while AI is disabled; withdrawal remains allowed. | Upserts `ai_consents`; not inventory/orders. |
| `POST /api/v1/ai/transcribe` | Optional finished-recording upload. Auth/flags/scope/quota checked; ffmpeg validates duration/signal and normalizes audio before one Whisper call. | Reserves/settles `ai_usage`; temporary decoding file, no inventory/order mutation. |
| `POST /api/v1/ai/interpret` | Unmatched reviewed text. The app prefers `{question,has_previous_item,contract_version:3}` when listed. Basic requests can use v2/v1; detected unsupported advanced requests ask for a backend update. Older clients omit the version and get v1. | Reserves/settles `ai_usage`; returns a specification, no execution or inventory facts. |
| `POST /api/v1/ai/speak` | Selected/consented Sarvam English Preview, Test, Hear answer or automatic reading; explicit personal/application billing source. | Reserves/settles ai_usage; never inventory/order writes. |
| `GET /api/v1/ai/sarvam-key` | Own key status API; phone uses equivalent capabilities metadata. | Reads encrypted credential metadata only. |
| `PUT /api/v1/ai/sarvam-key` | Masked settings input + explicit storage confirmation; Save/Replace. | Owner-scoped Fernet-encrypted credential upsert; no provider call or narration consent. |
| `DELETE /api/v1/ai/sarvam-key` | Remove this account's saved key, even when paused. | Deletes owned credential row; does not revoke provider key or erase encrypted backups. |
| Existing item/category reads | Complete verified data is reused when eligible; existing services refresh it when required. | Reads user-owned business rows. Ordinary token refresh can separately update authentication metadata. |
| `POST /api/v1/orders` | Separate Create Order **touch confirmation**, after draft/item/version review. Voice dispatcher has no save operation. | Saves order/lines/activity; does not increase stock. Apply-to-stock is a different existing workflow. |

All AI operations authenticate the existing user. Provider calls release database sessions before waiting on external inference. The app sends no key to Groq directly: `GROQ_API_KEY` is server-only. Client/provider failures, stale capabilities, quota exhaustion, cancellation and ambiguity are visible outcomes; they do not authorize a broader action.

The v2 intents are `inventory_query`, `draft_order`, `review_draft`, `inventory_export`, `clarify`, `unsupported_action`. The server asks for strict JSON, temperature 0, low reasoning effort and at most 3,072 completion tokens for v2 (1,024 for legacy v1); default provider timeout is 25 seconds, with no automatic retry. Validation narrows authority but cannot prove the model understood a human perfectly. The phone resolves the specification against its own inventory, then presents the result for review. `inventory_export` requires a previous reviewed list and touch approval; draft preparation never calls the order-save API.

### Architecture and request sequence

![Current system context: Android capture and local recognition, FastAPI, PostgreSQL, and separately consented Groq text and audio calls.](diagrams/system-context.svg "Current components and network boundaries")

![Voice sequence: capture and live words, final transcription, reviewed Send, bounded parsing, real inventory resolution, unsaved drafts, and separate touch-confirmed saving.](diagrams/voice-flow.svg "From microphone to answer or local draft; touch is required to save")

The optional cloud paths are separate decisions: Whisper turns audio into words; GPT-OSS interprets reviewed text. Neither provider executes inventory or order mutations. These diagrams describe the current source, not a live deployment check.

### Examples to explain in an interview

- **“Show low stock.”** Review/Send → local parser → verified snapshot → deterministic low-stock filter → native table/optional local speech. Zero Groq model calls when recognized locally; selected Sarvam narration adds one separate speech request.
- **An unfamiliar compound filter.** Review/Send → capability/text-consent checks → FastAPI authentication and credit reservation → Groq specification → server and phone validation → actual inventory/category resolution → visible filters/counts/rows. Unsupported history or forecasting requires clarification rather than dropping part of the request.
- **“Prepare twenty pairs of gloves and five boxes of masks.”** Resolve names/recorded units and spoken quantities → local unsaved draft, with clarification or merge/replace review as needed → separate touch-confirmed Create Order. Saving retains `localId` across an uncertain retry; a saved order with PDF failure is re-exported without saving again.
- **Online recognition plus unfamiliar wording.** Stop → one Whisper request → review/edit transcript → Send → one interpretation request if still unmatched locally. Live Moonshine words do not send either request or start a draft.

### Groq dependency, allowances and cost

| Input path | Normal external calls per completed turn |
|---|---|
| Typed or offline-transcribed, familiar command | 0 |
| Typed or offline-transcribed, unmatched supported wording | 1 interpretation |
| Online listening, familiar command | 1 transcription |
| Online listening, unmatched supported wording | 1 transcription + 1 interpretation |

Capability checks and inventory reads are ordinary CareKosh API calls, not paid model inference. Failures do not trigger an automatic provider fallback. Local commands, downloaded recognition and device speech remain available when Groq is unavailable, subject to eligible data and setup.

Official Groq limits/prices checked **9 October 2026**, not verified for the owner's account:

| Model | Published Free-plan limits | Published paid Developer rate |
|---|---|---|
| `openai/gpt-oss-20b` | 30 requests/minute, 1,000/day, 8,000 tokens/minute, 200,000 tokens/day | $0.075 per million input tokens; $0.30 per million output tokens |
| `whisper-large-v3` | 20 requests/minute, 2,000/day, 7,200 audio seconds/hour, 28,800/day | $0.111 per audio hour; 10-second minimum billed duration/request |

Limits are organization-wide and any threshold may bind first; the exact account allowance is in Groq Console. They renew by their windows, not after a guaranteed number of free months. A hypothetical 2,000 counted tokens/interpretation would permit about 100/day under the published daily token limit, before other traffic/minute limits. Prompt/schema and output tokens matter even for short questions. Free-plan exhaustion returns 429; paid Developer usage requires an account upgrade. See [official limits](https://console.groq.com/docs/rate-limits), [prices](https://console.groq.com/docs/models), [STT accounting](https://console.groq.com/docs/speech-to-text) and [billing](https://console.groq.com/docs/billing-faqs). Recheck these dated figures before budgeting.

CareKosh's **repository defaults** have separate UTC-day controls: 50 attempts/account, 500 globally, concurrency 4 globally and 1/account; fixed reserved credits of 5,000 micro-USD/interpretation and 1,000/transcription against 100,000/account and 1,000,000 globally. For interpretation-only traffic the credits bind at **20/account/day and 200 globally/day**. With one transcription plus one interpretation on every turn, they bind at **16/account/day and 166 globally/day** before other usage. Failed reserved attempts count; settlement records tokens/audio without refunding these fixed credits. Environment overrides can change these values. They are application allowances, **not exact provider charges or an invoice cap**. Real account usage, hosting cost and target-scale capacity have not been measured by this source review.

### Setup, deployment and honest portfolio description

For online text understanding, staging needs the current AI routes/migrations, private `GROQ_API_KEY`, `AI_ENABLED=true` and operator-reviewed `AI_DATA_CONTROLS_REVIEWED=true`. Optional online listening also needs `AI_TRANSCRIBE_ENABLED=true`. Model names and quotas can use the defaults above. Optional English narration uses the separate [Sarvam configuration](SARVAM_ENGLISH_VOICE.md); it does not change Groq settings. Personal keys can be saved encrypted per account; billing source is explicit and cannot silently fall back to the application key. These operator settings never replace each user's separate consent.

The EAS `preview` profile embeds `https://staging-api.carekosh.com`; the backend deploy and mobile build are separate actions. A laptop EAS build uploads the current local files, including eligible uncommitted changes; Render uses the selected **remote** commit. Native changes require a newly installed APK/AAB; OTA updates are disabled. Confirm both candidate revisions and server capabilities before testing. This documentation update does not commit, push, merge, deploy, build or certify a live service.

Describe the project as **“an LLM-powered voice inventory assistant with bounded task routing and human approval.”** It demonstrates agentic workflow patterns—intent extraction, deterministic data grounding, constrained actions, context, consent, failure handling and review. It has a predefined router/dispatcher; the LLM does not autonomously plan and execute repeated tool calls. Do not claim implemented RAG, LangGraph, multi-agent orchestration or universal natural-language understanding. See the primary [workflow/agent distinction](https://www.anthropic.com/engineering/building-effective-agents).

### Sources to trace next

Read [policy](../vitaltrack-mobile/features/assistant/policy.ts) and [preferences](../vitaltrack-mobile/features/assistant/preferences.ts) → [dispatcher](../vitaltrack-mobile/components/assistant/AssistantExperience.tsx) → [native capture](../vitaltrack-mobile/modules/carekosh-voice/android/src/main/java/expo/modules/carekoshvoice/StreamingRecording.kt) and [offline bridge](../vitaltrack-mobile/features/assistant/offlineVoice.ts) → [mobile transport](../vitaltrack-mobile/services/assistant.ts) → [AI routes](../vitaltrack-backend/app/api/v1/ai.py), [guard](../vitaltrack-backend/app/services/ai_guard.py), [provider](../vitaltrack-backend/app/services/ai_provider.py) and [server contract](../vitaltrack-backend/app/schemas/ai.py) → [queries](../vitaltrack-mobile/features/assistant/queries.ts), [snapshots](../vitaltrack-mobile/features/assistant/snapshot.ts), [drafts](../vitaltrack-mobile/features/assistant/drafts.ts) → [touch-confirmed order form](../vitaltrack-mobile/app/order/create.tsx). [Configuration](../vitaltrack-backend/app/core/config.py) is the authority for defaults. Detailed flows and the device acceptance checklist follow below.

## The authority boundary

Voice can read inventory, prepare or edit an **unsaved local order draft**, and request a reviewed inventory-report PDF. Voice cannot save orders, change stock, mark orders received, apply orders, send supplier messages or export an order as a way to save it. Saying “yes”, “confirm” or “save my order” cannot cross this boundary.

Only the Create Order review screen's touch confirmation calls `POST /api/v1/orders`. That creates an order and activity record; it does **not** increase inventory. The existing receive/status and apply-to-stock flows remain separate.

Optional cloud interpretation still writes consent/usage metadata (`ai_consents`, `ai_usage`). “No inventory/order writes from voice” does not mean zero database writes of every kind.

## End-to-end flow

1. Tap the centered **Ask CareKosh** microphone on the current tab. It glows while recording. The new Android module uses one `AudioRecord` (mono PCM16, 16 kHz, voice-recognition source) to feed a temporary WAV and local Moonshine streaming captions. Words beside the mic are genuine provisional recognition results and may be revised; they are not simulated typing. Tap again to finish (28-second native sample/wall-clock limit).
2. With the downloaded speech pack, Moonshine Small Streaming English supplies live captions and the final offline transcript by default. Without the pack, selected/consented online listening can still record, but live words are unavailable and only the final online transcript appears after stopping. Older native modules retain the Expo AAC/M4A capture path until a new APK is installed. Separately opted-in Groq online listening sends the finished recording through `/ai/transcribe` to Whisper. The temporary audio is deleted on completion/failure; no interpretation or draft is started automatically. Narration is independently selected: Android device TTS by default, or consented online Sarvam English. Alba selection is paused.
3. Review/edit the transcript, then tap **Send**. No question is interpreted or drafted before Send.
4. Familiar wording uses the local parsers. Otherwise, explicitly consented Groq understanding sends reviewed text through authenticated `/ai/interpret`. Text understanding uploads no inventory list or recording. Online listening is a separate option requiring `groq_audio` consent and a fresh local `audioOptIn` choice.
5. The app validates the interpretation, obtains a complete inventory snapshot owned by this login, and resolves names/calculations against real items. A valid interpretation can still misunderstand language; the screen is the review step.
6. A query produces persistent summary statistics and a compact virtualized table with serial number, name, quantity/unit and a textual stock status. The answer is an ordinary view in the app window, not a system overlay or a React Native Android Modal. Applied filters stay visible; original question, full explanation and matching source are under **Filters & question**. Follow-up, speech and export controls remain available. Large text/narrow screens stack table rows instead of overlapping columns. Expand a row to see recorded brand, supplier and minimum. Missing information is “Not recorded”; supplier and brand are separate fields. There is no manufacturer field or inferred manufacturer.
7. A drafting command builds local rows only. Review explicit versus suggested quantities on screen. Open **Review unsaved order draft** to reach Create Order; the microphone itself does not navigate.
8. Only **Confirm order & export PDF** and its confirmation perform the save. The screen checks backend support, refreshes inventory, verifies activity and versions, and requests another review if values changed. A confirmation dialog expires after a login, draft edit or background transition; it cannot confirm a different account or newer draft. Reviewed order quantities are retained. A changed recorded unit requires removing/re-adding the line; no conversion is invented.
9. The server rechecks ownership and optional `expectedVersion` under item locks in stable ID order. Changed/inactive items return 409. A successful save's returned rows feed the shared local PDF utility.

An operation already sent to the server may commit even if the user leaves or loses connectivity. Cancellation prevents later client dispatch or sharing; it cannot undo a server commit. Retry uses the retained submission ID.

## Supported bounded questions

| Family | Example | Important limit |
|---|---|---|
| Complete list/counts | “Show all inventory items with quantities and status”; “How many items do we have?” | Active entries, not a sum of incompatible units |
| Stock state | “Show everything that is low or out of stock” | Uses existing mobile `isLowStock` / `isOutOfStock` rules |
| Category | “Show low-stock items in wound care” | Use one exact recorded category; sync categories in this login |
| Supplier/brand | “Show everything supplied by Good Supplier”; “What brand are the surgical masks, and who supplies them?” | Recorded fields only, no inferred vendor/manufacturer |
| Missing supplier | “Which items have no supplier recorded?” | Empty/missing supplier only |
| Multiple items | “Show quantities for hand gloves and surgical masks” | All requested lines must resolve; no silent omission |
| Threshold | “Show items below their minimum stock” | Literal comparison; distinct from the app's broader low-stock rule |
| Follow-up | “Sort alphabetically”; “Only show the low-stock ones” | Requires a preceding inventory list; retains other filters |
| Report | “Export this inventory list as PDF” | Refresh/review the actual list, then touch Export reviewed inventory PDF |
| New draft | “Prepare an order for 20 pairs of hand gloves and 5 boxes of masks” | Local only; units must match the recorded unit |
| Replenishment draft | “Prepare a draft for all low-stock items” | Configured positive minimum: `max(ceil(minimum-current), 1)`; missing/zero/invalid minimum asks for quantity |
| Draft edit | “Set the order quantity for masks to 10 boxes”; “Add 3 bottles of saline to this draft”; “Remove masks from this order draft” | Set replaces, add adds more, remove removes a draft line only |
| Review | “Show my draft order” | The current account/session's unsaved draft |

Local number words cover one through ninety-nine; digit quantities up to 999,999 are accepted. Unfamiliar wording may use Groq, but neither parser promises arbitrary natural language or historical analytics. Unhandled conditions must be rephrased/clarified, not silently dropped. A quantity must be tied to its spoken item; units are never converted between boxes/pairs/pieces.

## Speech and understanding follow-up — 8 October 2026

Speech recognition and request understanding are separate steps. Enabling **Groq understanding** does not improve a Moonshine transcript; it interprets reviewed text after Send. **Enable Groq online listening** is a separate, explicitly consented option. Defaults remain offline listening, device speech and no cloud opt-in. Old provider preferences do not authorize an upload; `audioOptIn` must be chosen in this version, and the server must report the `groq_audio` scope and Groq transcription availability before each upload. No provider is silently substituted on failure. Choose **Use offline listening** to return to Moonshine; **Withdraw all cloud consent** disables both online modes and attempts server revocation.

The new Android module captures mono PCM16 at 16 kHz using `AudioRecord` and `VOICE_RECOGNITION`. Capture and inference have separate threads; PCM sample and wall-clock limits bound recordings, and native lifecycle cancellation releases the microphone. A bounded queue supplies captions; a failed or backlogged preview is disabled while the final recording continues. The same samples feed local streaming captions and a temporary WAV (up to 896,044 bytes). The offline decoder validates its exact header, duration and signal, and the upload declares `audio/wav`. The older-module compatibility path still requests mono AAC/M4A at 44.1 kHz and 128 kb/s through `expo-audio`, declared as `audio/mp4`; it provides words after stopping. Expo still supplies permission/audio-mode management and optional playback. The backend accepts both formats and normalizes audio for Whisper. The 28-second foreground limit and temporary-file cleanup remain. No noise-reduction or accuracy improvement is claimed without recordings from a phone. The Whisper prompt contains generic stock vocabulary, not an account's inventory or item-name list.

Natural queries use the existing bounded v2 specification. For example, “Create a purchase order draft; for hand gloves I need twenty pairs” can reach Groq, and supported category/supplier/brand/status filters can be combined. Generic legacy refusals no longer block valid draft paraphrases. Quantity validation accepts bounded grammatical connectors while still binding each amount and unit to its named item. Wrong quantities, units and invented names are rejected. Conditions the contract cannot express—forecasts, history, arbitrary calculations or unsupported extra constraints—must be clarified/refused, not ignored. Results show whether the request was matched locally or understood with Groq; inventory results show the interpreted filters for review.

The app rechecks backend capabilities before unfamiliar online queries instead of retaining a failed cold-start check. An old backend reports a deployment mismatch for natural draft requests. Provider/consent/quota errors remain visible. Typing is available directly from the microphone dock without making a recording.

For a staging pilot, the existing backend settings must enable `AI_ENABLED`, `AI_TRANSCRIBE_ENABLED`, operator-reviewed `AI_DATA_CONTROLS_REVIEWED`, and a valid server-only `GROQ_API_KEY`. The intent model remains `openai/gpt-oss-20b`; listening uses `whisper-large-v3`. That Groq listening/draft follow-up adds no API key, migration or autonomous mutation tool. The separate 11 October Sarvam BYOK follow-up adds migration 0011 for encrypted narration credentials, not inventory/order changes. Real provider behavior and recognition accuracy remain unverified by mocked tests.

Official references: [Sarvam public design reference](https://www.sarvam.ai/), [Android AudioRecord](https://developer.android.com/reference/android/media/AudioRecord), [Moonshine Android source](https://github.com/moonshine-ai/moonshine-v2/tree/main/examples/android/Transcriber), [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [Groq speech-to-text](https://console.groq.com/docs/speech-to-text), [Expo SDK 54 audio](https://docs.expo.dev/versions/v54.0.0/sdk/audio/). Strict schema output constrains data shape; it does not certify semantic understanding or speech accuracy.

## Local state, ambiguity and retries

`features/assistant/drafts.ts` holds one in-memory draft scoped by account and authentication epoch. It survives screen navigation; logout/account change/app restart clears it. This is not a persisted offline write queue.

New voice work does not silently overwrite a manual draft. The assistant shows the proposed rows with **Merge**, **Replace**, and **Cancel** controls. Merge never adds conflicting quantities together; clarify or explicitly replace. Draft edit proposals that touch manual work—including an unchanged manually initialized cart—require explicit replacement review. Identical repeated set quantities are deduplicated by item ID; conflicting quantities or operations require clarification. Explicit lines win over replenishment suggestions. An explicit removal is not re-added by an inclusion rule.

Ambiguous item names produce selectable candidates. Unresolved names/units/quantities do not publish a partial draft. Offline queries/drafts require data verified in this login, use last-known labels, and never save offline. Inventory completeness and pending-write protections from the earlier safety work remain.

The order form waits for loaded, verified inventory before initialization, excludes inactive items, and never overwrites an already initialized/edited draft. Manual order selection and existing stock rules are retained. The manual screen's former fallback of one for an unconfigured minimum remains; voice replenishment asks for an explicit amount instead.

A submission stores one immutable request and `localId` in memory. An uncertain save locks editing and offers **Retry same submission**. The existing hook retry also keeps the same variables. A definitive input/ownership/version rejection can unlock editing. A saved order with a failed PDF remains available as **Re-export saved order**; that path creates no new order. Recent Orders also re-exports saved orders. After an app restart, check Recent Orders before submitting again because the local draft/submission context is intentionally not persisted.

## Contracts and compatibility

- `/ai/capabilities` adds `interpret_contracts: [1, 2]` and `order_review_guard: true`. **13 October 2026:** it reports `[1, 2, 3]`.
- `/ai/interpret` without `contract_version` retains the four-field **v1** intent contract for older APKs. New clients request `contract_version: 2` when supported. **13 October 2026:** the current app requests `contract_version: 3` when it is listed, and version 2 is unchanged ([contract 3](#multi-part-requests-contract-3--13-october-2026)).
- **v2** returns `version`, `intent`, `draft_mode`, nullable bounded `query`, bounded `lines`, and `include_low`/`include_out`. Permitted names include `inventory_query`, `draft_order`, `review_draft`, `inventory_export`, `clarify`, `unsupported_action`. There is no save/apply/update/send operation.
- Python/Pydantic and TypeScript both reject extra fields and invalid shapes. The provider checks names/units and explicit quantities against reviewed text, including quantity-to-item association. Strict JSON validates shape, not the truth of stock or perfect understanding.
- New Create Order requests include per-line `expectedVersion`. Older clients can omit it and retain their previous contract. A `localId` replay returns the existing order before checking changed inventory; it never updates that original order.
- The new review screen refuses to confirm against a backend that lacks `order_review_guard`. Deploy matching backend/mobile revisions before acceptance. No new migrations, keys, models or Python presentation service are required; migration head remains `0010`.

## PDFs and truthful feedback

Inventory export prints the exact reviewed active rows and labels snapshot time/staleness. Category names are refreshed when possible; unavailable names are labelled, and no rows are dropped. A category-filtered export must resolve its category successfully. All untrusted names/metadata are HTML-escaped. A failed rename uses the real original PDF URI; filenames contain a timestamp. Generation, opening a share sheet, and delivery to another person are different outcomes. Expo sharing does not prove delivery or that a person saved the file.

Order export shares the template used by Recent Orders and uses the saved response's rows/public order number. It does not replay a save. Account/cancellation checks run before rendering/copying/sharing. The existing app-level `totalUnits` sums order-line quantities; it is not a conversion or a physical total across different units.

## Code map and verification

| Concern | Source |
|---|---|
| Legacy parser, summaries, safety/name hints | `vitaltrack-mobile/features/assistant/core.ts` |
| Strict v2 and v3 contracts | `vitaltrack-mobile/features/assistant/contracts.ts`; `vitaltrack-backend/app/schemas/ai.py` |
| Contract 3 executor and local grammar | `vitaltrack-mobile/features/assistant/selection.ts`; `queries.ts` (`parsePlan`, `draftFollowUp`) |
| Voice provider registry | `vitaltrack-mobile/features/assistant/providers.ts` |
| Expanded parser, filters, deterministic resolution | `vitaltrack-mobile/features/assistant/queries.ts` |
| Draft state, merging, quantities, submission identity | `vitaltrack-mobile/features/assistant/drafts.ts` |
| Session-owned complete inventory/category snapshots | `vitaltrack-mobile/features/assistant/snapshot.ts` |
| Assistant dispatcher and transcript/proposal review | `vitaltrack-mobile/components/assistant/AssistantExperience.tsx` |
| Virtualized results, details, accessibility labels | `vitaltrack-mobile/components/assistant/AnswerList.tsx` |
| Touch confirmation and save/PDF recovery | `vitaltrack-mobile/app/order/create.tsx` |
| Shared PDF utilities | `vitaltrack-mobile/utils/inventoryPdfExport.ts`; `orderPdfExport.ts` |
| Cloud adapter and guarded server orders | `vitaltrack-backend/app/services/ai_provider.py`; `app/api/v1/ai.py`; `app/api/v1/orders.py` |

Automated checks execute the real parsers, draft engine, rendered assistant and Create Order screen with native modules/providers mocked. PostgreSQL checks use disposable synthetic databases. New tests: `voice-drafts.test.cjs`, `order-draft-screen.test.cjs`, `pdf-reports.test.cjs`, extended `assistant-inline.test.cjs`, and backend `test_voice_drafts.py`. They cover zero voice-originated order/inventory mutations, quantities, conflicts, account clearing, touch-only save, old-backend refusal, changed-stock review, retry identity and PDF re-export.

Verification for the earlier committed draft implementation (`a8052df`, 8 October 2026): **267 backend tests** in both create-all and Alembic-migrated disposable PostgreSQL setups; **203 mobile tests**; TypeScript clean; Ruff clean; ESLint zero errors and one existing `builder.tsx` hook-dependency warning. Backend coverage was 87.96% overall, with items and orders above their 70% file gates. The API route gate was 44 and migration head 0010. Documentation checking covered 108 files with zero reported problems. Offline browser checks covered 19 HTML pages at desktop/phone widths, four changed context/voice SVGs and 70 enlargement controls with zero reported issues. These are dated results for that revision, not release guarantees.

The subsequent local speech/understanding follow-up passes **273 backend tests** against a disposable create-all PostgreSQL database with AI providers mocked, and **217 mobile tests** with native modules/providers mocked. TypeScript and Ruff pass; ESLint has zero errors and the same existing builder warning. The follow-up changes no database models, migrations or endpoint contracts; the migrated-schema suite was not repeated for this follow-up. Regression tests exercise natural draft routing, compound-filter forwarding, quantity/name/unit grounding, explicit item suggestions, separate audio consent, capability refresh and transcription failures. These tests establish routing and safety behavior within their tested scope, not live Groq interpretation or recognition accuracy.

**Not verified by laptop tests:** APK/native compilation, microphone quality, live Moonshine/Groq/TTS responses, live Render/Neon configuration, Play-distributed builds, share-sheet behavior and accessibility on actual Android devices, or 10,000-account / 100–1,000 concurrent-user capacity. Test these on staging and a phone before release. Existing unrelated audit findings remain open in [API traceability](API_TRACEABILITY.md).

## Assistant presentation and live captions — 9 October 2026

Only assistant surfaces were restyled: the tab microphone/review dock, answer panel and Voice setup. Other screen designs, backend handlers, database models and mutation contracts are unchanged. The answer is native text/table components, rather than a Python-generated image: rows remain accessible, expandable and usable offline.

- Idle: small microphone with **Ask Care Coach**; a discreet pencil opens typing.
- Recording: a blue glow, **Listening…** until actual words arrive, then provisional words beside the mic. No large recording card or sound-level instructions. Reduced-motion settings keep a steady glow.
- Stop: final provider transcript in an editable field; a send arrow is on the right. Tapping the mic starts a fresh take. Live words alone never trigger interpretation, a query or a draft.
- Send: keyboard is dismissed and **Thinking…** appears; no Android Dialog is opened for the answer. The answer layer blocks underlying interactions, handles Android Back and is removed on navigation/logout.
- Answer: compact statistics and table, explicit text stock states, expandable recorded details, filters, freshness and persistent action controls. Saved/order PDFs still require the existing touch-confirmed order workflow.
- Settings: compact setup steps, separate cloud consent controls, expandable help and licence information. Downloading the speech pack enables local live words even when Groq is chosen for the final transcript.

Verification for this follow-up: **224 mobile tests** pass with native/provider mocks; TypeScript passes, and ESLint has no errors (one pre-existing builder warning). Kotlin sources type-check against the official Android API 35 archive and pinned Moonshine 0.1.5 classes, using an Expo DSL shim. JVM checks exercise WAV sample fidelity, silence, short/oversized recordings, malformed headers, cancellation and the 28-second boundary. A separate capture-thread simulation with fake Android/Moonshine adapters checks repeated takes, failed startup, provisional words, preview failure/backpressure and microphone/file cleanup. The mocked UI also repeats the first-answer → next-question flow three times without a native dialog or automatic submission. These are not a Gradle/APK build or hardware validation. Isolated React Native Web previews use the real assistant components with synthetic inventory and mocked native/provider services.

The owner's Android screenshot shows a “displaying over other apps” warning on a **OnePlus Nord 4, OxygenOS 15**, after the first assistant answer when attempting another question. The app configuration blocks `SYSTEM_ALERT_WINDOW`, and the new assistant panel stays within the app window. This does **not** establish the warning's cause or prove it resolved. If it recurs in the new APK, capture the phone model/Android version, installed manifest and ADB/logcat/ANR evidence; do not claim it was caused by microphone permission or the backend without evidence.

Code: `components/assistant/AssistantDock.tsx`, `AssistantLayer.tsx`, `AnswerList.tsx`, `AssistantExperience.tsx`, `VoiceSetup.tsx`; `features/assistant/offlineVoice.ts` and `capture.ts`; native `StreamingRecording.kt` and `AudioDecoder.kt`; `services/assistant.ts` declares the actual upload format. The pinned native SDK and model catalogue remain unchanged.

## Phone acceptance checklist

1. Use matching staging backend and preview APK, with synthetic/test inventory. Complete Voice setup once.
2. Test typed questions first, then microphone → transcript review → Send; test different phrasing and deliberate recognition errors.
3. Check all table rows/counts against Inventory, including hidden items, zero stock, categories, brands and absent suppliers; follow up, sort, refresh, expand details and test large text/dark mode/TalkBack.
4. Draft spoken quantities with mixed units. Test duplicate/ambiguous names, incorrect units, missing minimum, set versus add, removals, merge/replace/cancel and existing manual work.
5. Observe traffic: until the touch confirmation, no `POST /orders`, stock update, status/apply/delete or supplier send is allowed. Saying confirm/export my order must refuse.
6. Change stock from another client before touch confirmation; expect another review and unchanged order quantity. Confirm an order; stock must not increase.
7. Simulate lost response and printer/share failure. Retry must return the same order; re-export must create no additional order. Check Recent Orders after a restart.
8. Test offline last-known labels, logout/account switching, cancel, screen changes and backgrounding during preparation; no later dispatch/share should cross the session boundary.
9. Enable **Groq understanding** for unfamiliar typed wording. Expand **Filters & question** to check **Understood with Groq**, then check the visible interpreted filters and the resulting draft quantities. Compare with exact inventory names and units. Test both natural draft paraphrases and combined category/supplier/status filters; unsupported analytics must clarify/refuse.
10. Test offline listening first, then explicitly select **Enable Groq online listening** and accept its separate audio disclosure. Compare the same recording conditions; review item names and numbers before Send. Text consent alone, old provider preferences and an unselected online option must never upload audio.
11. Disable network, revoke consent, or disable the staging transcription capability while online listening is selected. Expect a visible failure and no automatically substituted transcript or downstream request. Choosing **Use offline listening** must stop uploads from this device. **Withdraw all cloud consent** must turn off both modes and report any failed server withdrawal.
12. Verify live words appear with the speech pack installed, tapping stops promptly, the final transcript can correct provisional words, and a long utterance stops at 28 seconds. Test typing → Send with the Android keyboard open; the keyboard must close, the answer must scroll without overlap, and Android Back must close only the answer. Test a small phone, maximum font size, dark/light mode and reduced motion. Repeat the warning scenario and collect ADB logs if it recurs.
13. Verify an initial Render cold start does not permanently disable subsequent natural queries; a later Send refreshes capabilities. An old backend must explain unsupported order-draft interpretation rather than silently attempting the older contract.

## Settings and mixed-draft verification — 10 October 2026

Voice setup follows the request lifecycle in four sections:

1. **Tap to talk:** assistant and microphone switches, Android permission guidance.
2. **Listening · speech to text:** offline Moonshine speech pack and separately consented optional Groq Whisper final transcription. The pack supplies live words even when online listening is selected.
3. **Understanding · text to task:** optional Groq interpretation after reviewed Send. Text consent is separate from audio consent; withdrawing all cloud consent disables online listening/understanding/narration and selects device voice.
4. **Spoken replies:** default device speech or optional Sarvam English, separate answer-text consent, read-aloud choice, Sarvam pace and preview. Alba is labelled paused and its existing pack can be removed. Recognition is a separate pack; help and retained licence notices remain expandable.

The local parser now supports bounded mixed drafts such as:

> Create a saved order draft for the following items: first is two units of Ambu bag, and second is all the items which are low in stock or out of stock, create a saved order draft.

After transcript review and Send, this prepares an **unsaved, session-local** draft: Ambu Bag gets the explicit quantity of 2 in its recorded unit; other active low-stock/out-of-stock items get deterministic suggestions from their meaningful recorded minimums. The explicit line takes priority even when that item also belongs to a stock group. Inactive items are excluded. Missing/ambiguous names, incompatible units or a missing meaningful minimum require clarification; the app does not publish a partial draft or overwrite manual work silently. Saying “saved draft” is not permission to persist an order or draft. Only the existing review-screen touch confirmation saves an order; restarting/logging out clears unsaved drafts.

The backend's v2 prompt includes the same mixed-request examples for unfamiliar paraphrases. Stock-group clauses are consumed in full by the local parser; extra supplier constraints, exclusions or limits go to interpretation/clarification instead of being dropped. The schema remains bounded: arbitrary compound tasks, forecasts, history and unsupported calculations are not promised. [Groq structured outputs](https://console.groq.com/docs/structured-outputs) constrain response shape; they do not establish correct meaning for every human sentence. Review visible item names, quantities and spoken-versus-suggested labels.

**Reproduced checks:** 240/240 mobile tests; 275/275 backend tests with both create-all and migrated disposable PostgreSQL schemas; TypeScript and Ruff pass. ESLint reports no errors and one existing builder-hook warning. New screen-flow checks cover typed and reviewed spoken mixed requests, unfamiliar consented v2 interpretation, unresolved lines preserving manual work and independent settings choices. New backend route checks use real authentication, consent/quota checks, schemas, provider grounding and owned inventory reads; only external HTTP is mocked. They confirm unchanged inventory/order/activity data. Cloud consent/usage metadata can still be written, as documented above. These are verified within that test scope, not live model or physical-device certification.

**Still required on the release candidate:** a new native APK, current staging prompt revision, real recordings and unfamiliar paraphrases, small-screen/large-text appearance, accessibility, repeated questions and target-phone narration. This dated review turn did not call real Groq, staging/production, deploy, commit or push. The local browser preview was blocked by its file-URL policy, so no new browser visual pass is claimed; component layout/control structure and interaction tests pass.

Official references: [Sarvam public design reference](https://www.sarvam.ai/), [Android AudioRecord](https://developer.android.com/reference/android/media/AudioRecord), [Moonshine Android source](https://github.com/moonshine-ai/moonshine-v2/tree/main/examples/android/Transcriber), [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [Expo Print](https://docs.expo.dev/versions/v54.0.0/sdk/print/), [Expo Sharing](https://docs.expo.dev/versions/v54.0.0/sdk/sharing/). Source code and reproduced tests remain the authority for project-specific claims.

### Historical Alba acceptance checks — paused, not current setup

Download/Cancel/Retry/Remove, Preview at each pace, Hear answer in airplane mode, repeated replies, interruption, another microphone query and logout/background cancellation must pass on the OnePlus and another target phone. The real asset bundle produced finite non-silent PCM in a Mac CPU fixture; Kotlin tokenization, setup and failure checks do not certify Android playback. Follow the [Pocket TTS device checklist](POCKET_TTS_ALBA.md#verification-and-release-gate). No Render change is needed for Alba.


## Sarvam narration verification — 11 October 2026

**Current checks:** 298 backend tests passed against a fresh disposable PostgreSQL 16 cluster, and all 260 mobile tests passed. TypeScript, changed-file lint and backend Ruff are checked separately. Provider requests and audio hardware are mocked. The source/contract, player lifecycle and consent changes are covered by these synthetic tests. The microphone, local/offline parser, Groq understanding/listening, mixed drafts, account isolation, order retry/PDF flows and existing business routes remain covered by the full suites. A live API key, provider voice audition and actual OnePlus speaker/Bluetooth playback are still pending. Use the [Sarvam guide](SARVAM_ENGLISH_VOICE.md) for private Render configuration and the new-APK acceptance steps. Repeated Preview/Hear answer calls consume new speech allowances; internal quota reservations are shared with Groq and are not an invoice cap.

## Multi-part requests (contract 3) — 13 October 2026

![Contract 3: a request becomes a validated plan, then deterministic rows. Each group is an AND of conditions, groups are unioned, exclusions are removed, and rows are sorted; answers show filters and reasons, drafts show Explicit and Suggested quantities, and unclear requests ask first. Below, Voice setup keeps readiness, the saved choice, consent and the provider in use apart.](diagrams/voice-plan.svg "How a multi-part request becomes rows")

**What changed.** Version 2 had no way to say "less than 3", "critical", "excluding gloves", "order priority" or "a draft from those". Such requests went to a clarification, or relied on Groq not dropping the condition. Version 3 represents them as a bounded plan, which the phone executes deterministically:

1. Start from all active items, or from the list on screen when the request is a follow-up.
2. Keep the rows that match **any** group. Inside one group every condition must hold. A list inside one condition, such as "low or out of stock", means either.
3. Remove the rows that match an **exclusion**. The removed rows are listed.
4. Sort, and show each item once.

**Examples the phone understands without Groq.** Each answer shows "Filters understood" and a "Why" line on every row.

| You say | The plan |
|---|---|
| How many items have quantity less than 3? | quantity < 3 |
| Show items with at most / exactly / more than three remaining | ≤ 3 / = 3 / > 3 |
| Show items below 3 and also all low-stock or out-of-stock items; prepare an order draft for them. | draft from (quantity < 3) ∪ (low or out) |
| Prepare a draft for critical items that are low or out of stock. | draft from critical equipment **and** (low or out) |
| Two units of Ambu Bag, plus the other low-stock and out-of-stock items; prepare an order draft. | Ambu Bag 2 units (Explicit) + low or out (Suggested) |
| Which stocks should I consider ordering now? | low or out, in order priority |
| Low-stock wound-care items from supplier Good Supplier, excluding gloves, sorted alphabetically. | low **and** category **and** supplier, minus "gloves", A–Z |
| Only the critical ones · Exclude masks · Create a draft from those | follow-ups on the list on screen |
| Add five more · Set the draft quantity to five | change the draft line in focus (you choose if several could be meant) |

**Rules worth knowing.**

- **Critical** means critical equipment: the item is marked ★, or its name matches a critical-equipment rule such as "ventilator" or "ambu bag". If one of your categories has "critical" in its name, the app asks which you meant.
- **Order priority** puts rows in this order:
  1. out of stock;
  2. then critical equipment;
  3. then the largest share of the minimum missing.
- **Suggested quantities** bring stock up to the recorded minimum. A critical item with one left gets one backup. Items with no minimum are listed together in one clarification, and nothing changes.
- **Quantities you state** take priority over suggestions. If an exclusion contradicts an explicitly quantified item, the whole proposal asks for clarification before changing the draft. Signed, fractional or otherwise unrepresentable amounts are never normalized into positive whole numbers.
- **The server checks Groq's plan** before returning it. Names and numbers must come from your words. Detectable conditions, critical polarity, grouping, comparisons and item-to-threshold associations must agree. Recorded names remain names even when they contain words such as "Low Stock" or "Above Three". A follow-up needs a list on screen. Lexical checks cannot prove every interpretation.

**Compatibility.** The app asks for version 3 only when `/ai/capabilities` lists it. It upgrades compatible basic version 2 answers from older servers; detected advanced requests that an old contract cannot represent are blocked before cloud interpretation. Local version 3 plans can still work with an older backend. APKs without a version still get version 1. The marker gate is conservative, not a complete interpreter. Contract 3 adds no route, table or migration; the earlier Sarvam implementation requires migration 0011.

**Evidence.**

- Mobile: `tests/voice-plans.test.cjs` and `tests/voice-providers.test.cjs`, plus inline UI tests. The initial 314-test baseline was independently reproduced, then additional regressions were found and fixed.
- Backend: `tests/test_voice_plans.py`, `tests/test_sarvam_transport.py` and `unit_tests/test_ai_plan_grounding.py`. See the [independent follow-up](AI_VOICE_END_TO_END_REVIEW.md#12-independent-follow-up) for current full-suite results, business-row comparisons and remaining live checks.

Live Groq understanding of these examples, and the phone layout, are **NOT VERIFIED**. See the [review](AI_VOICE_END_TO_END_REVIEW.md#8-acceptance-matrix).

## Voice setup stages — 13 October 2026

Voice setup now has an **Assistant** card (on/off) and three sections: **1 Listening**, **2 Understanding** and **3 Spoken replies**. Provider prerequisites are labelled Ready, Needs download, Needs your consent, Needs a configured key, Unavailable or Paused. Sarvam's positive label is **Configured · preview to verify**: configuration is not proof of live key validity, credits or audible output.

The **Selected** line states whether the saved choice can run now. For example: "Selected: Sarvam English · online · Needs your consent". A choice that cannot run is never shown as working, and it is never swapped silently.

Choices are saved per account. Old saved choices load with no online opt-in. "Use on-phone understanding only" turns off Groq for this account without withdrawing server consent; "Withdraw all cloud consent" remains separate. Alba shows as Paused outside the diagnostics test build.

## Spoken answers and stricter checks — 15 October 2026

Item numbers refer to [§14 of the end-to-end review](AI_VOICE_END_TO_END_REVIEW.md#14-october-follow-up-audit-and-fixes). This is the working tree, not yet committed.

### What is read aloud

Earlier (13 October 2026), only plain answers were spoken. A question back to you, a draft proposal or a draft review was shown silently, which broke eyes-free use (V-9). Current behaviour:

- **Clarifications** read the question, then up to three choices: "Which item did you mean? Choices: Hand gloves, or Surgical gloves." With more choices, the third is followed by "or another choice on screen".
- **Draft proposals** read a short summary. Merge, Replace and Cancel results, and the draft review, are read as well.
- **Spoken replies off.** Nothing is spoken. TalkBack users still hear a one-line summary of each answer, expanded row details and the final transcript (V-17).
- **A tap during speech** stops the old speech and reads the new answer once (V-8).

### Drafts and follow-ups

- **Last line removed (V-15).** The draft is cleared: "The draft is now empty. Nothing was saved." Earlier, an empty draft still showed "Confirm order" instructions.
- **One choice resolves the chain (V-18).** A choice made for an ambiguous name applies to every later step, including Refresh and Export. Earlier, a follow-up could ask the same question again and again.
- **Refresh keeps the answer (V-13).** A failed refresh, such as one made offline, keeps the answer on screen and marks it "Last known".

### Text prepared for speech (V-20)

Screen text never changes. The spoken copy is prepared for every voice by `speechFriendly` in `features/assistant/core.ts`, before the 640-character limit is applied:

| On screen | Spoken |
|---|---|
| Syringe 5ml | Syringe 5 millilitres |
| Saline 0.9% 500 ml | Saline 0.9 percent 500 millilitres |
| Gloves (Large): 20 pairs | Gloves, Large: 20 pairs |
| Suture 3/0 | Suture 3 oh |
| Dressing 10x10 cm | Dressing 10 by 10 centimetres |
| IV Cannula 20G | IV Cannula 20 gauge |
| Foley catheter 16Fr | Foley catheter 16 French |
| Gauze 20 pcs, 1 pc spare | Gauze 20 pieces, 1 piece spare |

Rupees, degrees, "+" and "#" are handled too. Unknown slash expressions stay unchanged: `100mg/dL`, `IU/ml`, `w/v`, `AB/CD` and fractional quantities must not become alternatives. The suture rule applies only to a whole integer size after “suture”, not a decimal denominator. `PRONUNCIATIONS` is an empty map for reviewed item spellings. Kokoro separately prepares standalone decimals and British spellings; dates, versions and item codes are protected ([details](POCKET_TTS_ALBA.md#kokoro-test-voice-v-41)).

### Stricter checks on Groq's plans

- **Contract 3 (V-21).** `require_complete_plan` in `app/services/ai_plan_grounding.py` rejects a plan that drops or changes what was asked:
  - words must fit bounded grammar, recorded names or supported conditions; courteous wrappers and common stock synonyms are accepted;
  - every number must be used; asking to display supplier/brand details is distinguished from filtering by a named supplier/brand;
  - "add", "set" and "remove" must match their clause after copied item names and units are masked, so names such as “More Gauze” do not become commands;
  - a follow-up needs a reference such as "those" or "only".
- **Contracts 1 and 2 (V-22).** Older APKs retain stock synonyms such as “running short”, “run out”, “depleted” and “nothing left”. Stock conditions, missing-supplier filters and sorting must still match the request both ways. Unsupported meanings require clarification, rather than silently losing a condition.
- **Schema sent to Groq (V-42).** Groq documents only part of JSON Schema for strict mode. So the server sends a portable copy: a fixed value becomes a one-value list, and undocumented keywords are left out. The server still enforces every rule on the reply. Groq errors are mapped to clear answers (401/403 → 503, 429 → 429, 400/413/422 → 502) and logged without any request or reply text.

Lexical checks still cannot prove every interpretation; the answer keeps showing "Filters understood" for review.

**Evidence.** The initial 15 October implementation passed 378 mobile and 521 backend tests, but independent review found regressions those tests missed. The fixes and new results are recorded in [the verification follow-up](AI_VOICE_END_TO_END_REVIEW.md#15-independent-verification-follow-up). The original review is preserved as a dated record. Live Groq replies, actual narration and TalkBack still need phone/provider acceptance.
