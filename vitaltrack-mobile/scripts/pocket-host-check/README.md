# Pocket TTS / Alba host check

These scripts run CareKosh's **actual Kotlin synthesizer, text and audio code** against real **LiteRT 2.1.6** numerics on a desktop computer. LiteRT 2.1.6 is the runtime version the APK uses.

The shim forwards each model call to a local Python LiteRT process. CPU calls run through XNNPACK; GPU calls run on the host's accelerator, for example Metal on a Mac.

**What it proves:**
- the Kotlin port runs end to end;
- the default placement gives healthy, validated speech;
- warm reuse and cancellation work;
- decimal-aware chunking works;
- a vocoder GPU compile failure stops with a clear error and never tries the CPU.

**What it does not prove:** Android JNI, the phone's GPU driver, AudioTrack, the audio HAL or physical sound. Those need the phone checks in [`docs/POCKET_TTS_ALBA.md`](../../../docs/POCKET_TTS_ALBA.md#phone-acceptance--diagnostics-build).

| File | Purpose |
|---|---|
| `run.sh` | Compiles the module sources with the shim and runs `HostDriver.kt`, once normally and once with the vocoder's GPU compile forced to fail. |
| `LiteRtShim.kt`, `AndroidHalf.kt` | Host-only stand-ins for the LiteRT Kotlin API and `android.util.Half`. They are never part of the Android build. |
| `server.py` | Local LiteRT 2.1.6 model server for the shim. |
| `HostDriver.kt` | Replies, levels, timings, decimal chunking, cancellation and reuse checks. |
| `probe_graphs.py` | Peak memory and time of each graph on CPU and GPU, plus the total size of every intermediate output. This is where the vocoder's ~10 GB CPU requirement is measured. |

**Requirements:**
- a JDK 17 or newer;
- `kotlinc` 2.2 or newer, or `KOTLIN_COMPILER_JAR`;
- Python 3.12 with `ai-edge-litert==2.1.6` and `numpy`;
- the nine pinned Alba files, downloaded and SHA-256-verified outside Git against `modules/carekosh-voice/android/src/main/assets/pocket-alba-manifest.json`. Never commit model files.

```bash
ASSETS=/path/to/verified/alba PYTHON=/path/to/python KOTLINC=$(command -v kotlinc) ./run.sh
/path/to/python probe_graphs.py /path/to/verified/alba
```
