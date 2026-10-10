package expo.modules.carekoshvoice

import kotlin.math.abs
import kotlin.math.sin
import kotlin.math.sqrt

internal data class PocketAudioLevels(val peak: Float, val rms: Double)

/** Validate the whole waveform, not just one non-zero sample. Never amplify corrupt output. */
internal fun pocketAudioLevels(samples: FloatArray): PocketAudioLevels {
    require(samples.isNotEmpty() && samples.size <= 24000 * 90) { "Invalid Alba audio length" }
    var peak = 0f
    var energy = 0.0
    for (sample in samples) {
        require(sample.isFinite()) { "Alba returned invalid audio" }
        val bounded = sample.coerceIn(-1f, 1f)
        peak = maxOf(peak, abs(bounded))
        energy += bounded.toDouble() * bounded
    }
    val rms = sqrt(energy / samples.size)
    require(rms >= 0.0001) { "Alba generated inaudible audio. Try Preview voice again" }
    return PocketAudioLevels(peak, rms)
}

/** Android's standard PCM16 format; keep the same 24 kHz mono waveform and pitch. */
internal fun pocketPcm16(samples: FloatArray): ShortArray {
    pocketAudioLevels(samples)
    return ShortArray(samples.size) { (samples[it].coerceIn(-1f, 1f) * 32767f).toInt().toShort() }
}

/** Short, faded tone isolates playback from model generation; it never records or uploads audio. */
internal fun pocketOutputTone(): FloatArray = FloatArray(12000) { i ->
    val fade = minOf(1.0, i / 480.0, (11999 - i) / 480.0)
    (0.15 * fade * sin(2.0 * Math.PI * 440.0 * i / 24000.0)).toFloat()
}
