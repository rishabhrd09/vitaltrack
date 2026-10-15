# Pocket TTS / Alba — paused implementation and investigation

**Current status — 13 October 2026: PAUSED in normal builds; repaired implementation awaiting phone acceptance.**

- **Normal builds:** Alba selection and new downloads stay disabled. `ALBA_SELECTION_ENABLED` is false unless the separate test profile is used. Device voice remains the default and is audible on the owner's phone.
- **Investigation:** the [13 October investigation](#offline-voice-investigation--13-october-2026) found integration defects that can explain "stuck converting" and silent results. The optimized vocoder CPU path measured about 10 GB of memory on the desktop host. Repairs are tested there; the phone's exact failure remains unproven.
- **Unproven on the phone:** nothing yet shows the repaired voice is audible on the OnePlus Nord 4. Do not call it "fixed" or "offline-ready" until the device checks below pass.
- **Test build:** the `preview-voice-diagnostics` EAS profile shows a diagnostics panel and allows Alba for testing. Normal `preview` and `production` builds do not.
- **Optional fallback:** an offline fallback for failed Sarvam replies now exists. It is off by default; see [the Sarvam guide](SARVAM_ENGLISH_VOICE.md#optional-offline-fallback--13-october-2026).

**Update — 15 October 2026 (working tree, not yet committed).** The owner heard Alba on the phone, but it did not sound good. The changes in [Sound quality, voices and Kokoro — 15 October 2026](#sound-quality-voices-and-kokoro--15-october-2026) address that. Alba is still paused in normal builds.

- **Longer chunks:** 50 tokens instead of 32, with upstream's end-punctuation fix, trimmed joins and even loudness.
- **Pace:** changes the pauses, never the voice speed.
- **More voices:** five more commercial-use preset voices, and "Alba (updated)", Kyutai's corrected Alba state.
- **Kokoro test voice:** Kokoro-82M through Moonshine, offered only in the diagnostics build.
- **Robustness:** audio ducking, resumable downloads and memory handling.

Older dated sections below are kept as evidence. They describe earlier code, including a GPU-to-CPU retry that has since been removed.

## What it does

CareKosh can download **Kyutai Pocket TTS with the fixed Alba English preset** and generate spoken assistant summaries on the phone. No extra Android application, hosted speech service, API key or per-answer provider fee is needed. This does not make Groq understanding offline: optional online interpretation and transcription retain their own consent and internet requirements.

This is Pocket TTS Alba, not the Piper Alba/Lyra model used by some other projects. Identical timbre is not promised.

**Pace.** Earlier (13 October 2026), "Relaxed" played Alba at 0.9× speed through Android's time-stretch, which can sound metallic. Current (15 October 2026): Alba always plays at 1×. Relaxed lengthens the pauses between sentences and Brisk shortens them. Neither selects a different trained voice.

## Historical user setup — unavailable while paused

1. Install a newly compiled CareKosh Android APK containing the LiteRT native integration. An older APK, Expo Go, web or iOS cannot run this voice. The app still requires Android 8/API 26; this pack is offered on 64-bit ARM/x86 devices.
2. Open **Settings → Voice setup → Spoken replies** (step 4 when online understanding is available) and choose **Download Alba voice pack**. Confirm the download; Wi-Fi is recommended. Keep CareKosh in the foreground. The preceding Listening section configures recognition, while Understanding configures optional online text interpretation; neither chooses the speaking voice.
3. The nine data files total **208,767,942 bytes**, approximately 209 MB (199 MiB). Allow at least the pack size plus 64 MB free storage for setup and additional memory during synthesis. The speech-recognition pack is a separate download.
4. Downloading selects Alba. **Read answers aloud** remains a separate user choice; **Use Alba & read answers aloud** explicitly enables both. Choose **Relaxed**, **Natural** or **Brisk** pace and press **Preview voice**. **Hear answer** can speak an answer on demand even with automatic replies off. Preparation/playback progress and **Stop voice preview** appear during preview; repeated preview taps are blocked. Check media volume and speaker/Bluetooth output when playback starts.
5. If preview is silent, use **Check audio output**. It plays a half-second faded tone through the same PCM16 media playback path without loading a model. Results show the actual output category and media volume; Android rendering frames does **not** prove that you heard them. Expand **Audio check details** and copy the selectable text if needed. Diagnostics stay in app-session memory and contain timings, stages, counts and waveform levels, not question text, inventory names or recordings. This check neither changes the selected voice nor enables any cloud service.
6. Use **Remove Alba voice pack** to reclaim storage. It does not remove inventory, orders or the microphone recognition pack. A failed download removes its partial file and can reuse already verified completed files on retry. Leaving the app or pressing Cancel stops the download.

*Current (15 October 2026), diagnostics build:* downloads resume from the bytes already received (HTTP Range) and continue while the screen is locked or CareKosh is in the background. Only **Cancel Alba download** stops them; finished parts are kept.

## Data flow and safety

Validated answer → concise `speechText` → native `speakPocket` (its own Alba worker thread) → verified preset files → LiteRT inference: flow LM and decoder transformer on the CPU, SEANet vocoder on the GPU → one 24 kHz mono waveform per sentence chunk → validated PCM16 → streamed to Android `AudioTrack` as each chunk is ready, using the media route/volume and audio focus.

- No question, answer or recording is uploaded by the Pocket speech path. The initial download contacts Hugging Face and its approved HTTPS CDN; its ordinary connection metadata is visible to that host.
- The model catalog is fixed inside the APK, revision-pinned and SHA-256 checked. Users cannot supply a model URL or clone a voice. Model files are data, not a downloaded native executable.
- Files live in the app-private no-backup directory and contain no account data. Removing app data/uninstalling removes them; ordinary APK updates should retain them unless the catalog changes.
- This implementation uses **LiteRT Android 2.1.6**, independently of Moonshine's ONNX runtime, avoiding a second `libonnxruntime.so`. No Sherpa/eSpeak/Piper phonemizer runtime was added.
- **Placement.** The flow LM and the decoder transformer run on the CPU with up to four threads. The SEANet vocoder runs **only on the GPU**.
  - Why: on the desktop host, an optimized LiteRT 2.1.6 CPU run of the pinned vocoder graph needs about **10 GB** of memory. That measured path is unsuitable for this phone integration; the alternative reference kernels are too slow on the host.
  - If the GPU cannot compile the vocoder, Alba stops with a clear message. That failure is remembered until the pack is reinstalled or the app restarts.
  - There is no CPU retry and no automatic cloud or device-voice substitution.
  - Two placement experiments exist only in the diagnostics build: the flow LM on the GPU, and an FP32 vocoder.
- **Lifecycle.** Models compile once and stay warm between replies on a dedicated offline-voice thread, so a slow or stuck GPU call cannot block the microphone thread. The Kokoro test voice uses the same thread, so the two never run at once, and only one is kept in memory.
  - Models are freed after 90 seconds unused or 30 seconds in the background. They are also freed on memory pressure, removal and failed replies that invalidate the engine. Downloading an additional preset reuses the warm engine; it does not always reload it. Earlier (13 October 2026) any background event freed models, including a permission dialog.
  - Cancellation, an interruption, muted audio and a timeout keep the warm models; each chunk starts again from the voice state.
  - First-reply compile time must be measured on target phones.
- **Generation bounds.**
  - Text is limited to 640 characters. Earlier (13 October 2026) chunks were at most 32 tokens, often one per list item. Current (15 October 2026): up to **50 tokens**, as upstream pocket-tts uses, and up to 32 for the first chunk so speech starts sooner. Text splits at sentence ends, then commas; it splits between words only for a single over-long clause.
  - Each chunk ends with a full stop where needed, as in [pocket-tts PR #296](https://github.com/kyutai-labs/pocket-tts). Without one, the last word is often mispronounced or repeated.
  - A decimal point between digits ("0.9%") is not treated as a sentence end ([pocket-tts PR #217](https://github.com/kyutai-labs/pocket-tts)).
  - Each chunk may use at most 256 audio frames (20.48 s), also bounded by the remaining KV space, and must reach EOS plus its tail.
  - EOS is ignored for the first 6 frames, as in [pocket-tts PR #319](https://github.com/kyutai-labs/pocket-tts). On short texts the EOS logit can cross the threshold during the leading pause.
  - Each chunk starts with a 5 ms fade-in against clicks ([PR #332](https://github.com/kyutai-labs/pocket-tts)).
  - A reply has a 90-second PCM cap and a 180-second native deadline. A JavaScript backstop (195 s) also settles the call if the native side never answers.
  - Malformed and non-finite model-step results are rejected immediately.
- **Output check.** Each chunk must be finite, have RMS of at least **−50 dBFS**, and have at least 20% active 20 ms windows before it is played.
  - The old −80 dBFS floor accepted near-silence.
  - Healthy Alba speech measured about −20 dBFS with 0.7–0.8 active windows.
  - Unusable output is rejected, never amplified.
- **Joins and loudness (15 October 2026).** Each chunk's own leading and trailing silence is trimmed to the pace's pause (RMS over 10 ms windows, −55 dBFS). A checked chunk is then evened towards −18 dBFS, with at most +4 dB of gain and a peak of at most 0.9, so nothing clips.
- **Playback.** Speech starts as soon as the first sentence is decoded; later sentences keep generating while it plays. The format is **PCM16, 24 kHz mono**, `USAGE_MEDIA` with speech content and Android audio focus.
  - Current (15 October 2026): a short notification ducks the voice to 30 % instead of stopping it. A call or another app's audio stops it calmly, as an interruption rather than an error. Unplugging headphones or a Bluetooth drop stops it, so it never moves to the loudspeaker.
  - At the end, completion is measured while the track is playing, before `AudioTrack.stop()` resets its playback-head counter. Rendered frames are captured before stopping. The JVM fake now models that reset; a clip that has completed must not become a timeout. Earlier code checked the reset counter after stop.
  - A 120 ms lead-in lets the audio route settle.
  - On Android 12 and later, playback starts after 200 ms of buffered audio. On older versions a short clip is padded past the buffer, so it always starts.
  - Completion waits for rendered frames within the clip length plus 5 s, never indefinitely.
  - The Android-selected speaker, headset or Bluetooth route is respected. The speaker is never forced and system volume is never changed.
  - Muted media, rejected focus, failed start, write errors and stalled completion produce a visible message. Completion reports rendered frames, route category and media volume; that is not acoustic proof.
- **Cancellation.** Cancel, another question, leaving the screen, backgrounding, logout or changing accounts invalidates speech. Playback is flushed at once.
  - An in-flight native model call may finish before it is noticed.
  - Stale results cannot start playback. A lasting audio-focus loss stops it; a short one lowers the volume.
  - An aborted turn stops waiting immediately and never cancels a later question's recording.
- Synthesis failure keeps the factual answer visible. Neither this voice nor Groq interpretation gains inventory/order-save authority. Touch confirmation remains required to save an order.
- Device speech remains a selectable fallback controlled by the user. While paused, withdrawing cloud consent returns narration to device voice.

**Independent-review repairs — 15 October 2026.** Downloads now use their own worker, separate from microphone preparation/transcription and offline synthesis. App-wide progress and Cancel remain available after closing and reopening Voice setup. Pack publication/removal uses short synchronized sections; removal cancels a pending install before deleting files. Network waits do not hold an engine worker.

Listening-pack status may cache unchanged size/time metadata. Every fresh capture or transcription engine load re-verifies the embedded catalog checksums, even when metadata matches; either load failure invalidates the cache. This protects inference from a same-size/timestamp mutation without repeatedly hashing the pack for status-only UI checks.

Readiness follows the selected Alba voice. Any installed preset keeps Remove and the catalog available, even if the original Alba preset was removed. The first chunk is split to at most 32 tokens, including an overlong initial clause; later chunks retain the 50-token bound. Kokoro protects dates, versions and item codes before formatting standalone decimals. These changes are tested on the host, not yet certified on the phone. Current results are in [the verification follow-up](AI_VOICE_END_TO_END_REVIEW.md#15-independent-verification-follow-up).

## Models, attribution and notices

| Component | Pinned source / licence |
|---|---|
| Original model and fixed Alba MacKenna preset | [Kyutai non-cloning model](https://huggingface.co/kyutai/pocket-tts-without-voice-cloning), [Alba source recordings](https://huggingface.co/kyutai/tts-voices#alba-mackenna); CC BY 4.0 |
| LiteRT conversion and preset repacking | [Pocket-TTS-LiteRT](https://huggingface.co/mlboydaisuke/Pocket-TTS-LiteRT), revision `e0e68d4fb79feb529d7d0f8d0bbfad8d15a18a1e`; CC BY 4.0 |
| Original Pocket TTS code | [Kyutai Pocket TTS](https://github.com/kyutai-labs/pocket-tts); MIT |
| Adapted Android host/tokenizer example | [LiteRT-Models/pockettts](https://github.com/john-rocky/LiteRT-Models/tree/310464b5988f59c03de9283c3d7451e51d9f0260/pockettts); MIT, Daisuke Majima |
| Android inference runtime | [Google LiteRT](https://developers.google.com/edge/litert/android), `2.1.6`; Apache 2.0 and SDK third-party notices |
| Preset voices Charles, Eve and Mary (15 October 2026) | Same Pocket-TTS-LiteRT revision; recordings from the [CSTR VCTK Corpus](https://huggingface.co/kyutai/tts-voices/tree/main/vctk) (p254, p361, p333); CC BY 4.0 |
| Preset voices Javert and Marius (15 October 2026) | Same revision; [Unmute voice donations](https://huggingface.co/kyutai/tts-voices/tree/main/voice-donations); CC0 |
| "Alba (updated)" voice state (15 October 2026) | [`kyutai/pocket-tts-without-voice-cloning`](https://huggingface.co/kyutai/pocket-tts-without-voice-cloning) revision `069025daa1d6a8a9640bd52581e2a2252f8bede4`, `languages/english_2026-04/embeddings/alba.safetensors`; CC BY 4.0; converted to float16 and repacked on the phone |
| Kokoro test voice (15 October 2026, diagnostics builds) | See [the Kokoro section](#kokoro-test-voice-v-41); Apache 2.0 model and voices, BSD-style CMUdict data |

Voice setup shows attribution and offers **Export complete Alba licence notices**. Full MIT, CC BY 4.0, Apache 2.0 and complete SDK third-party notices are bundled under `modules/carekosh-voice/android/src/main/assets/pocket-licences`. The SDK notice is compressed in the APK and expanded in the exported ZIP. Notices identify upstream changes and do not imply creator endorsement. The full SDK notice also covers build tooling; listing a tool does not establish that it is linked into the app. Review the final packaged dependency inventory before public distribution.

## Source map

Under `vitaltrack-mobile/`:

- `features/assistant/offlineVoice.ts`: optional bridge, progress stages and the abortable JavaScript backstop; `speakDiagnostic` for test builds; older APKs retain existing device speech.
- `features/assistant/policy.ts`: `VOICE_DIAGNOSTICS_ENABLED` (build-time `EXPO_PUBLIC_VOICE_DIAGNOSTICS=1`, only in the `preview-voice-diagnostics` EAS profile) and `ALBA_SELECTION_ENABLED`, which follows it. `app.config.js` refuses the flag in production builds.
- `features/assistant/preferences.ts`: account-scoped provider/pace and the optional `speechFallback`; no automatic opt-in.
- `features/assistant/narration.ts`: the online-to-offline fallback state machine (read once, never a second online request).
- `components/assistant/VoiceSetup.tsx`: download, readiness, provider, pace, preview, the fallback choice, the diagnostics panel (test builds only) and notices.
- `components/assistant/AssistantExperience.tsx`: setup/session cancellation, factual-answer playback, fallback and diagnostics runs.
- `modules/carekosh-voice/android/src/main/java/expo/modules/carekoshvoice/PocketPack.kt`: fixed catalog, storage, redirects, checksums and deletion.
- `PocketTokenizer.kt`, `PocketText.kt`: tokenization, normalization, decimal-aware bounded sentence chunks.
- `PocketSynthesizer.kt`: preset-only LiteRT orchestration. Compiles once, delivers chunk by chunk and keeps per-chunk counts and timings.
- `PocketRecovery.kt`: placement policy (vocoder GPU-only), EOS guard and generation-window checks.
- `PocketAudio.kt`: waveform levels (dBFS, active windows, non-finite count), PCM16 conversion, playback framing and the sound-check tone.
- `PocketPlayback.kt`: streaming writer, start-threshold handling, focus, route and volume, cancellation and playback reports.
- `PocketDiagnostics.kt`: bounded, path-redacted record for each operation, mirrored to logcat tag `CareKoshVoice`.
- `CareKoshVoiceModule.kt`: separate Moonshine and Alba worker lanes, the warm engine and the Expo native API.
- `modules/carekosh-voice/android/src/main/assets/pocket-alba-manifest.json`: exact file sizes/checksums; model weights are not committed. Since 15 October 2026 it lists the shared graphs under `assets` and each preset under `voices`. A voice with `voiceState` is downloaded from Kyutai and packed on the phone.
- *Added 15 October 2026:* `VoiceErrors.kt` (stable error codes), `PackDownload.kt` (resumable pinned downloads, shared by every pack), `PocketVoiceState.kt` (voice-state packing), `KokoroPack.kt` and `KokoroSpeech.kt` (the Kokoro test voice), and `assets/kokoro-manifest.json`.
- `scripts/check-pocket-recovery.kt`: pure-JVM checks, including the streaming writer against a fake AudioTrack.
- `scripts/pocket-host-check/`: the actual Kotlin synthesizer with real LiteRT 2.1.6 numerics on a desktop host, plus a per-graph memory probe. Since 15 October 2026 it also has `pack_voice.py` and a `COMPARE` mode for voice states.
- `scripts/kokoro-host-check.py` (15 October 2026): the pinned Kokoro files through moonshine-voice 0.1.5 on a desktop host.

## Verification and release gate

### Sound quality, voices and Kokoro — 15 October 2026

**Status.** Working tree, not yet committed. Host checks pass; the phone checks below are still open. Normal builds keep Alba and Kokoro off. Item numbers refer to [§14 of the end-to-end review](AI_VOICE_END_TO_END_REVIEW.md#14-october-follow-up-audit-and-fixes).

#### Why Alba did not sound good

| Cause | Effect on the phone | Change |
|---|---|---|
| Chunks were at most 32 tokens (V-36). | A list reply became many short chunks. Each restarts from the voice state and adds about 0.7 s of silence, so speech sounded choppy. | Up to 50 tokens, the first up to 32. Joins are trimmed to the pace's pause. |
| A chunk without final punctuation (V-36). | Upstream reports the last word is often mispronounced or repeated. | Pocket TTS PR #296 rule: soft endings become a full stop. |
| Pace used Android's time-stretch (V-37). | Relaxed and Brisk could sound metallic. | Pace changes the pauses only. |
| Uneven, quiet level (V-39). | Replies measured −18.9 to −22.3 dBFS. | Evened to −18 dBFS, at most +4 dB, peak ≤ 0.9. |
| The Alba voice state ends mid-word (V-40). | Out-of-place sounds at chunk starts; wrong or repeated one-word replies. | "Alba (updated)" voice (below). |
| Text written for the screen (V-20). | Symbols, units and sizes read oddly. | Shared `speechFriendly` text for every voice. |

**Host evidence (same four replies, real LiteRT 2.1.6).** Loudness is now −18.0 dBFS for every reply. Time to the first chunk is unchanged: about 0.8–0.9 s on the host.

#### Voices (diagnostics build)

Voice setup lists **Alba** (the default), **Alba (updated)**, **Charles**, **Eve**, **Mary**, **Javert** and **Marius**. Each extra voice downloads 3–6 MB once; the shared graphs are reused. Use **Preview voice** to compare.

- **Licences.** Charles, Eve and Mary come from the VCTK corpus (CC BY 4.0). Javert and Marius come from voice donations (CC0). Expresso and EARS voices are non-commercial, so they are not offered.
- **"Alba (updated)".** Kyutai regenerated its voice states on 27 September 2026 so that each prompt ends on an 80 ms pause ([pocket-tts PR #334](https://github.com/kyutai-labs/pocket-tts/pull/334)). On `english_2026-04`, the model our graphs come from, Kyutai measured:
  - word errors from 2.05 % to 1.66 %;
  - chunk-start bursts from 17 to 0 in 400;
  - correct one-word replies from 425 to 451 of 480.
- **Why Kyutai's current files are old again.** An upload on 1 October for other languages put the old English files back. That PR does not mention English. Kyutai's PR #351 (10 October) still names the old state as the cause of the bursts. So the revert was not a quality decision.
- **How it reaches the phone.** The repository is public (not gated) and CC BY 4.0. The phone downloads the pinned 6.2 MB file, checks its SHA-256 and packs it into the app's layout. The packed file (127 frames, 3,121,156 bytes) must match a second pinned SHA-256. No binary is committed.
- **Packing is exact.** `pack_voice.py` (host) and `PocketVoiceState.kt` (phone) reproduce the pinned `pt_voice_alba.bin` byte for byte from Kyutai's original state. Their float16 rounding matched numpy on 5.1 million test values.
- **Bounds.** The 127-frame state fits: 127 + 50 tokens + 1 is well under the 512-frame KV cache, and generation keeps the full 256-frame decoder window.
- **Host comparison**, per state: 72 short replies of one to three words and 24 multi-sentence replies.
  - Both spoke everything at the same speed (real-time factor 0.20 on the host).
  - The updated state starts each chunk after a natural pause: a median of 80 ms against 40 ms.
  - Whisper `base.en` heard all 72 short replies correctly, against 70 of 72 for the original (one was "Done. Done.").
  - The default stays **Alba** until the owner compares both on the phone.

#### Kokoro test voice (V-41)

A calmer offline voice to compare with Alba, offered **only in the diagnostics build** (`KOKORO_SELECTION_ENABLED` follows `VOICE_DIAGNOSTICS_ENABLED`). It uses `ai.moonshine.voice.TextToSpeech` from moonshine-voice 0.1.5, which the app already ships for listening. No native library is added.

- **Voices.** Heart (default) and Bella (US), Emma (UK). Emma needs the `en_gb` profile, which uses the same English files. The library does not offer her under `en_us`.
- **Files.** Exactly the moonshine-voice 0.1.5 set, pinned in `kokoro-manifest.json`:
  - `kokoro/config.json`, plus the prosody and decoder stages, each as `.model.ort` and `.weights.ort`;
  - the English pronunciation dictionary, its config, and the out-of-vocabulary model with its config.

  They total 108.5 MB, plus about 0.5 MB per voice. They come from Moonshine's Hugging Face mirror at commit `0bf2f2e5aff22e6fbba4300b00a4e00bbc4f8aae`. Their MD5 values matched Moonshine's v0.1.5 list (`FILES.tsv`), and each is checked by size and SHA-256.
  - The single `kokoro/model.ort` shown in Moonshine's older transfer report is not part of the 0.1.5 set.
  - `modelsFrom(folder)` means the library never downloads on its own.
- **Engine.**
  - **Sentences.** The library's sentence splitter runs first. Sentences under four words join a neighbour, because Kokoro is weak on very short inputs.
  - **Synthesis.** `synthesize(text, speed)` runs per chunk at 24 kHz. Pace uses Kokoro's own speed: 0.9, 1.0 or 1.1.
  - **Playback.** Through CareKosh's own audio path, with the same level check, ducking, interruption, cancellation and diagnostics as Alba. Kokoro normalises to full scale, so peaks are limited to 0.9. No cloning API is ever called.
- **Pronunciation.** Moonshine's dictionary misread decimals ("12.5" as "12 up 5") and guessed British spellings ("litres" heard as "lighters"). For Kokoro only, CareKosh says "12 point 5" and uses US spellings of litre, metre and their compounds. Whisper's word error rate on CareKosh replies fell from 27–35 % to 10–14 %. Remaining misses are item names such as "Ambu" and "Paracetamol", which need the owner's phone check.
- **Host results** (moonshine-voice 0.1.5 on a Mac, same native core): each voice loads in about 0.2 s and runs at a real-time factor of about 0.10. Phone figures are not published and are NOT VERIFIED.
- **Licences.**
  - The Kokoro-82M model and voices (hexgrad) and the ONNX export are Apache 2.0, with no NOTICE files.
  - The English dictionary comes from CMUdict (BSD-style; full text in `KOKORO-ATTRIBUTION.txt`).
  - Moonshine's asset page says its pronunciation data "follow the terms of the projects they come from". Its own out-of-vocabulary model has no separate licence text. **Owner review** is needed before any wider release.
- **Diagnostics.** **Generate Kokoro without playing** and **Generate and play Kokoro** report the first chunk's time, the synthesis real-time factor, the total time and the peak native heap.
- **Release criteria (owner, on the Nord 4).** First audio within 1.5 s, real-time factor below 1, no crash in 20 replies, and acceptable item names.

#### Checks run (15 October)

These are the initial implementation's results, before the independent-review repairs. Current follow-up results are recorded in [§15 of the end-to-end review](AI_VOICE_END_TO_END_REVIEW.md#15-independent-verification-follow-up). Passing these initial checks did not expose the playback-counter or download-lifetime defects.

- **Mobile:** 378/378 tests, TypeScript clean, lint 0 errors.
- **JVM (`scripts/check-pocket-recovery.kt`):** adds focus and engine policy, end punctuation, chunking, join trimming, loudness, resumable downloads, voice-state packing and Kokoro text. Two deliberately broken packers were caught.
- **Native compile:** all 72 module classes against the Android API, LiteRT 2.1.6 (`litert` and `litert-api`) and moonshine-voice 0.1.5 jars with Expo stubs, Kotlin language/API 2.2. This is not the real Gradle build.
- **Host checks:** `run.sh`, its `COMPARE` mode and `kokoro-host-check.py` pass.
- **Android JavaScript export** of `preview` and `preview-voice-diagnostics` with `--clear`: both build. In `preview`, the diagnostics, Alba and Kokoro flags compile to `false`. Without `--clear`, Metro reused the first export's transforms and the two bundles were byte-identical. Always pass `--clear` for this check.

#### How to rerun the checks (15 October)

```bash
cd vitaltrack-mobile
K=modules/carekosh-voice/android/src/main/java/expo/modules/carekoshvoice
# JVM checks: android.jar and the moonshine-voice 0.1.5 classes on the classpath
kotlinc -cp /path/to/android.jar:/path/to/moonshine-classes.jar \
  $K/{PocketAudio,PocketRecovery,PocketPlayback,PocketDiagnostics,VoiceErrors,PocketText,PocketTokenizer,PackDownload,PocketVoiceState,KokoroSpeech}.kt \
  scripts/check-pocket-recovery.kt -include-runtime -d /tmp/pocket-native-check.jar
java -cp /tmp/pocket-native-check.jar:/path/to/android.jar:/path/to/moonshine-classes.jar expo.modules.carekoshvoice.Check_pocket_recoveryKt
# Actual listening-pack integrity/lane/removal regression: tiny synthetic files, no network/models.
# This test needs android-all at runtime, not Android SDK's throwing android.jar stubs.
kotlinc -cp /path/to/android-all.jar:/path/to/moonshine-classes.jar \
  $K/{ModelPack,PackDownload,VoiceErrors}.kt scripts/check-model-pack.kt \
  -include-runtime -d /tmp/model-pack-check.jar
java -Djava.io.tmpdir=/tmp -cp /tmp/model-pack-check.jar:/path/to/android-all.jar:/path/to/moonshine-classes.jar expo.modules.carekoshvoice.Check_model_packKt
# Alba host check, then a voice-state comparison (see scripts/pocket-host-check/README.md)
ASSETS=/path/to/verified/alba PYTHON=/path/to/python-with-ai-edge-litert-2.1.6 KOTLINC=$(command -v kotlinc) scripts/pocket-host-check/run.sh
# Kokoro host check (pinned files downloaded outside Git)
/path/to/venv-with-moonshine-voice-0.1.5/bin/python -I scripts/kokoro-host-check.py /path/to/kokoro /tmp/kokoro-wav modules/carekosh-voice/android/src/main/assets/kokoro-manifest.json
# Flag folding: always clear Metro's cache
EAS_BUILD_PROFILE=preview EXPO_PUBLIC_API_URL=https://staging-api.carekosh.com npx expo export --clear --platform android --no-bytecode --output-dir /tmp/export-preview
```

#### Phone acceptance additions (diagnostics build)

Run these after the steps under [Phone acceptance](#phone-acceptance--diagnostics-build).

1. **Alba voices.** Preview **Alba**, then **Alba (updated)**, on the same reply. Note which sounds better, and any odd sounds at sentence starts. Then try the other voices.
2. **Pace.** Relaxed and Brisk should change only the pauses; the voice should never sound stretched.
3. **Interruptions.** A notification during speech should lower the voice, not stop it. Unplugging headphones should stop it. A call should stop it without an error.
4. **Downloads.** Lock the screen during a download: it should continue. Cancel should stop it, and a retry should resume.
5. **Kokoro.** Download it, preview Heart, Bella and Emma, and run both Kokoro diagnostics. Record the time to first audio, the real-time factor and the peak native heap. Listen for the owner's item names.

### Offline voice investigation — 13 October 2026

**Scope.** The investigation ran on a macOS host with LiteRT 2.1.6, the same runtime version as the APK, using the exact pinned Alba files (size- and SHA-256-verified). No Android phone or emulator was available. So there is no logcat trace, no phone GPU driver and no audio HAL behind any result below.

**Pipeline traced.** text → chunks → voice state → three graphs → EOS → vocoder → validation → PCM16 → focus/route → AudioTrack → completion → UI cleanup.

#### Confirmed findings

| # | Finding | Evidence | Effect | Change |
|---|---|---|---|---|
| 1 | The selected optimized CPU vocoder path is unsuitable for this phone integration. | Desktop runs of `pt_mimi_deconly_fp16` (fixed 256-frame window) peak at about **10.1 GB** with XNNPACK and **8.3 GB** with builtin kernels; its op outputs total 9.6 GB. Reference kernels use 0.8 GB but take 57 s per call. The GPU run uses about 142 MB. | Both the "one CPU retry" and the silent CPU fallback after a GPU compile error sent the vocoder to the CPU. Those paths risk allocation failure or extreme slowness on the phone and can explain "Converting Alba speech to audio with the CPU". The exact Nord 4 failure is not proven without a device trace. | Vocoder is GPU-only, with a clear error if it cannot compile. The CPU retry is removed. |
| 2 | The silence check accepted unusable audio. | The −80 dBFS floor passed a near-silent clip. A garbled clip from deliberately swapped K/V inputs measured −33 dBFS and also passed. | A failed generation could "complete" without audible speech. | Each chunk needs ≥ −50 dBFS RMS and ≥ 20% active windows; levels go into diagnostics. |
| 3 | Every reply recompiled every model. | The synthesizer was created and closed for each utterance; the upstream example loads once. | GPU or CPU compile time was added to every reply. | Warm engine; released when idle, in the background or after a failure. |
| 4 | A native Error could leave the screen waiting forever. | The worker caught only `LinkageError`, `OutOfMemoryError` and `Exception`. JavaScript had no bound of its own. | Possible endless "preparing". | Catch `Throwable`; abortable 195 s JavaScript backstop. |
| 5 | Alba shared the microphone's worker thread. | One single-thread executor ran Moonshine, recording and Alba. | A stuck GPU call would block the next recording. | Separate Alba and Moonshine lanes. |
| 6 | Short clips might never start. | `MODE_STREAM`, a 1 s buffer and no `stop()`. Android's default streaming start threshold is the buffer capacity ([`getStartThresholdInFrames`](https://developer.android.com/reference/android/media/AudioTrack#getStartThresholdInFrames())). A fake-track test reproduces it. | The 0.5 s "Check audio output" tone could time out silently. | 200 ms start threshold on API 31+; padding on older versions; completion bounded by clip length. |
| 7 | Upstream fixes were missing. | The pinned port predates pocket-tts PR #319 (early EOS), #332 (chunk-start click) and #217 (decimal split). | Short words cut off; clicks; "0.9%" split mid-number. | Ported. |

**Not a defect.** The tensor wiring is correct.
- The exporter at the pinned revision defines `FusedStep.forward(x, cos, sin, mask, pk, pv, noise)`. Its output is `cat([eos, lat, new_k, new_v])` ([`build_pockettts.py`](https://github.com/john-rocky/LiteRT-Models/blob/310464b5988f59c03de9283c3d7451e51d9f0260/pockettts/build_pockettts.py)).
- Same-seed host runs confirm it: the app's order gives speech, while swapping K/V or cos/sin gives garbage or no EOS.

#### Remaining hypotheses (no phone evidence)

- **H1:** with the old default the flow LM ran on the Adreno GPU at fp16. That may have degraded its output, giving "could not finish this sentence" or garbled audio.
  - On the host, Metal fp16 latents matched the CPU (cosine 0.93–1.0).
  - A derivative benchmark found PowerVR fp16 changed the take (correlation 0.77).
  - Upstream never measured the fused graph on Adreno.
  - The new default runs the LM on the CPU; the `lm_gpu` experiment tests this hypothesis.
- **H2:** the vocoder's GPU compile failed on the phone and silently fell back to the CPU (finding 1). Diagnostics now report "vocoder GPU compile failed".
- **H3:** route, volume or Bluetooth start-up. Use the native tone first.
- **H4:** phone CPU speed for the LM. The host takes 4.3 ms per step; a phone is estimated at 10–25 ms per step but has not been measured.

#### Host measurements (Apple silicon, LiteRT 2.1.6, exact pinned files)

| Graph | CPU, 4 threads | GPU (Metal) |
|---|---|---|
| Flow LM (`pt_flowlm_fused_fp16`) | 4.3 ms/step · 632 MB peak | 38 ms/step (dispatch-bound) · 923 MB |
| Decoder transformer (`pt_mimi_dec_tx_fp16`) | 23 ms/block · 179 MB | 20 ms/block · 153 MB |
| Vocoder (`pt_mimi_deconly_fp16`) | 0.9–1.5 s/call · **8.6–10.1 GB** | 65–490 ms/call · 142 MB |

- **Default placement, end to end.** This uses the actual Kotlin code through `scripts/pocket-host-check`, including the shim's data-transfer overhead.
  - Replies of 2.6–8.4 s of audio measured −19 to −21 dBFS with 0.71–0.80 active windows.
  - The EOS maximum logit was +6.4 to +9.7.
  - Peak process memory was 0.89 GB (measured with the Python mirror).
- **Same seed, compared with all-CPU.** Latents are bit-identical; the GPU vocoder's waveform differs by −44 dB.
- These are desktop figures, not phone figures.

#### Embedded Kokoro evaluation and plan B

| Option | Result |
|---|---|
| Kokoro-82M through Moonshine's `TextToSpeech` (in the `moonshine-voice` 0.1.5 already shipped) | **Plan B.** The shipped jar contains `ai.moonshine.voice.TextToSpeech`. It uses Moonshine's MIT G2P (no eSpeak) and the same minimal ONNX Runtime 1.23.2, so no native library is added. One US voice plus G2P is 108,987,341 bytes. Phone speed is unpublished; its English G2P error is 12.6% vs 9.8% for eSpeak/misaki. Its voice-cloning API must never be used. |
| sherpa-onnx (any model) | Blocked: statically links GPL-3.0 eSpeak-NG and ships its own `libonnxruntime.so`. |
| kokoro-onnx, misaki with eSpeak fallback, Kitten, Piper's current fork | Blocked: GPL phonemizer, and stock ONNX Runtime would duplicate Moonshine's `libonnxruntime.so` (Moonshine's build loads only `.ort` models). |
| Kokoro on LiteRT (`litert-community` preview) | Not ready: FP32 CPU only, about 1.8× slower than real time on a Pixel 8a. |

Switch to plan B only if the diagnostics build shows a vocoder GPU compile failure, or synthesis slower than real time, on the Nord 4. Unusual item names such as "chlorhexidine" are missing from every GPL-free lexicon checked, so either voice needs an app-side pronunciation list and an audition.

#### Licence notes

- Weights and the fixed Alba preset are CC BY 4.0; the code notices are MIT and Apache 2.0. All are bundled and exportable. No GPL or eSpeak component was added.
- Kyutai's original Hugging Face repository is gated behind prohibited-use terms. CareKosh downloads the CC BY 4.0 LiteRT conversion instead. **Owner review:** confirm whether those use terms apply to this use.
- *Correction, 15 October 2026:* `kyutai/pocket-tts` (with voice cloning) is gated. `kyutai/pocket-tts-without-voice-cloning` is public (`gated: false`, CC BY 4.0), and its card lists prohibited uses such as impersonation and deception. CareKosh uses fixed preset voices for synthetic assistant speech only. The owner review above still applies.

#### Checks run (13 October)

- **Mobile:** 290/290 tests (21 new: fallback state machine, preferences/build flags, screen-level fallback, backstop and stages, build-profile guards), TypeScript clean, lint 0 errors.
- **Native compile:** every module source against the Android API, LiteRT 2.1.6 and Moonshine 0.1.5 jars and Expo stubs. Compiler: Kotlin 2.3.20 at language/API 2.2. This is not the real Gradle 2.2.20 build.
- **`scripts/check-pocket-recovery.kt` (JVM):** EOS guard, placement, level checks, framing, the streaming writer, cancellation, write errors, stall bounds and diagnostics redaction all pass.
- **`scripts/pocket-host-check/run.sh`:** the actual Kotlin synthesizer with real LiteRT numerics passes. That covers warm reuse, cancellation, decimal chunking, and "vocoder GPU failure gives a clear error with no CPU attempt".
- **Android JavaScript bundle export, `preview` and `preview-voice-diagnostics` profiles:** both succeed. The normal bundle constant-folds both flags to false.

**Not verified — device acceptance pending:**
- Android JNI/LiteRT on the Nord 4;
- Adreno OpenCL compile and numerics of the vocoder;
- phone CPU timing, first-audio delay and peak memory;
- OxygenOS AudioTrack behaviour;
- physical sound on the speaker and over Bluetooth;
- a real Gradle release build. EAS needs the owner's authorization; a local build needs an Android SDK, which is not installed here.

#### How to rerun the host checks

*Superseded on 15 October 2026 by [the newer commands](#how-to-rerun-the-checks-15-october): the JVM check now needs more source files and the moonshine-voice classes.*

```bash
cd vitaltrack-mobile
# JVM checks (android.jar on the compile classpath only; no Android class loads at runtime)
kotlinc -cp /path/to/android.jar modules/carekosh-voice/android/src/main/java/expo/modules/carekoshvoice/{PocketAudio,PocketRecovery,PocketPlayback,PocketDiagnostics}.kt \
  scripts/check-pocket-recovery.kt -include-runtime -d /tmp/pocket-native-check.jar
java -cp /tmp/pocket-native-check.jar expo.modules.carekoshvoice.Check_pocket_recoveryKt
# Actual Kotlin synthesizer with real LiteRT 2.1.6 (assets downloaded and verified outside Git)
ASSETS=/path/to/verified/alba PYTHON=/path/to/python-with-ai-edge-litert-2.1.6 KOTLINC=$(command -v kotlinc) scripts/pocket-host-check/run.sh
$PYTHON scripts/pocket-host-check/probe_graphs.py /path/to/verified/alba
```

#### Phone acceptance — diagnostics build

Build the `preview-voice-diagnostics` profile only with the owner's authorization. Then, on the OnePlus Nord 4 and a second phone, in Voice setup → Offline voice diagnostics:

1. **Play native test tone.** Record whether you heard it, plus the route and volume shown.
2. **Download the Alba pack**, then **Generate Alba without playing.** Record the timings, levels and placements. A "vocoder GPU compile failed" line means plan B.
3. **Generate and play Alba.** Did you hear it? Record the first-audio and total times. Repeat once (the warm engine should be faster). Then try both experiments.
4. **Copy "Audio check details" after each step.** If USB is available, `adb logcat -s CareKoshVoice` captures only these lines without clearing other logs.
5. **Run the release criteria below in airplane mode:** preview and Hear answer, Stop, a second question, Bluetooth, backgrounding, account change, a removed pack and low storage. Keep `ALBA_SELECTION_ENABLED` off in normal builds until they pass.

### Silent preview after CPU recovery — 11 October 2026

The screenshots show a verified pack, Alba selected and automatic narration enabled. The owner reports preview ending without sound and cannot currently provide a USB device trace. Therefore the exact phone failure remains **not verified**: screenshots of preparation do not establish that playback began, and silent completion alone cannot distinguish a weak waveform, output routing or native playback behavior.

This follow-up replaces float `USAGE_ASSISTANT` playback with standard PCM16 media playback, validates track start/gain and the whole waveform, includes PCM validation within GPU recovery, checks model-step values before continuing, and makes preview errors/results visible beside its controls. Prompting, frame generation and decoding now have separate progress; a model-independent sound check and selectable session diagnostics identify the next failure without uploading speech. A ten-second limit applies to the sound check; speech retains its existing bounds.

The **actual Kotlin tokenizer/host synthesis code** was exercised through real **LiteRT 2.1.6 CPU model calls on the Mac**, using the exact pinned assets. Preview and stock-summary waveforms reached EOS, had healthy RMS and survived PCM16 conversion. This is stronger than a separately reimplemented Python flow, but the model-call bridge and Android `Half` were substituted for host testing: Android JNI/GPU/HAL playback is still not covered. Tests for route reports and cancellation use native mocks; they cannot prove physical sound.

Local follow-up checks: **254/254 mobile tests**, TypeScript clean, lint zero errors (one existing builder hook warning), and all native voice sources compiled with Kotlin 2.2.20 against actual Android/Moonshine/LiteRT jars and Expo bridge stubs. Pure JVM checks cover inaudible waveforms, PCM16 clipping and tone fades; playback logic checks with mocked Android APIs cover route reporting, mute/focus/start/gain/write failures and cancellation/cleanup. These are not a complete EAS build or real OnePlus playback certification.

Device acceptance requires **Check audio output → Preview voice → spoken answer → second question** on the new APK, including Bluetooth separately. If the tone is silent, inspect route/volume and playback details; if the tone is audible but Alba is silent, inspect generation/PCM details. Do not describe this follow-up as a confirmed OnePlus fix before those checks pass.

### Reported silent replies / EOS failure — 10 October 2026

Phone feedback reports **“Alba could not finish this sentence. Try a shorter reply.”** This comes from generation before `AudioTrack` playback, so microphone permissions or a Render redeploy cannot fix that specific failure. The exact device-side cause (early estimated cutoff versus GPU behavior) is not proven without a device trace. The follow-up removes the heuristic as a hard cutoff, leaves the real KV/decoder/time bounds in place, reduces lossless chunks to 32 tokens and adds the local CPU recovery above. The microphone, Groq query routing, backend and model catalog are unchanged.

Settings now distinguish a downloaded voice from enabled automatic narration and show checking, loading, generating, CPU recovery and playback stages. Muted media volume produces an explicit message. A new progress-capable native method retains the older two-argument method for compatibility; event IDs prevent an old utterance's progress from updating a new one.

Local validation: **248 mobile tests**, TypeScript, lint (zero errors, one existing builder warning), all voice-module Kotlin sources compiled with 2.2.20 against the actual Android/Moonshine/LiteRT API jars and Expo bridge stubs, 113 SentencePiece reference cases and lossless 32-token chunk tests. JVM recovery checks exercise late EOS, KV/decoder bounds, GPU failure followed by one CPU attempt, cancellation, CPU failure and silent/non-finite audio. A fixture using the exact assets produced finite non-silent stock-summary PCM on the Mac CPU. These checks do not establish Android speaker output or GPU behavior; a new APK and OnePlus preview/answer/second-question tests remain required.

To run the new pure JVM recovery checks, compile `PocketAudio.kt` and `PocketRecovery.kt` with `scripts/check-pocket-recovery.kt` using Kotlin 2.2.20 and run its main class. The tokenizer check below now uses the shared **32-token** limit.

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
2. Run **Check audio output**, record the route/volume result, then in airplane mode preview Alba at each pace and use **Hear answer** with a current-session inventory snapshot. No speech endpoint should be called.
3. Check names, quantities, units, long summary, volume, first-reply delay, repeated replies, temperature and memory use. Test a Bluetooth/headset output too.
4. Stop during generation and playback; start another microphone query; background/logout/change account; interrupt with another app's audio. No late speech or frozen UI should remain.
5. Keep the model unavailable/removed and verify the answer stays visible with a useful message. Device speech must work only when explicitly selected.
6. Repeat manifest, native-library alignment and notice checks for each release artifact. These package checks passed for the preview APK above; they do not replace the device checks.

No backend migration, new environment variable, Render deployment or database operation is needed for this speech-output feature.
