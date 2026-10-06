# Private Alba speech worker

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
