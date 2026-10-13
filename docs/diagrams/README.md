# CareKosh documentation diagrams

> **AI voice source update — 11 October 2026:** Android AudioRecord and Moonshine live words/offline recognition, separately opted-in Groq Whisper final transcription, reviewed Send and local/Groq bounded interpretation retain their existing wiring. Answers and unsaved drafts use validated inventory facts; only touch confirmation saves an order. Device speech stays the default. Alba selection/new downloads are paused after failed OnePlus acceptance; code and notices remain. Optional Sarvam English narration now uses separate answer-text consent, a backend-only key, fixed model/voice validation and per-reply Expo playback. Sarvam does not process microphone recordings in this path or select inventory actions. Matching staging deployment, provider credits and a new APK/phone sound test remain pending. Earlier dated evidence retains its original scope. [Sarvam activation, costs and device checks](../SARVAM_ENGLISH_VOICE.md) · [Complete voice architecture](../VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

These SVG files illustrate behaviour that was checked against the code on **7 October 2026** (branch `feature/backend-hardening-ai-voice-agent-foundation`, commit `03cfebb`). A diagram is a teaching aid. It is not evidence by itself; the evidence is listed in the audit's verification record (local review reference; not published).

**Rechecked 8 October 2026:** request ordering, commit/rollback scope, partial order-key
uniqueness, voice branches, cache failure timing and conditional deployment triggers were
corrected in the generator and regenerated SVGs. See the
[extended technical review](../../carekosh_system_design/TECHNICAL_REVIEW.md#final-recheck-of-the-eight-recommended-guides).
The 7 October application test counts remain historical evidence.

**Local feature follow-up — 8 October 2026:** voice/system diagrams now show richer inventory answers, unsaved drafts and the separate touch-only order-save boundary. See [the current implementation guide](../VOICE_INVENTORY_AND_ORDER_DRAFTS.md). Device/provider acceptance remains pending.

**13 October voice refresh:** `voice-flow.svg` now shows the phone grammar, the contract 3 plan with server checks, and the deterministic executor. The new `voice-plan.svg` explains how a multi-part request becomes rows. See the [end-to-end review](../AI_VOICE_END_TO_END_REVIEW.md).

**9 October voice refresh:** the system and voice diagrams now include AudioRecord PCM16/16 kHz WAV capture, provisional local Moonshine words, separate Whisper audio consent, GPT-OSS v2 text interpretation, device speech and reviewed local drafts. They are embedded in the maintained AI voice guide and the broader developer/system pages.

## Generated diagrams (edit the source, then regenerate)

| File | Shows | Source function |
|---|---|---|
| [system-context.svg](system-context.svg) | Phone, API, database and optional services; no core queue/cache server. Optional Kokoro/Piper workers remain unselected; Sarvam narration is a separate consented API path and Alba is paused. | `system_context()` |
| [request-lifecycle.svg](request-lifecycle.svg) | One successful API-only stock PATCH from a test client to PostgreSQL and back; current UI uses PUT | `request_lifecycle()` |
| [request-rollback.svg](request-rollback.svg) | Validation error, ownership 404, and a rolled-back order apply | `request_rollback()` |
| [database-erd.svg](database-erd.svg) | The 11 application tables at migration head `0010`, keys and cascades | `database_erd()` |
| [inventory-concurrency.svg](inventory-concurrency.svg) | Two API clients saving the same item version through the API-only `PATCH …/stock` used by the reproduction; the version compare-and-swap (the app's Edit Item uses `PUT`, which first takes a per-account name lock) | `inventory_concurrency()` |
| [order-idempotency.svg](order-idempotency.svg) | Order submission keys (`localId`), retries and order numbers | `order_idempotency()` |
| [order-status.svg](order-status.svg) | Order status machine and the apply-to-stock transaction | `order_status()` |
| [voice-flow.svg](voice-flow.svg) | AudioRecord/live words → offline or consented online final transcript → reviewed Send → bounded query/local draft → separate touch-confirmed order save | `voice_flow()` |
| [voice-plan.svg](voice-plan.svg) | 13 Oct 2026: contract 3, from a request to a validated plan, then deterministic rows (AND within a group, union, exclusions, sort), plus the four separate parts of Voice setup | `voice_plan()` |
| [auth-session.svg](auth-session.svg) | Login, token refresh rotation, logout and password change | `auth_session()` |
| [mobile-cache.svg](mobile-cache.svg) | TanStack Query cache versus the server as the source of truth | `mobile_cache()` |
| [release-pipeline.svg](release-pipeline.svg) | CI → staging → production backend → Play Store | `release_pipeline()` |
| [release-gate-0007-0010.svg](release-gate-0007-0010.svg) | The release gate for migrations 0007–0010 | `release_gate()` |

Regenerate all of them (Python 3.10+, standard library only):

```bash
python3 docs/diagrams/src/build_diagrams.py
```

Regenerate one: `python3 docs/diagrams/src/build_diagrams.py voice-flow.svg`.

After regenerating, open the SVG in a browser and look at it at full size and at phone width before committing. The documentation pages place each diagram in a horizontally scrollable frame (minimum width 680 px) so it stays legible on phones.

## Style rules

- Real `<text>` elements, a `<title>` and a `<desc>` in every file (screen readers announce the description).
- 14–18 px text at 1:1 scale; white background so diagrams read the same in dark mode and print.
- Colour shows the component's role, and the border style repeats it, so colour is never the only signal:
  blue = core (required), green = supporting infrastructure, amber = current provider (swappable),
  dashed purple = conditional / opt-in, grey = people, devices and outside systems, red = errors, refusals and rollback.
- One idea per diagram. If a label needs a paragraph, put the paragraph in the guide instead.

## Older hand-drawn diagrams (kept)

| File | Status on 7 Oct 2026 |
|---|---|
| [code-to-phone.svg](code-to-phone.svg) | Still accurate as an overview; it does not show the voice assistant. |
| [eas-preview-build.svg](eas-preview-build.svg) | Accurate: CI queues an EAS preview build with `--no-wait`. |
| [local-setup.svg](local-setup.svg) | Accurate for the Docker + Expo Go flow. Voice needs a native APK, not Expo Go. |
| [release-gate.svg](release-gate.svg) | Historical (23 Sep 2026): written for `0007` alone. Use [release-gate-0007-0010.svg](release-gate-0007-0010.svg) for the current head. |
| [testing-pyramid.svg](testing-pyramid.svg) | Historical counts (8 mobile API tests). Current: 242 backend tests and 121 mobile Node tests (7 Oct 2026). |
