package expo.modules.carekoshvoice

import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

/** Whole-waveform levels. `activeRatio` = share of 20 ms windows above −45 dBFS RMS. */
internal data class PocketAudioLevels(val peak: Float, val rms: Double, val activeRatio: Double, val nonFinite: Int, val samples: Int) {
    val rmsDbfs: Double get() = if (rms > 0) 20 * log10(rms) else -200.0
    fun describe(): String = "peak %.3f, RMS %.1f dBFS, active %.2f, non-finite %d".format(peak, rmsDbfs, activeRatio, nonFinite)
}

/**
 * Measured on the pinned Alba assets (host LiteRT 2.1.6, 13 Oct 2026): healthy replies sit near
 * −20 dBFS RMS with 0.76–0.83 active windows. The old −80 dBFS floor accepted near-silence, so a
 * finite but unusable waveform could be "played" without audible speech. Thresholds keep a wide
 * margin below real speech and never amplify corrupt output.
 */
internal const val POCKET_MIN_RMS_DBFS = -50.0
internal const val POCKET_MIN_ACTIVE_RATIO = 0.2

internal fun pocketMeasure(samples: FloatArray): PocketAudioLevels {
    var peak = 0f
    var energy = 0.0
    var nonFinite = 0
    var windowEnergy = 0.0
    var windowCount = 0
    var windows = 0
    var active = 0
    val activeEnergy = 480 * Math.pow(10.0, -45.0 / 10.0) // 20 ms window at −45 dBFS RMS
    for (sample in samples) {
        val value = if (sample.isFinite()) sample.coerceIn(-1f, 1f) else { nonFinite++; 0f }
        peak = maxOf(peak, abs(value))
        val square = value.toDouble() * value
        energy += square
        windowEnergy += square
        if (++windowCount == 480) {
            windows++
            if (windowEnergy > activeEnergy) active++
            windowEnergy = 0.0; windowCount = 0
        }
    }
    val rms = if (samples.isEmpty()) 0.0 else sqrt(energy / samples.size)
    return PocketAudioLevels(peak, rms, if (windows == 0) 0.0 else active.toDouble() / windows, nonFinite, samples.size)
}

/** Reject corrupt, silent or near-silent output before playback; report why, naming [voice]. */
internal fun pocketAudioLevels(samples: FloatArray, voice: String = "Alba"): PocketAudioLevels {
    require(samples.isNotEmpty() && samples.size <= 24000 * 90) { "Invalid $voice audio length" }
    val levels = pocketMeasure(samples)
    require(levels.nonFinite == 0) { "$voice returned invalid audio (${levels.nonFinite} non-finite samples)" }
    require(levels.rmsDbfs >= POCKET_MIN_RMS_DBFS && levels.activeRatio >= POCKET_MIN_ACTIVE_RATIO) {
        "$voice generated inaudible audio (${levels.describe()}). Your answer is still on screen"
    }
    return levels
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

/**
 * Frames written around the speech. A short lead-in lets Bluetooth/route start-up settle before the
 * first syllable. A streaming AudioTrack starts only once its start threshold is buffered (the full
 * buffer capacity by default before API 31), so the tail is padded past it: a clip shorter than the
 * buffer — the 0.5 s output check — otherwise may never start.
 */
internal data class PocketFraming(val leadIn: Int, val tailPad: Int)

internal const val POCKET_LEAD_IN_FRAMES = 2880 // 120 ms at 24 kHz

internal fun pocketFraming(speechFrames: Int, startThresholdFrames: Int): PocketFraming {
    require(speechFrames > 0 && startThresholdFrames in 1..24000 * 10)
    val written = POCKET_LEAD_IN_FRAMES + speechFrames
    val needed = startThresholdFrames + 2400 // plus 100 ms so the threshold is always crossed
    return PocketFraming(POCKET_LEAD_IN_FRAMES, maxOf(0, needed - written))
}

/** Generous but bounded wait for rendered frames: clip time plus 5 s (playback is always at 1×). */
internal fun pocketPlaybackBudgetMs(totalFrames: Int): Long {
    require(totalFrames > 0) { "Alba produced no audio" }
    return totalFrames * 1000L / 24000 + 5_000L
}

/**
 * Pauses at chunk joins, in milliseconds. Pace never time-stretches the voice (Android's stretcher
 * sounds metallic); "Relaxed" and "Brisk" change the pauses between sentences instead.
 */
internal data class PocketPauses(val firstLeadMs: Int, val leadMs: Int, val tailMs: Int)

internal fun pocketPauses(pace: Float): PocketPauses = when {
    pace < 0.95f -> PocketPauses(firstLeadMs = 80, leadMs = 160, tailMs = 420)   // Relaxed
    pace > 1.05f -> PocketPauses(firstLeadMs = 60, leadMs = 80, tailMs = 140)    // Brisk
    else -> PocketPauses(firstLeadMs = 80, leadMs = 120, tailMs = 240)           // Natural
}

/** 10 ms windows above −55 dBFS RMS count as sound: low enough to keep soft onsets and breath. */
private const val JOIN_WINDOW = 240
private val JOIN_ACTIVE_ENERGY = JOIN_WINDOW * Math.pow(10.0, -55.0 / 10.0)

/**
 * Each chunk starts and ends with model-made silence (about 0.4 s and 0.3 s), so joins became
 * full-stop pauses. Trim each side to the pace's pause, never into sound; all-quiet audio is left
 * unchanged for the level check to reject.
 */
internal fun pocketTrimJoin(samples: FloatArray, first: Boolean, pauses: PocketPauses): FloatArray {
    fun active(start: Int): Boolean {
        var energy = 0.0
        for (i in start until minOf(samples.size, start + JOIN_WINDOW)) energy += samples[i].toDouble() * samples[i]
        return energy > JOIN_ACTIVE_ENERGY
    }
    var start = 0
    while (start < samples.size && !active(start)) start += JOIN_WINDOW
    if (start >= samples.size) return samples
    var end = samples.size
    while (end > start && !active(maxOf(start, end - JOIN_WINDOW))) end -= JOIN_WINDOW
    val lead = (if (first) pauses.firstLeadMs else pauses.leadMs) * 24
    val from = maxOf(0, start - lead)
    val to = minOf(samples.size, end + pauses.tailMs * 24)
    return if (from == 0 && to == samples.size) samples else samples.copyOfRange(from, to)
}

/**
 * Gentle loudness evening: towards −18 dBFS RMS with at most +4 dB of gain, and never past a 0.9
 * peak, so nothing clips. Quieter or corrupt audio is never boosted into acceptance: the level
 * check runs on the original samples first.
 */
internal fun pocketEvenLoudness(samples: FloatArray): FloatArray {
    val levels = pocketMeasure(samples)
    if (levels.rms <= 0.0 || levels.peak <= 0f || levels.nonFinite > 0) return samples
    val peak = samples.maxOf { abs(it) } // measurement clamps to PCM range; headroom needs the actual peak
    val gain = minOf(maxOf(1.0, Math.pow(10.0, -18.0 / 20.0) / levels.rms), 0.9 / peak, 1.585).toFloat()
    // Loud input still needs attenuation when its peak exceeds the shared headroom limit.
    if (gain in 0.99f..1.01f && peak <= 0.9f) return samples
    return FloatArray(samples.size) { samples[it] * gain }
}
