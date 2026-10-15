package expo.modules.carekoshvoice

import ai.moonshine.voice.TranscriberOption
import android.content.Context
import java.io.Closeable
import java.io.File
import java.util.Locale
import kotlin.math.abs

/**
 * Kokoro is weak on very short inputs (under about 10–20 phoneme tokens), so a sentence of fewer than
 * [minWords] words joins its neighbour while chunks stay under [maxChars]. A longer first sentence stays
 * on its own, so audio starts sooner.
 */
internal fun kokoroChunks(sentences: List<String>, minWords: Int = 4, maxChars: Int = 280): List<String> {
    fun words(s: String) = s.split(Regex("\\s+")).count { it.isNotEmpty() }
    val chunks = ArrayList<String>()
    var current = ""
    for (sentence in sentences.map { it.trim() }.filter { it.isNotEmpty() }) {
        if (current.isEmpty()) { current = sentence; continue }
        if (words(current) >= minWords || current.length + 1 + sentence.length > maxChars) { chunks.add(current); current = sentence }
        else current = "$current $sentence"
    }
    if (current.isNotEmpty()) {
        val last = chunks.lastOrNull()
        if (last != null && words(current) < minWords && last.length + 1 + current.length <= maxChars) chunks[chunks.size - 1] = "$last $current"
        else chunks.add(current)
    }
    return chunks
}

/** Kokoro-82M speaks at 24 kHz, the rate of CareKosh's playback path. */
private const val KOKORO_SAMPLE_RATE = 24_000

/**
 * British voices (bf_, bm_) need the en_gb profile: moonshine-voice 0.1.5 does not offer them under en_us,
 * and serves en_gb from the same en_us G2P files (checked on the host with the pinned files).
 */
internal fun kokoroLanguage(voice: String) = if (voice.startsWith("b")) "en_gb" else "en_us"

/** Kokoro normalises replies to full scale; keep Alba's 0.9 peak headroom so phone speakers never clip. */
internal fun kokoroHeadroom(samples: FloatArray): FloatArray {
    var peak = 0f
    for (sample in samples) peak = maxOf(peak, abs(sample))
    if (peak <= 0.9f) return samples
    val gain = 0.9f / peak
    return FloatArray(samples.size) { samples[it] * gain }
}

// Only standalone quantities: dates, versions and item codes such as 15.10.2026,
// v1.2.3, AB.12.5 and 1.5x must retain their original spelling.
private val DECIMAL = Regex("""(?<![\p{L}\p{N}_.-])(\d+)\.(\d+)(?![\p{L}\p{N}_-]|\.\d)""")
private val US_SPELLINGS = listOf("litre", "millilitre", "metre", "centimetre", "millimetre")
    .flatMap { listOf(it to it.dropLast(2) + "er", it + "s" to it.dropLast(2) + "ers") }

/**
 * Moonshine's English G2P reads "12.5" as "12 up 5" and guesses British spellings missing from its US
 * dictionary ("litres" was heard as "lighters"), so decimals become "12 point 5" and those spellings their
 * US forms. Measured with Whisper on the pinned files on the host, 15 Oct 2026. Kokoro only: Alba, Sarvam
 * and the device voice read decimals correctly.
 */
internal fun kokoroText(text: String): String {
    var out = DECIMAL.replace(text) { "${it.groupValues[1]} point ${it.groupValues[2].toList().joinToString(" ")}" }
    for ((british, us) in US_SPELLINGS) {
        out = out.replace(Regex("\\b$british\\b", RegexOption.IGNORE_CASE)) { if (it.value[0].isUpperCase()) us.replaceFirstChar(Char::uppercaseChar) else us }
    }
    return out
}

/** Kokoro's speed for the saved pace: 0.9 is calmer, 1.1 brisker. */
internal fun kokoroSpeed(pace: Double): String {
    require(pace in 0.85..1.15) { "Invalid speech pace" }
    return String.format(Locale.ROOT, "%.2f", pace)
}

/**
 * Moonshine's TextToSpeech in synthesis-only mode over the pinned [KokoroPack] folder: modelsFrom means
 * the library never downloads, synthesize() never plays (CareKosh's own AudioTrack path does), and no
 * cloning API is ever called. Offline voice lane only.
 */
internal class KokoroEngine(context: Context, root: File, val voice: String) : Closeable {
    private val language = kokoroLanguage(voice)
    private val tts = ai.moonshine.voice.TextToSpeech(context).language(language).voice("kokoro_$voice").modelsFrom(root)
    val loadMs: Long

    init {
        val start = System.nanoTime()
        try { tts.load() } catch (e: Throwable) { tts.close(); throw e }
        loadMs = (System.nanoTime() - start) / 1_000_000
    }

    /** Kokoro-ready text, the library's own sentence splitter (it knows abbreviations), then short sentences merged. */
    fun chunks(text: String): List<String> {
        val ready = kokoroText(text)
        val sentences = try { ai.moonshine.voice.TextToSpeech.splitUtterances(language, ready) } catch (_: RuntimeException) { listOf(ready) }
        return kokoroChunks(sentences.ifEmpty { listOf(ready) })
    }

    fun synthesize(text: String, pace: Double): FloatArray {
        val result = tts.synthesize(text, listOf(TranscriberOption("speed", kokoroSpeed(pace))))
        require(result.sampleRateHz == KOKORO_SAMPLE_RATE && result.samples.isNotEmpty()) { "Kokoro returned audio in an unexpected format" }
        return result.samples
    }

    override fun close() = tts.close()
}
