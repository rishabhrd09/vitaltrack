# Optional Kokoro audition worker

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
