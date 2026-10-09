# Private Alba speech worker

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](../docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

> **Status (7 October 2026):** code only. This worker is not referenced by `render.yaml` or CI, and its deployment is NOT VERIFIED (the text below says it is not deployed). The current mobile build never requests cloud speech (`CLOUD_VOICE_ENABLED = false`); spoken replies use an installed offline Android voice. The backend's `/api/v1/ai/speak` stays off unless its speech and rights flags are set. Limits below match `app.py` (640 characters, 4,000,000-byte audio cap, one Uvicorn worker) and `requirements.txt` (`piper-tts==1.8.0`). See [docs/VOICE_AGENT_SETUP.md](../docs/VOICE_AGENT_SETUP.md).

**Not deployed. No model weights or licensing clearance are included.** Do not expose Iris's desktop/Pi server. This worker returns WAV audio to the app, not server speakers.

| Private environment variable | Meaning |
|---|---|
| ALBA_RIGHTS_APPROVED | Literal true only after rights review |
| ALBA_MODEL_PATH | Absolute mounted path ending en_GB-alba-medium.onnx |
| ALBA_MODEL_SHA256 | Independently verified model checksum |
| ALBA_CONFIG_SHA256 | Checksum of adjacent en_GB-alba-medium.onnx.json |
| PIPER_SERVICE_TOKEN | Random internal secret, at least 32 characters |

Run the provided container with model/configuration mounted read-only, one Uvicorn worker, private networking/HTTPS ingress, and CPU/memory limits established by load testing. Never bake secrets or weights into the image. Backend PIPER_SERVICE_URL points to this service and uses the same token. No provider subscription is needed.

Startup verifies both files and loads Piper in a separate kept-loaded process. Only one synthesis runs; excess calls return busy. Text is limited to 640 characters and audio to 4 MB. A failed/timed-out process is terminated and readiness fails; the deployment supervisor must restart the service. No alternate voice is used.

Targets the published PiperVoice.load / synthesize_wav API; runtime pinned to piper-tts 1.8.0. Statically checked only: no Alba model was loaded or deployed in this task. Validate the pinned runtime/model together on the target architecture.

Review GPL runtime obligations, Alba corpus attribution and pretrained-model provenance separately. Possessing the files is not proof of redistribution/commercial rights. Keep both backend speech switches off until cleared.

GET /health reports readiness. POST /synthesize accepts an authenticated JSON text field and returns WAV. Keep proxy/APM request-body logging off. Normal speech failures return no audio, never a replacement voice.
