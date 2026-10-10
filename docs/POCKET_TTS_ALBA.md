# Downloadable Alba voice inside CareKosh

Latest speech-output follow-up: 10 October 2026, on top of `d429e7b`. The original integration compiled successfully in the preview APK linked below. This follow-up addresses the reported on-phone EOS failure; its new native code needs a newly built APK and phone retesting. It changes mobile speech output only.

## What it does

CareKosh can download **Kyutai Pocket TTS with the fixed Alba English preset** and generate spoken assistant summaries on the phone. No extra Android application, hosted speech service, API key or per-answer provider fee is needed. This does not make Groq understanding offline: optional online interpretation and transcription retain their own consent and internet requirements.

This is Pocket TTS Alba, not the Piper Alba/Lyra model used by some other projects. Identical timbre is not promised. “Relaxed” changes playback speed to 0.9× while keeping pitch at 1×; it does not select a different trained emotional voice.

## User setup

1. Install a newly compiled CareKosh Android APK containing the LiteRT native integration. An older APK, Expo Go, web or iOS cannot run this voice. The app still requires Android 8/API 26; this pack is offered on 64-bit ARM/x86 devices.
2. Open **Settings → Voice setup → Spoken replies** (step 4 when online understanding is available) and choose **Download Alba voice pack**. Confirm the download; Wi-Fi is recommended. Keep CareKosh in the foreground. The preceding Listening section configures recognition, while Understanding configures optional online text interpretation; neither chooses the speaking voice.
3. The nine data files total **208,767,942 bytes**, approximately 209 MB (199 MiB). Allow at least the pack size plus 64 MB free storage for setup and additional memory during synthesis. The speech-recognition pack is a separate download.
4. Downloading selects Alba. **Read answers aloud** remains a separate user choice; **Use Alba & read answers aloud** explicitly enables both. Choose **Relaxed**, **Natural** or **Brisk** pace and press **Preview voice**. **Hear answer** can speak an answer on demand even with automatic replies off. Preparation/playback progress and **Stop voice preview** appear during preview; repeated preview taps are blocked. Check media volume and speaker/Bluetooth output when playback starts.
5. Use **Remove Alba voice pack** to reclaim storage. It does not remove inventory, orders or the microphone recognition pack. A failed download removes its partial file and can reuse already verified completed files on retry. Leaving the app or pressing Cancel stops the download.

## Data flow and safety

Validated answer → concise `speechText` → native `speakPocket` → verified preset files → LiteRT inference → 24 kHz mono PCM → Android `AudioTrack` and audio focus.

- No question, answer or recording is uploaded by the Pocket speech path. The initial download contacts Hugging Face and its approved HTTPS CDN; its ordinary connection metadata is visible to that host.
- The model catalog is fixed inside the APK, revision-pinned and SHA-256 checked. Users cannot supply a model URL or clone a voice. Model files are data, not a downloaded native executable.
- Files live in the app-private no-backup directory and contain no account data. Removing app data/uninstalling removes them; ordinary APK updates should retain them unless the catalog changes.
- This implementation uses **LiteRT Android 2.1.6**, independently of Moonshine's ONNX runtime, avoiding a second `libonnxruntime.so`. No Sherpa/eSpeak/Piper phonemizer runtime was added.
- The fused language model and vocoder try GPU compilation with CPU fallback if compilation throws an ordinary exception; the small decoder transformer runs on CPU. If a generation attempt that used GPU subsequently fails, its resources close before one all-CPU retry using the same Alba preset and text. Cancellation, deadlines and CPU-only failures do not trigger further attempts. There is no cloud or device-voice fallback.
- Inference runs serially away from the UI thread. Recognition model memory is released before synthesis. Native model/buffer resources are closed on the same worker after each utterance, including partial initialization failures. This adds compilation time to replies; performance must be measured on target phones.
- Text is limited to 640 characters and prepared chunks to **32 tokens**, without silently dropping words. The previous 50-token chunks and estimated three-tokens-per-second frame cutoff could leave insufficient room for a slower utterance. Each new chunk may use at most 256 audio frames (20.48 seconds), also bounded by remaining KV space, and must reach EOS plus its tail. A reply has a 90-second PCM cap and a 180-second native operation deadline shared by generation, a possible CPU retry and playback. Malformed, non-finite or entirely silent output is rejected. Speech begins after full synthesis, not incrementally while generating.
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
- `PocketRecovery.kt`: bounded generation-window checks and one cancellable GPU-to-CPU retry.
- `PocketPlayback.kt`: foreground audio focus, cancellation and PCM playback.
- `CareKoshVoiceModule.kt`: serial worker and Expo native API.
- `modules/carekosh-voice/android/src/main/assets/pocket-alba-manifest.json`: exact file sizes/checksums; model weights are not committed.

## Verification and release gate

### Reported silent replies / EOS failure — 10 October 2026

Phone feedback reports **“Alba could not finish this sentence. Try a shorter reply.”** This comes from generation before `AudioTrack` playback, so microphone permissions or a Render redeploy cannot fix that specific failure. The exact device-side cause (early estimated cutoff versus GPU behavior) is not proven without a device trace. The follow-up removes the heuristic as a hard cutoff, leaves the real KV/decoder/time bounds in place, reduces lossless chunks to 32 tokens and adds the local CPU recovery above. The microphone, Groq query routing, backend and model catalog are unchanged.

Settings now distinguish a downloaded voice from enabled automatic narration and show checking, loading, generating, CPU recovery and playback stages. Muted media volume produces an explicit message. A new progress-capable native method retains the older two-argument method for compatibility; event IDs prevent an old utterance's progress from updating a new one.

Local validation: **248 mobile tests**, TypeScript, lint (zero errors, one existing builder warning), all voice-module Kotlin sources compiled with 2.2.20 against the actual Android/Moonshine/LiteRT API jars and Expo bridge stubs, 113 SentencePiece reference cases and lossless 32-token chunk tests. JVM recovery checks exercise late EOS, KV/decoder bounds, GPU failure followed by one CPU attempt, cancellation, CPU failure and silent/non-finite audio. A fixture using the exact assets produced finite non-silent stock-summary PCM on the Mac CPU. These checks do not establish Android speaker output or GPU behavior; a new APK and OnePlus preview/answer/second-question tests remain required.

To run the new pure JVM recovery checks, compile `PocketRecovery.kt` with `scripts/check-pocket-recovery.kt` using Kotlin 2.2.20 and run its main class. The tokenizer check below now uses the shared **32-token** limit.

### Android build compatibility — 10 October 2026

The first EAS preview build of `7bd4d44` failed at `:carekosh-voice:compileReleaseKotlin`. LiteRT 2.1.6's API carries Kotlin **2.3.0 metadata**; Expo SDK 54's default Kotlin **2.1.20** can only read metadata through 2.2. The earlier host check used a newer compiler and did not catch this mismatch. The EAS CLI update and remote-version-code notices were separate from this compiler failure.

The first fix (`f928abc`) set **Kotlin 2.2.20** through `expo-build-properties`, but its EAS retry still failed. The generated root Gradle file had an **unversioned Kotlin Gradle plugin classpath**, which inherited React Native 0.81's compiler **2.1.20**. The root log reported 2.2.20 for the configured standard library/KSP while the actual compiler remained older. A successful standalone compiler check did not prove the complete Gradle dependency selection.

`plugins/withKotlinCompiler.js` now pins the **actual root Kotlin Gradle plugin classpath to 2.2.20**, using the same version as `expo-build-properties`. A clean Expo prebuild generates `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.20')` and `android.kotlinVersion=2.2.20`; the installed Expo plugin selects **KSP 2.2.20-2.0.3**. The config plugin fails explicitly if the Gradle template changes or contains an ambiguous classpath. LiteRT, Moonshine, minimum SDK 26, microphone permission, environment URL guards and voice application code are unchanged. See [Expo's Kotlin setting](https://docs.expo.dev/versions/v54.0.0/sdk/build-properties/#pluginconfigtypeandroid), [the Expo compiler/classpath issue](https://github.com/expo/expo/issues/49668) and [Kotlin metadata compatibility](https://github.com/JetBrains/kotlin/blob/master/libraries/kotlinx-metadata/jvm/ReadMe.md).

Verification reproduced the metadata failure using compiler 2.1.20, then compiled all voice-module Kotlin sources successfully with **2.2.20**, actual Android/Moonshine/LiteRT jars and Expo bridge stubs, without disabling metadata checks. All **243 mobile tests** pass, including the compiler pin's compatibility and template guards; TypeScript passes and lint has zero errors with the existing builder warning. Clean Expo prebuild confirms native voice autolinking and the retained microphone permission.

The **complete EAS preview APK build of `ec9d209` succeeded** on 10 October 2026: `:carekosh-voice:compileReleaseKotlin`, Android release lint, signing validation, packaging and `:app:assembleRelease` passed; Gradle reported **BUILD SUCCESSFUL in 18m 11s**. [Verified preview build and install link](https://expo.dev/accounts/rishabhrd09/projects/vitaltrack-mobile/builds/3127659d-cfb3-49fe-8c4b-420742a0ba5e).

Inspection of that actual APK confirms minimum SDK **26**, target SDK **36**, `RECORD_AUDIO`, the native voice classes, ARM64 Moonshine/LiteRT libraries, the unchanged Alba manifest and all six licence assets. The packaged third-party notice matches the original notice after AAPT expands its gzip asset. No system-overlay permission or foreground audio services are present. All **50 packaged ARM64/x86-64 libraries** pass both ELF load-segment and uncompressed APK ZIP **16 KB alignment** checks. The embedded JavaScript bundle contains the HTTPS staging API URL. APK SHA-256: `ce99af9f72a20fe922b5379bb2154c41c80a3e6fa850ea13621579b702f080f8`. These results establish build/package compatibility; actual recording, Alba playback, cancellation and performance still require phone testing.

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

Before calling this release-ready, install the verified preview APK and test on the OnePlus Nord 4/OxygenOS 15 and another target phone:

1. Download, cancel, retry, remove, reinstall the pack and export the licence ZIP.
2. In airplane mode, preview Alba at each pace and use **Hear answer** with a current-session inventory snapshot. No speech endpoint should be called.
3. Check names, quantities, units, long summary, volume, first-reply delay, repeated replies, temperature and memory use. Test a Bluetooth/headset output too.
4. Stop during generation and playback; start another microphone query; background/logout/change account; interrupt with another app's audio. No late speech or frozen UI should remain.
5. Keep the model unavailable/removed and verify the answer stays visible with a useful message. Device speech must work only when explicitly selected.
6. Repeat manifest, native-library alignment and notice checks for each release artifact. These package checks passed for the preview APK above; they do not replace the device checks.

No backend migration, new environment variable, Render deployment or database operation is needed for this speech-output feature.
