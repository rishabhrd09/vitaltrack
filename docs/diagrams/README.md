# CareKosh documentation diagrams

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](../VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

These SVG files illustrate behaviour that was checked against the code on **7 October 2026** (branch `feature/backend-hardening-ai-voice-agent-foundation`, commit `03cfebb`). A diagram is a teaching aid. It is not evidence by itself; the evidence is listed in the audit's verification record (local review reference; not published).

**Rechecked 8 October 2026:** request ordering, commit/rollback scope, partial order-key
uniqueness, voice branches, cache failure timing and conditional deployment triggers were
corrected in the generator and regenerated SVGs. See the
[extended technical review](../../carekosh_system_design/TECHNICAL_REVIEW.md#final-recheck-of-the-eight-recommended-guides).
The 7 October application test counts remain historical evidence.

**Local feature follow-up — 8 October 2026:** voice/system diagrams now show richer inventory answers, unsaved drafts and the separate touch-only order-save boundary. See [the current implementation guide](../VOICE_INVENTORY_AND_ORDER_DRAFTS.md). Device/provider acceptance remains pending.

**9 October voice refresh:** the system and voice diagrams now include AudioRecord PCM16/16 kHz WAV capture, provisional local Moonshine words, separate Whisper audio consent, GPT-OSS v2 text interpretation, device speech and reviewed local drafts. They are embedded in the maintained AI voice guide and the broader developer/system pages.

## Generated diagrams (edit the source, then regenerate)

| File | Shows | Source function |
|---|---|---|
| [system-context.svg](system-context.svg) | Phone, API, database and optional services; no core queue/cache server. Optional speech-worker code exists but is not selected by this mobile build. | `system_context()` |
| [request-lifecycle.svg](request-lifecycle.svg) | One successful API-only stock PATCH from a test client to PostgreSQL and back; current UI uses PUT | `request_lifecycle()` |
| [request-rollback.svg](request-rollback.svg) | Validation error, ownership 404, and a rolled-back order apply | `request_rollback()` |
| [database-erd.svg](database-erd.svg) | The 11 application tables at migration head `0010`, keys and cascades | `database_erd()` |
| [inventory-concurrency.svg](inventory-concurrency.svg) | Two API clients saving the same item version through the API-only `PATCH …/stock` used by the reproduction; the version compare-and-swap (the app's Edit Item uses `PUT`, which first takes a per-account name lock) | `inventory_concurrency()` |
| [order-idempotency.svg](order-idempotency.svg) | Order submission keys (`localId`), retries and order numbers | `order_idempotency()` |
| [order-status.svg](order-status.svg) | Order status machine and the apply-to-stock transaction | `order_status()` |
| [voice-flow.svg](voice-flow.svg) | AudioRecord/live words → offline or consented online final transcript → reviewed Send → bounded query/local draft → separate touch-confirmed order save | `voice_flow()` |
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
