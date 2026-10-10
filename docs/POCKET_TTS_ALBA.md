# Downloadable Alba voice inside CareKosh

Local source implementation, 10 October 2026, on top of `078d53c`. This addition changes mobile speech output only. It has not been committed, deployed or verified in a release APK by this implementation review.

## What it does

CareKosh can download **Kyutai Pocket TTS with the fixed Alba English preset** and generate spoken assistant summaries on the phone. No extra Android application, hosted speech service, API key or per-answer provider fee is needed. This does not make Groq understanding offline: optional online interpretation and transcription retain their own consent and internet requirements.

This is Pocket TTS Alba, not the Piper Alba/Lyra model used by some other projects. Identical timbre is not promised. “Relaxed” changes playback speed to 0.9× while keeping pitch at 1×; it does not select a different trained emotional voice.

## User setup

1. Install a newly compiled CareKosh Android APK containing the LiteRT native integration. An older APK, Expo Go, web or iOS cannot run this voice. The app still requires Android 8/API 26; this pack is offered on 64-bit ARM/x86 devices.
2. Open **Settings → Voice setup → Spoken replies** (step 4 when online understanding is available) and choose **Download Alba voice pack**. Confirm the download; Wi-Fi is recommended. Keep CareKosh in the foreground. The preceding Listening section configures recognition, while Understanding configures optional online text interpretation; neither chooses the speaking voice.
3. The nine data files total **208,767,942 bytes**, approximately 209 MB (199 MiB). Allow at least the pack size plus 64 MB free storage for setup and additional memory during synthesis. The speech-recognition pack is a separate download.
4. Downloading selects Alba. **Read answers aloud** remains a separate user choice. Choose **Relaxed**, **Natural** or **Brisk** pace and press **Preview voice**. **Hear answer** can speak an answer on demand.
5. Use **Remove Alba voice pack** to reclaim storage. It does not remove inventory, orders or the microphone recognition pack. A failed download removes its partial file and can reuse already verified completed files on retry. Leaving the app or pressing Cancel stops the download.

## Data flow and safety

Validated answer → concise `speechText` → native `speakPocket` → verified preset files → LiteRT inference → 24 kHz mono PCM → Android `AudioTrack` and audio focus.

- No question, answer or recording is uploaded by the Pocket speech path. The initial download contacts Hugging Face and its approved HTTPS CDN; its ordinary connection metadata is visible to that host.
- The model catalog is fixed inside the APK, revision-pinned and SHA-256 checked. Users cannot supply a model URL or clone a voice. Model files are data, not a downloaded native executable.
- Files live in the app-private no-backup directory and contain no account data. Removing app data/uninstalling removes them; ordinary APK updates should retain them unless the catalog changes.
- This implementation uses **LiteRT Android 2.1.6**, independently of Moonshine's ONNX runtime, avoiding a second `libonnxruntime.so`. No Sherpa/eSpeak/Piper phonemizer runtime was added.
- The fused language model and vocoder try GPU compilation with CPU fallback if compilation throws an ordinary exception; the small decoder transformer runs on CPU. GPU inference errors remain visible failures; there is no silent cloud or device-voice fallback.
- Inference runs serially away from the UI thread. Recognition model memory is released before synthesis. Native model/buffer resources are closed on the same worker after each utterance, including partial initialization failures. This adds compilation time to replies; performance must be measured on target phones.
- Text is limited to 640 characters and prepared chunks to 50 tokens, without silently dropping words. Generation/PCM/playback have finite bounds and malformed/non-finite output is rejected. Speech begins after full synthesis, not incrementally while generating.
- Cancel, another question, leaving the screen, backgrounding, logout or changing accounts invalidates speech. An in-flight native invocation may finish before resources close; stale results cannot start playback. Audio-focus loss stops playback.
- Synthesis failure keeps the factual answer visible. Neither this voice nor Groq interpretation gains inventory/order-save authority. Touch confirmation remains required to save an order.
- Device speech remains a selectable fallback controlled by the user. Withdrawing cloud consent preserves the selected offline Alba voice.

## Models, attribution and notices

| Component | Pinned source / licence |
|---|---|
| Original model and fixed Alba MacKenna preset | [Kyutai non-cloning model](https://huggingface.co/kyutai/pocket-tts-without-voice-cloning), [Alba source recordings](https://huggingface.co/kyutai/tts-voices#alba-mackenna); CC BY 4.0 |
| LiteRT conversion and preset repacking | [Pocket-TTS-LiteRT](https://huggingface.co/mlboydaisuke/Pocket-TTS-LiteRT), revision `e0e68d4fb79feb529d7d0f8d0bbfad8d15a18a1e`; CC BY 4.0 |
| Original Pocket TTS code | [Kyutai Pocket TTS](https://github.com/kyutai-labs/pocket-tts); MIT |
| Adapted Android host/tokenizer example | [LiteRT-Models/pockettts](https://github.com/john-rocky/LiteRT-Models/tree/310464b5988f59c03de9283c3d7451e51d9f0260/pockettts); MIT, Daisuke Majima |
| Android inference runtime | [Google LiteRT](https://developers.google.com/edge/litert/android), `2.1.6`; Apache 2.0 and SDK third-party notices |

Voice setup shows attribution and offers **Export complete Alba licence notices**. Full MIT, CC BY 4.0, Apache 2.0 and complete SDK third-party notices are bundled under `modules/carekosh-voice/android/src/main/assets/pocket-licences`. The SDK notice is compressed in the APK and expanded in the exported ZIP. Notices identify upstream changes and do not imply creator endorsement. The full SDK notice also covers build tooling; listing a tool does not establish that it is linked into the app. Review the final packaged dependency inventory before public distribution.

## Source map

Under `vitaltrack-mobile/`:

- `features/assistant/offlineVoice.ts`: optional bridge; older APKs retain existing device speech.
- `features/assistant/preferences.ts`: account-scoped provider/pace, no automatic opt-in.
- `components/assistant/VoiceSetup.tsx`: download, readiness, provider, pace, preview and notices.
- `components/assistant/AssistantExperience.tsx`: setup/session cancellation and factual-answer playback.
- `modules/carekosh-voice/android/src/main/java/expo/modules/carekoshvoice/PocketPack.kt`: fixed catalog, storage, redirects, checksums and deletion.
- `PocketTokenizer.kt`, `PocketText.kt`: tokenization, normalization and bounded sentence chunks.
- `PocketSynthesizer.kt`: preset-only LiteRT model orchestration.
- `PocketPlayback.kt`: foreground audio focus, cancellation and PCM playback.
- `CareKoshVoiceModule.kt`: serial worker and Expo native API.
- `modules/carekosh-voice/android/src/main/assets/pocket-alba-manifest.json`: exact file sizes/checksums; model weights are not committed.

## Verification and release gate

The subsequent 10 October settings/mixed-draft review passes **240 mobile tests** and **275 backend tests** in both disposable schema modes. It reorganizes the settings UI and updates local draft parsing/the backend interpretation prompt; it does not change Pocket's native synthesis or playback. The original native/asset checks below retain their tested scope. See [the follow-up and device checks](VOICE_INVENTORY_AND_ORDER_DRAFTS.md#settings-and-mixed-draft-verification--10-october-2026).

All **231 mobile tests** pass, including setup/provider choices, cancelled downloads, cloud-consent withdrawal, playback failure and Hear answer without a device voice, with native modules mocked. TypeScript and Android JavaScript export pass; lint has no errors and one pre-existing builder hook warning. Documentation checks find zero problems in 110 files and in all four system-design HTML pages/35 inlined figures. These are local checks, not device certification. JVM tests compare the real Kotlin tokenizer with 113 original SentencePiece reference cases and check lossless bounded chunking. The exact downloaded assets were size/SHA-256 verified. A Mac CPU fixture using those models produced finite, non-silent Alba PCM with EOS termination. This verifies the asset bundle and host inference, **not Android audio quality or performance**. Native sources compile against the actual LiteRT/Android API jars with Expo bridge stubs; this is not a full Gradle release build. Added ARM64/x86-64 native libraries have 16 KB ELF load-segment alignment; final APK ZIP alignment still requires inspection.

For the JVM check, with `kotlinc` available and the verified tokenizer downloaded outside Git:

```bash
cd vitaltrack-mobile
kotlinc modules/carekosh-voice/android/src/main/java/expo/modules/carekoshvoice/PocketTokenizer.kt \
  modules/carekosh-voice/android/src/main/java/expo/modules/carekoshvoice/PocketText.kt \
  scripts/check-pocket-text.kt -include-runtime -d /tmp/carekosh-pocket-text-check.jar
java -jar /tmp/carekosh-pocket-text-check.jar /absolute/path/to/pt_tokenizer.tsv \
  tests/fixtures/pocket-tokenizer-cases.tsv
```

Before calling this release-ready, build the new APK and test on the OnePlus Nord 4/OxygenOS 15 and another target phone:

1. Download, cancel, retry, remove, reinstall the pack and export the licence ZIP.
2. In airplane mode, preview Alba at each pace and use **Hear answer** with a current-session inventory snapshot. No speech endpoint should be called.
3. Check names, quantities, units, long summary, volume, first-reply delay, repeated replies, temperature and memory use. Test a Bluetooth/headset output too.
4. Stop during generation and playback; start another microphone query; background/logout/change account; interrupt with another app's audio. No late speech or frozen UI should remain.
5. Keep the model unavailable/removed and verify the answer stays visible with a useful message. Device speech must work only when explicitly selected.
6. Inspect the release manifest for no background microphone/system-overlay permission and no unused foreground-service permissions; inspect packaged native libraries and notices.

No backend migration, new environment variable, Render deployment or database operation is needed for this speech-output feature.
