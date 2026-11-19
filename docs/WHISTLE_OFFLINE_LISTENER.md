# Whistle — experimental offline listener

**Status — 24 October 2026.** Whistle is an optional, experimental speech-to-text listener in the regular `preview` APK and the `preview-voice-diagnostics` APK. Moonshine remains the default. Production does not offer Whistle. The regular preview exposes Whistle independently; Alba, Kokoro and their diagnostics panel remain paused there. Phone acceptance is still required.

Whistle transcribes a finished recording. It does not read answers aloud, interpret inventory requests, or save orders. Sarvam, device speech, Alba and Kokoro keep their separate narration settings.

## 1. Where it fits

| Stage | Responsibility |
|---|---|
| Capture | Existing Android microphone permission and bounded capture; 16 kHz mono PCM16, at most 28 seconds. |
| Whistle listening | Convert the completed recording to a reviewed English transcript on this phone. No Moonshine model is required for this choice. |
| Review | Edit the transcript and tap Send. Recording or transcription alone never executes a request. |
| Understanding | Existing local parser, or separately consented Groq interpretation when needed. |
| Results | Existing validated inventory selection, tables and unsaved order drafts. Only touch confirmation saves an order. |
| Narration | Independently selected device voice, Sarvam, or the existing experimental offline voices. |

The initial integration does not provide Whistle live captions. Moonshine retains its existing live captions. Whistle is a separate saved preference; missing files or a failed transcription produce a clear error, without switching to Groq or another listener.

Whistle's stock model supports English, German, French, Spanish, Italian, Dutch and Polish. CareKosh forces **English** for this experiment. Hindi and Hinglish are not supported or promised. Indian English, product names, quantities and negation still need testing.

## 2. Install and select

1. Build and install the regular `preview` APK on an ARM64 Android phone; Expo Go cannot load the native adapter. The existing diagnostic profile also includes Whistle.
2. Open Voice setup and enable the assistant and microphone as usual.
3. Under **Listening**, download the Whistle pack, then explicitly select Whistle. Downloading does not grant cloud consent or change the understanding or narration provider.
4. Record, stop, wait for the transcript, review it and tap Send.
5. To compare the existing listener, explicitly select Moonshine. Its recognition pack and voice settings are retained.

The model download is about 16.9 MB. That is model data, not total APK size, peak RAM or a promised performance figure. Native executable code is linked into the APK at build time; the phone downloads only pinned model data. Removing Whistle removes its pack, not Moonshine, inventory, orders or narration packs.

## 3. Native runtime and privacy

CareKosh calls the Cactus C API directly through a JNI adapter. It does not embed the Python package, its automatic fetching code, its telemetry wrapper, Needle's text agent, or an automatic tool executor.

Before the native library loads, the adapter sets `NEEDLE_TELEMETRY=0` and `DO_NOT_TRACK=1`. Failure to apply the controls blocks Whistle. Symbol and string inspection of the pinned Android static archive found no networking or telemetry imports. This is inspection of the distributed artifact, not an audit of all upstream C++ source or proof from a phone packet capture. Verify airplane-mode operation on the target phone.

Build configuration gates the native adapter as well as the settings UI. Preview APKs include the adapter; production builds cannot invoke it through a native method. Updating only JavaScript cannot enable an APK built without the native Whistle flag.

### Pinned artifacts

| Artifact | Immutable upstream revision | Size / SHA-256 |
|---|---|---|
| Whistle model (`whistle.cact`) | `741118687e1f008f06d1351a402a731274789790` | 16,919,407 bytes; `b6e02f048568ac5d01a2042556c658061e699acbc0aa2a1439f52f3d461dffeb` |
| Android ARM64 runtime (`libneedle.a`) | `d6c7d6a2e9655505e0f8e23339356dd1705900eb` | 2,177,676 bytes; `7aa6de6132a22bf45f5e903425feb66f159ad46f47fa558921bc4fd02c3a2fa0` |
| C API header (`needle.h`) | Same runtime revision | 4,528 bytes; `a27dac4b3239eead91d124b7f7dbce5495c13019903fd817b68c16d39b055a99` |

`WhistlePack.kt` pins model data; `modules/carekosh-voice/android/build.gradle` pins the build-time runtime and header. A checksum mismatch blocks installation or the build. Do not replace those values with a floating `main` URL.

### Model integrity and lifecycle

- Pin both model data and build-time runtime files to immutable revisions and SHA-256 checksums.
- Keep the model in app-private, non-backup storage. Validate it before a fresh engine load.
- Reuse resumable, bounded downloads with explicit cancellation and generation checks. Removal cannot be undone by a late download completion.
- Accept only the app's temporary, bounded microphone recording. Do not accept arbitrary URLs or paths into transcription.
- Serialize Whistle calls on its own worker lane. A slow Whistle call must not occupy Moonshine's recording or inference lane.
- Discard cancelled or stale results. The reviewed transcript is scoped to the current assistant session.

The upstream C API has **no cancellation or unload function**. The native watchdog stops the UI wait after 45 seconds; JavaScript also has a 60-second backstop. Both suppress late results and neither can interrupt the running native call. Do not start another native call while the first is still active. Loaded runtime/model memory may remain until Android ends the process. Removing the downloaded pack does not promise immediate memory release.

The model and engine are distributed under Apache 2.0. The private static C++ runtime also carries LLVM and Android sysroot notices. These are bundled with the app and included in Voice setup → Offline speech licence → Export complete offline voice notices. Only model data is downloaded after installation; runtime code is not downloaded or executed from writable app storage.

## 4. Configuration and builds

No Render variable, database migration, Sarvam key, or paid Cactus account is required for this listener. Existing Groq/Sarvam configuration remains relevant only to those independently selected services.

The regular preview explicitly sets `EXPO_PUBLIC_WHISTLE_LISTENING=1` and uses the HTTPS staging API. This flag enables only Whistle. JavaScript and native Gradle use the same gate: this flag or the existing diagnostics flag must equal `1`. App config and native Gradle reject Whistle in production and require the exact HTTPS staging API when it is enabled.

| EAS profile | Whistle listener | Alba / Kokoro / diagnostics panel |
|---|---|---|
| `development` | Off by default | Off by default |
| `preview` | Experimental, explicitly selectable | Paused / hidden |
| `preview-voice-diagnostics` | Experimental, explicitly selectable | Available for investigation |
| `production` | Disabled; experimental flags rejected | Paused / hidden |

The diagnostic profile remains for offline narration investigations. You do not need it to test Whistle. Keep these public build flags in the EAS profiles; do not add them as shared production environment variables.

From the repository root:

```bash
cd vitaltrack-mobile
eas build --profile preview --platform android --clear-cache
```

A new native APK is required. This document does not start a build or deployment. Build-time retrieval of the pinned Android runtime requires internet; the subsequent installed listener does not require it once its pack is ready.

## 5. Phone acceptance

Use the OnePlus Nord 4 before considering wider availability:

1. Select Whistle, download its pack and transcribe a simple English request with internet disabled. Review and Send only when ready. Restore internet for Sarvam or Groq tests.
2. Test quantities and exclusions: “Show items with quantity less than three” and “Show low-stock items excluding gloves.” Check the words before assessing the resulting action.
3. Test actual item names, short and long requests, Indian English, silence and background noise. Do not treat an empty or incorrect transcript as an action.
4. Cancel recording and cancel transcription. Start another question; confirm that an earlier result cannot replace its text.
5. Test permission denial, backgrounding, logout, pack removal and interrupted/resumed downloads.
6. Switch explicitly to Moonshine. Verify its live captions, final transcript and second question. Test Sarvam preview and narration separately.
7. Compare cold/warm transcription time, memory, battery and accuracy on the same recordings. Vendor timings on an Apple M4 Pro are not Nord 4 measurements.

If it fails, share the APK build ID, selected listener, exact error/status and elapsed time, whether the pack was ready, whether internet was disabled, and whether Moonshine still works. Share only synthetic example text; do not include keys or private recordings.

## 6. Verification and remaining limits

The 24 October follow-up changes availability gates and Whistle-only wording. Capture, model validation, inference, telemetry controls, Sarvam and the understanding executor remain unchanged. Fresh verification results for this follow-up are recorded below after the historical implementation checks.

Implementation checks on 23 October 2026 (the original diagnostic-only gate):

| Check | Result |
|---|---|
| Mobile tests | 409 passed, including diagnostic selection, no-Moonshine capture, transcript review, cancellation, second question and independent Sarvam narration. |
| TypeScript / ESLint | TypeScript clean; lint has zero errors and the existing builder warning. |
| Android JavaScript exports | Normal and diagnostic exports passed with fresh Metro caches. Normal flags are false; diagnostic flags are true. Production rejects diagnostics. |
| Backend tests, Python 3.12 / disposable PostgreSQL 16 | 644 passed with model-created schemas and 644 passed through Alembic migrations. No backend code changed. |
| Backend lint / route gate | Ruff clean; 47 API route objects. |
| Native Kotlin | Full module compiled against Android, LiteRT and Moonshine jars with Expo/BuildConfig test stubs. Existing deprecation warnings remain; this is not a Gradle APK build. |
| Native regression harnesses | Existing Pocket recovery and model-pack checks passed; four new Whistle groups cover strict result parsing, corruption, worker independence and cancelled publication. |
| Android JNI | Official NDK r27b cross-link for ARM64/API 26 passed. ELF LOAD alignment and RELRO support 16 KB pages; only JNI is exported, with no shared C++ runtime dependency. APK ZIP alignment is not tested by this check. |
| Actual model on host | The pinned model and same-revision Mac runtime transcribed a public speech fixture twice, and returned empty transcripts for two silent inputs. These are host results, not Android accuracy or latency measurements. |
| Documentation | Strict current-guide check passes. Two pre-existing interview-fragment anchor warnings are outside current guides and were preserved. |

### Regular preview verification — 24 October 2026

| Check | Result |
|---|---|
| Mobile tests | 416 passed after the final guard change. Regular preview coverage includes explicit Whistle selection, saved preference reload, transcription without a Moonshine pack, two reviewed questions and independent Sarvam narration. |
| TypeScript / ESLint | TypeScript clean; lint has zero errors and one existing warning in `app/builder.tsx`. |
| Build gates | Preview enables Whistle alone; diagnostics retain the old gate; production enables neither. App config and native Gradle reject experimental production flags and require HTTPS staging for enabled Whistle. Tests cover missing profiles, empty flags and invalid endpoints. |
| Android JavaScript exports | Fresh preview, diagnostic and production Hermes exports passed. Exported policy gates were inspected separately from the config guard tests. No full Gradle APK build was run. |
| Native checks | Full Kotlin compilation plus Whistle, Pocket recovery and Moonshine pack JVM checks passed. CMake regenerated and built the ARM64 JNI target using the pinned NDK/runtime. The five Kotlin changes are unsupported-build labels; capture and inference are unchanged. |
| Documentation | Strict current-guide check: 39 files, zero problems. The full scan retains the two existing interview-fragment anchor warnings outside current guides. |

No backend source, database schema, cloud consent or Sarvam configuration changes are needed for this follow-up. No paid API request or deployment was made. The OnePlus acceptance checks in section 5 remain required before treating Whistle as a validated replacement for Moonshine.

The new JVM regression can be rerun from `vitaltrack-mobile` with Kotlin 2.2.20 and an Android-all jar (the check used `org.robolectric:android-all:14-robolectric-10818077`). It uses synthetic model bytes and makes no real download:

```bash
K=modules/carekosh-voice/android/src/main/java/expo/modules/carekoshvoice
kotlinc -cp "$ANDROID_ALL_JAR" \
  "$K/WhistlePack.kt" "$K/WhistleResult.kt" "$K/PackDownload.kt" "$K/VoiceErrors.kt" \
  scripts/check-whistle-pack.kt -include-runtime -d /tmp/carekosh-whistle-check.jar
java -cp "/tmp/carekosh-whistle-check.jar:$ANDROID_ALL_JAR" \
  expo.modules.carekoshvoice.Check_whistle_packKt
```

Host transcription, JNI cross-linking and JavaScript exports do not prove physical microphone quality, audible narration, packaged APK compatibility or privacy on the installed phone. Those remain device acceptance checks. No production enablement is implied.

## Official references

- [Whistle model and language support](https://huggingface.co/Cactus-Compute/whistle)
- [Whistle usage and streaming behavior](https://cactuscompute.com/blog/whistle-best-practices)
- [Android ARM64 engine and C API](https://huggingface.co/Cactus-Compute/needle3/tree/main/android-arm64)
- [Cactus runtime configuration](https://github.com/cactus-compute/needle#deploy)
- [Whistle model licence](https://huggingface.co/Cactus-Compute/whistle/raw/main/LICENSE)
- [Engine licence](https://huggingface.co/Cactus-Compute/needle3/raw/main/LICENSE)

Related: [complete assistant flow](VOICE_INVENTORY_AND_ORDER_DRAFTS.md), [Sarvam narration](SARVAM_ENGLISH_VOICE.md), [Alba and Kokoro investigation](POCKET_TTS_ALBA.md).
