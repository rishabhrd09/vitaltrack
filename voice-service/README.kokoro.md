# Optional Kokoro audition worker

> **AI voice source update — 11 October 2026:** Android AudioRecord and Moonshine live words/offline recognition, separately opted-in Groq Whisper final transcription, reviewed Send and local/Groq bounded interpretation retain their existing wiring. Answers and unsaved drafts use validated inventory facts; only touch confirmation saves an order. Device speech stays the default. Alba selection/new downloads are paused after failed OnePlus acceptance; code and notices remain. Optional Sarvam English narration now uses separate answer-text consent, an explicit shared or encrypted per-account personal key, fixed model/voice validation and per-reply Expo playback. Sarvam does not process microphone recordings in this path or select inventory actions. Personal-key migration 0011 adds encrypted credentials and billing-source metadata; the current local inventory is 50 HTTP operations (47 under /api/v1) and 12 application tables. Matching staging deployment, provider credits and a new APK/phone sound test remain pending. Earlier dated evidence retains its original scope. [Sarvam activation, costs and device checks](../docs/SARVAM_ENGLISH_VOICE.md) · [Complete voice architecture](../docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

> **Status (7 October 2026):** code only, not referenced by `render.yaml` or CI; deployment NOT VERIFIED. The current mobile build does not select Kokoro (`CLOUD_VOICE_ENABLED = false`); optional Sarvam English has its own flag. The backend keeps Kokoro speech off unless `AI_ENABLED`, `AI_SPEECH_ENABLED`, `AI_KOKORO_ENABLED`, `AI_KOKORO_RIGHTS_APPROVED`, `KOKORO_SERVICE_URL` and `KOKORO_SERVICE_TOKEN` are all set (`app/services/ai_guard.py`). The voice (`bf_emma`), the 640-character limit and the single worker below match `kokoro_app.py` and `Dockerfile.kokoro`; pins are in `requirements.kokoro.txt` (`kokoro-onnx==0.6.1`, `onnxruntime==1.23.2`).

This is a separate hosted CPU service, not an embedded Android voice. Default phone TTS works without it. Do not deploy it into the small inventory API instance without load/memory measurements.

**Embedded (on-phone) Kokoro — evaluation, 13 October 2026.** This hosted worker cannot provide offline phone speech. Its pinned runtime, `kokoro-onnx`, also needs the GPL phonemizer/eSpeak stack, so it must not be copied into the APK.
- The GPL-free embedded candidate found is Kokoro-82M through the `TextToSpeech` API of the Moonshine 0.1.5 library the app already ships. It uses an MIT G2P and adds no native library. It is not implemented.
- It is **plan B**, used only if the repaired Alba fails phone acceptance. See [the evaluation](../docs/POCKET_TTS_ALBA.md#embedded-kokoro-evaluation-and-plan-b).

## Before starting

1. Review the exact Kokoro-82M checkpoint, `voices-v1.0.bin` voice assets, ONNX conversion, `kokoro-onnx` runtime and its phonemizer/eSpeak components and licence/attribution obligations. A model licence alone does not cover all dependencies.
2. Obtain the model and voice pack from the [runtime's published model-file release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1). Record exact asset provenance and SHA-256 checksums independently. Do not put binaries in the public repo/image. Mount reviewed assets read-only into the service.
3. Audition the fixed `bf_emma` English voice; this does not clone Alba. It is a candidate, not an asserted quality upgrade.

Service environment:

```dotenv
KOKORO_RIGHTS_APPROVED=false
KOKORO_MODEL_PATH=/models/kokoro-v1.0.onnx
KOKORO_VOICES_PATH=/models/voices-v1.0.bin
KOKORO_MODEL_SHA256=<reviewed model hash>
KOKORO_VOICES_SHA256=<reviewed voices hash>
KOKORO_SERVICE_TOKEN=<at least 32 random characters; backend uses the same token>
```

Set the approval flag to `true` only after review. Startup checks both hashes before loading weights. It makes no auto-download request. The runtime is pinned in `requirements.kokoro.txt`; dependency resolution should be revalidated for the actual Linux deployment platform.

Build from `voice-service/` with `docker build -f Dockerfile.kokoro -t carekosh-kokoro .`. Configure a secure private endpoint and the token on both worker and backend. The image does not contain weights or secrets. `GET /health` reports readiness only after the bounded worker starts. `POST /synthesize` requires the bearer token and `{ "text": "..." }` (maximum 640 characters).

The service is single-worker, rejects concurrent synthesis instead of making an unbounded queue, bounds input/output, and terminates failed/timed-out model processes. There is no fallback voice and no text logging in its routes. Protect deployment logs, disable reverse-proxy body logging and review crash handling too. Hosting costs, actual latency/RAM and pronunciation are release gates; none are proven by mocked adapter tests.
