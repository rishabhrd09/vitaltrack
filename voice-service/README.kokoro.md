# Optional Kokoro audition worker

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](../docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

> **Status (7 October 2026):** code only, not referenced by `render.yaml` or CI; deployment NOT VERIFIED. The current mobile build does not request cloud speech (`CLOUD_VOICE_ENABLED = false`), and the backend keeps Kokoro speech off unless `AI_ENABLED`, `AI_SPEECH_ENABLED`, `AI_KOKORO_ENABLED`, `AI_KOKORO_RIGHTS_APPROVED`, `KOKORO_SERVICE_URL` and `KOKORO_SERVICE_TOKEN` are all set (`app/services/ai_guard.py`). The voice (`bf_emma`), the 640-character limit and the single worker below match `kokoro_app.py` and `Dockerfile.kokoro`; pins are in `requirements.kokoro.txt` (`kokoro-onnx==0.6.1`, `onnxruntime==1.23.2`).

This is a separate hosted CPU service, not an embedded Android voice. Default phone TTS works without it. Do not deploy it into the small inventory API instance without load/memory measurements.

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
