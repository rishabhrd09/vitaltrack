package expo.modules.carekoshvoice

import android.os.Build
import android.system.Os
import java.io.File

/** Only completed recordings enter this runtime; no capture, tools, LLM or network API is used. */
internal object WhistleRuntime {
    const val name = "Whistle · experimental English · offline"
    val supported get() = BuildConfig.WHISTLE_ENABLED && Build.SUPPORTED_ABIS.firstOrNull() == "arm64-v8a"
    private var loaded = false

    /** Set BOTH upstream opt-outs before dlopen/static initializers, and refuse to load if they fail. */
    fun configureTelemetry(): Boolean {
        require(supported) { "Whistle is available only in the ARM64 diagnostic APK" }
        Os.setenv("NEEDLE_TELEMETRY", "0", true)
        Os.setenv("DO_NOT_TRACK", "1", true)
        check(Os.getenv("NEEDLE_TELEMETRY") == "0" && Os.getenv("DO_NOT_TRACK") == "1") { "Could not disable Whistle telemetry" }
        return true
    }

    @Synchronized private fun ensureLoaded() {
        configureTelemetry()
        if (!loaded) {
            System.loadLibrary("carekosh_whistle")
            loaded = true
        }
    }

    fun transcribe(model: File, samples: FloatArray, check: () -> Unit): String {
        require(samples.size in 4800..448000 && samples.all { it.isFinite() && it in -1f..1f }) { "Use a mono 16 kHz recording of 0.3 to 28 seconds" }
        check()
        ensureLoaded()
        check()
        val result = nativeTranscribe(model.path, samples).toString(Charsets.UTF_8)
        check() // Native C API has no abort callback: cancellation discards a late result.
        return parseWhistleTranscript(result)
    }

    private external fun nativeTranscribe(modelPath: String, samples: FloatArray): ByteArray
}
