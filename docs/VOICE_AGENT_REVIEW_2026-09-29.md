# CareKosh voice assistant — review and implementation record

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. This document’s original proposals/results remain historical; use the maintained guide for current behavior. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

> **Historical review (29 September; status note from 7 October superseded):** the hosted Whisper/Piper Alba pipeline and test counts below describe that review. Today’s working tree uses offline Moonshine live/final recognition, optionally consented Groq Whisper and GPT-OSS interpretation, device TTS, and local drafts with touch-only saving. Follow [the maintained architecture](VOICE_INVENTORY_AND_ORDER_DRAFTS.md); this record is not the current release specification.

29 September 2026. Code improved locally; not committed, pushed, deployed or certified for release by this review.

## Decision

Keep the read-only, turn-based voice pipeline already implemented. The supplied Jarvis tutorial and Iris contain useful engineering patterns, but neither demonstrates better recognition on CareKosh's users or a permanently free production service. Adopt bounded capture, clearer microphone feedback, conservative local interpretation and whole-transcript validation now. Do not replace the stack on the strength of a demo.

Selected flow: native Expo Audio recording → existing authenticated FastAPI adapter → Groq Whisper Large v3 → editable transcript → local whole-command parser, or Groq GPT-OSS 20B intent extraction → validated mobile read-only tools → one factual answer for both card and approved Piper Alba speech.

The database/server remains authoritative. The assistant can reuse complete, fresh, current-account inventory already loaded by the normal application. Otherwise it uses the existing refresh mechanism; last-known data is labelled. This is not a conversion to an offline-first inventory system.

## What was actually reviewed

- The supplied Jarvis video transcript and screenshots: LiveKit, Gemini Live, mobile/web frontends, development tokens, camera/web/browser tools and real-time conversation. The source video was not independently played or benchmarked.
- Iris source: `audio/vosk_source.py`, `audio/listening.py`, `audio/comprehend.py`, `audio/tts.py`, `voice/transcribe.py`, `voice/understand.py`, `voice/layer.py`, `voice/kokoro.py`, listening-model catalogue, UI intent dispatcher and installation scripts. Paths are within `gateway/iris_gateway/` except the UI/scripts. Iris was inspected, not modified or run.
- CareKosh's current assistant screen, local parser/tools, account-owned snapshot logic, backend AI routes/adapters, separate speech worker, tests, Expo/native configuration and preview workflow.
- Current official provider and runtime documentation, linked below. Provider prices, terms and model availability must still be checked before release.

Iris now contains more than its original Vosk/Alba pairing: it also has optional hosted understanding/transcription and Kokoro/Gemini speech paths. Availability in that source tree does not prove that those paths are deployed or suitable for Expo. Its recorded small local-model benchmark was poor for that Pi workload; it was not rerun, and it is not evidence against every local model.

## Adopted, retained and deferred

| Idea | Decision and reason |
|---|---|
| Visible listening state and bounded recording | Adopted. Timer, advisory sound level, preparation/stop locks and cancellation cleanup make failures understandable and prevent overlapping takes. |
| Stop playback before listening | Retained and strengthened through recording lifecycle/audio-mode cleanup. This is not acoustic echo cancellation. |
| Whole-command local intent dispatch | Expanded to common polite wrappers. Exact item matching and clarification remain mandatory; compound/negated requests are not reduced to a convenient keyword. |
| Iris transcription quality checks | Adapted, not copied: reject an uncertain whole utterance instead of removing a segment that might contain “do not”. Groq's segment metrics support diagnostics, not a calibrated guarantee of correctness. [Groq STT](https://console.groq.com/docs/speech-to-text) |
| LiveKit transport and turn-taking | Defer. Appropriate for a later full-duplex product, but adds session/token/media infrastructure to today's short read-only requests. It supports both staged STT/LLM/TTS and real-time models; it is not itself a better recognition model. [LiveKit quickstart](https://docs.livekit.io/agents/start/voice-ai/) |
| “100% free” Jarvis deployment | Not a production assumption. LiveKit lists separate session allowances and inference credits; free session minutes do not mean unlimited free model usage. Self-hosting also consumes compute/bandwidth. [LiveKit pricing](https://livekit.com/pricing) |
| Gemini Live speech-to-speech | Defer. It changes privacy, voice identity and the fixed-answer boundary without evidence of a benefit on our evaluation set. Free and paid tiers have different data-use terms; inspect the exact model/tier before sending sensitive content. [Gemini pricing and data-use table](https://ai.google.dev/gemini-api/docs/pricing) |
| Vosk offline recognition | Keep as a future measured option. It can operate offline, but adding its native runtime and vocabulary/quality evaluation is real work. A closed grammar limits the output vocabulary; it cannot guarantee the correct allowed phrase was selected. [Vosk](https://alphacephei.com/vosk/) |
| Kokoro local speech | Keep as an explicit alternative benchmark, not a silent Alba replacement. It is an 82M TTS model with Apache-2.0 weights, not listening or intent understanding. Native integration, selected voice assets, packaging and device performance still need review. [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M) |
| Camera, web search and browser control | Excluded. Stock answers come from CareKosh data and typed app functions, not screen coordinates, browsing or an autonomous action loop. |
| Background wake words/automatic send | Deferred. Explicit short recordings plus editable transcripts keep the first release testable and avoid accidental uploads or premature cut-offs. |

## Changes made in this review

### Microphone and interaction

- Added a tested capture controller that serializes permission/preparation, recording, stopping and audio-mode restoration. Cancel during preparation/stop cannot hand a cancelled take to transcription or start a second native take early.
- Added a visible recording timer and bounded sound-level indicator. Quiet/loud messages are guidance only: quiet speakers are not rejected by that meter. No denoising, new VAD or improved recognition accuracy is claimed.
- Preserved the 28-second limit, explicit Finish/Send, typed fallback and immediate local Cancel/Stop. New recordings clear the previous transcript so failed capture cannot accidentally resend old text.
- Bound item-choice and “Refresh this answer” actions to the question that produced the card, not subsequently edited input. New named-item failures cannot keep an unrelated old item as “those”.

### Understanding and reliable facts

- Recognize complete polite forms such as “Could you please show me low stock items?” locally, reducing unnecessary interpretation calls. Negation, history, mutation verbs and multi-action requests keep their conservative handling.
- Missing quantity/threshold data no longer hides an available supplier. Missing quantities are never rendered as zero. Displayed refresh timestamps are limited to inventory answers.
- Validate transcription shape, complete segment coverage and finite quality metrics. Exact common subtitle hallucinations and questionable utterances prompt re-recording; no segment is silently removed from an actionable sentence.
- Reject near-flatline decoded audio before sending it to Groq. This only detects effectively absent signal; noise, microphone quality and recognition accuracy still require real recordings.

### Provider and delivery hardening

- Validate provider usage metadata before accounting, disable environment-proxy inheritance for model calls and preserve cancellation while terminating the audio decoder.
- Updated the preview APK CI job to Node 22, compatible with the project's React Native version. No remote build was started.
- Updated the setup handoff and final HTML guide's status. Existing unrelated edits/deletions remain untouched.

No new dependency, AI-provider account/key, model download, database migration or inventory-write capability was added **by this review**. The earlier assistant implementation still requires its existing consent/usage migration and configuration.

## Local verification

| Check | Result |
|---|---|
| Full backend tests, real Alembic chain and disposable PostgreSQL | 193 passed; synthetic fixtures/mocked providers |
| Mobile unit/regression tests | 48 passed, including microphone races and parser safety |
| TypeScript | Passed |
| Backend Ruff and formatting of changed Python files | Passed |
| Mobile lint | No errors; three pre-existing warnings in inventory, orders and builder screens |
| Android JavaScript export | Passed; not a native APK or device test |

Tests do not establish word/intent accuracy, full-duplex performance, real Groq compatibility, Alba sound quality or app-store compliance. No private inventory or real voice recording was uploaded during this work.

## What remains before preview/release

1. Review the entire pre-existing dirty branch alongside these changes. Commit/push are a separate next action, not performed here.
2. Confirm staging hosting is available. The earlier Render billing suspension must be resolved if still active; live billing/service status was not checked in this review.
3. Configure backend-only `GROQ_API_KEY`, reviewed data controls, bounded usage and staging AI switches; apply the existing consent/usage migration through the normal process. Follow [VOICE_AGENT_SETUP.md](VOICE_AGENT_SETUP.md). A key alone does not enable the feature.
4. Resolve Alba rights/provenance, provision and validate the separate worker, model/config checksums and internal service token. Speech remains unavailable until those gates pass. Iris's desktop files do not make Alba an embedded mobile voice.
5. Build a new staging preview APK and inspect its merged manifest. On actual phones test permissions, quiet/noisy speech, Indian-English item names, Bluetooth, backgrounding, cancellation, logout/account changes, playback and interrupted requests.
6. Run a private, held-out voice/intent evaluation; compare rejected valid utterances as well as incorrect accepted ones. The new quality checks may need calibration, not blind relaxation. Confirm fixed cards and spoken text agree with the dashboard.
7. Complete deployment privacy/retention and store disclosure review before public rollout. Synthetic fixtures only belong in this public repository.

Until step 4, typed/recording/interpretation testing can proceed on configured staging, but the complete **Alba-speaking** requirement is not finished. No claim of fully offline operation or zero production cost is made.
