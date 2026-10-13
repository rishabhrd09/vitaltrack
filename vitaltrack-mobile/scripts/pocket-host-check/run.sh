#!/bin/bash
# Runs the ACTUAL CareKosh Kotlin synthesizer/text/audio code against real LiteRT 2.1.6 numerics on a
# desktop host through a JVM shim (CPU = XNNPACK, GPU = the host accelerator, e.g. Metal). Host
# evidence only: it does not exercise Android JNI, the phone GPU driver, AudioTrack or the audio HAL.
#
# Required environment:
#   ASSETS   folder with the nine pinned Alba files, size- and SHA-256-verified against
#            modules/carekosh-voice/android/src/main/assets/pocket-alba-manifest.json (never commit them)
#   PYTHON   Python 3.12 with ai-edge-litert==2.1.6 and numpy
#   KOTLINC  a kotlinc 2.2+ executable, or set KOTLIN_COMPILER_JAR to an embeddable compiler jar that
#            also contains the Kotlin standard library
set -euo pipefail
H=$(cd "$(dirname "$0")" && pwd); M="$H/../../modules/carekosh-voice/android/src/main/java/expo/modules/carekoshvoice"
OUT=$(mktemp -d); trap 'rm -rf "$OUT"' EXIT
SOURCES=("$M/PocketSynthesizer.kt" "$M/PocketText.kt" "$M/PocketTokenizer.kt" "$M/PocketRecovery.kt" "$M/PocketAudio.kt"
  "$H/LiteRtShim.kt" "$H/AndroidHalf.kt" "$H/HostDriver.kt")
if [ -n "${KOTLINC:-}" ]; then
  "$KOTLINC" -language-version 2.2 -api-version 2.2 -jvm-target 17 -d "$OUT/classes" "${SOURCES[@]}"
  RUNTIME="$OUT/classes:$(dirname "$(command -v "$KOTLINC")")/../lib/kotlin-stdlib.jar"
else
  java -cp "$KOTLIN_COMPILER_JAR" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -language-version 2.2 -api-version 2.2 \
    -jvm-target 17 -cp "$KOTLIN_COMPILER_JAR" -d "$OUT/classes" "${SOURCES[@]}"
  RUNTIME="$OUT/classes:$KOTLIN_COMPILER_JAR"
fi
mkdir -p "$OUT/wav"
export SHIM_PY="$PYTHON" SHIM_SERVER="$H/server.py"
java -cp "$RUNTIME" expo.modules.carekoshvoice.HostDriverKt "$ASSETS" "$OUT/wav" speak
SHIM_FAIL_GPU=pt_mimi_deconly_fp16.tflite java -cp "$RUNTIME" expo.modules.carekoshvoice.HostDriverKt "$ASSETS" "$OUT/wav" vocoder-gpu-fails
