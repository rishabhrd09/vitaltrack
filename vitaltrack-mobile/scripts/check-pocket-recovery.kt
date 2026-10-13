package expo.modules.carekoshvoice

import java.util.concurrent.atomic.AtomicLong
import kotlin.math.PI
import kotlin.math.sin

/**
 * Pure-JVM checks for the offline Alba voice: generation bounds, placement policy, waveform
 * validation, playback framing, the streaming writer (against a fake AudioTrack that honours a start
 * threshold) and bounded diagnostics. Not an Android device test.
 */
private class FakeTrack(
    override val capacityFrames: Int,
    override val startThresholdFrames: Int,
    private val failWrite: Boolean = false,
    private val stallAtShort: Int = -1, // stop rendering this many frames before the end
) : PocketTrack {
    var buffered = 0; var rendered = 0L; var written = 0L; var played = false; var flushed = false; var released = false
    private var started = false; private var under = 0
    override fun play() { played = true }
    override val isPlaying get() = played && !flushed
    @Synchronized override fun write(pcm: ShortArray, offset: Int, count: Int): Int {
        if (failWrite) return -6
        val n = minOf(count, capacityFrames - buffered)
        buffered += n; written += n
        return n
    }
    override val renderedFrames: Long @Synchronized get() {
        if (played && !flushed && !started && buffered >= startThresholdFrames) started = true
        if (started && !flushed) {
            val limit = if (stallAtShort >= 0) written - stallAtShort else Long.MAX_VALUE
            val n = minOf(buffered.toLong(), 480L, maxOf(0L, limit - rendered)).toInt()
            if (n == 0 && rendered < written) under++
            buffered -= n; rendered += n
        }
        return rendered
    }
    override val underruns get() = under
    override val stateLabel get() = if (isPlaying) "initialized/playing" else "initialized/stopped"
    override val routeLabel get() = "Fake speaker"
    @Synchronized override fun stopNow() { flushed = true; buffered = 0 }
    override fun release() { released = true }
}

private fun speech(seconds: Double, dbfs: Double = -20.0) = FloatArray((24000 * seconds).toInt()) { i ->
    val amplitude = Math.pow(10.0, dbfs / 20.0) * Math.sqrt(2.0)
    (amplitude * sin(2 * PI * 220 * i / 24000.0) * (0.6 + 0.4 * sin(2 * PI * 3 * i / 24000.0))).toFloat()
}

private inline fun <reified T : Throwable> fails(message: String, block: () -> Unit): T {
    try { block() } catch (e: Throwable) { if (e is T) return e; throw AssertionError("$message: wrong ${e.javaClass.simpleName}: ${e.message}", e) }
    throw AssertionError("$message: accepted")
}

fun main() {
    // --- Generation bounds (a slower valid sentence must not be truncated) -------------------
    check(pocketFrameBudget(300, 256) == 256 && pocketFrameBudget(200, 256) == 200)
    check(pocketSentenceFinished(90, 93, 3, 256))
    check(!pocketSentenceFinished(90, 75, 3, 75) && !pocketSentenceFinished(-1, 100, 3, 256) && !pocketSentenceFinished(254, 256, 3, 256))
    // pocket-tts PR #319: an early EOS during the leading pause of a short text is ignored.
    check(!pocketEosAccepted(0, 5f, -4f) && !pocketEosAccepted(5, 5f, -4f))
    check(pocketEosAccepted(6, -3.9f, -4f) && !pocketEosAccepted(6, -4f, -4f) && !pocketEosAccepted(40, -4.5f, -4f))

    // --- Placement: the vocoder has no CPU option (≈10 GB on LiteRT 2.1.6) --------------------
    val default = PocketPlacement.DEFAULT
    check(default.lm == PocketDevice.CPU && default.decoderTransformer == PocketDevice.CPU && default.vocoderPrecision == PocketGpuPrecision.DEFAULT)
    check(PocketPlacement.named("default") == default && PocketPlacement.named("lm_gpu").lm == PocketDevice.GPU)
    check(PocketPlacement.named("vocoder_fp32").vocoderPrecision == PocketGpuPrecision.FP32)
    fails<IllegalArgumentException>("unknown placement") { PocketPlacement.named("all_cpu") }
    check(default.label.contains("vocoder GPU") && PocketVocoderUnavailable(RuntimeException("x")).message!!.contains("Device voice"))

    // --- Waveform validation ------------------------------------------------------------------
    for (bad in listOf(floatArrayOf(), FloatArray(24000 * 91))) fails<IllegalArgumentException>("invalid length") { pocketAudioLevels(bad) }
    fails<IllegalArgumentException>("non-finite") { pocketAudioLevels(speech(1.0).also { it[10] = Float.NaN }) }
    fails<IllegalArgumentException>("all zero") { pocketAudioLevels(FloatArray(24000)) }
    fails<IllegalArgumentException>("single spike (old peak-only check)") { pocketAudioLevels(FloatArray(24000).also { it[100] = 0.5f }) }
    val quiet = fails<IllegalArgumentException>("−60 dBFS near-silence (passed the old −80 dBFS floor)") { pocketAudioLevels(speech(2.0, -60.0)) }
    check(quiet.message!!.contains("inaudible") && quiet.message!!.contains("dBFS"))
    val healthy = pocketAudioLevels(speech(2.0, -20.0)) // the 0.6–1.0 envelope lowers RMS to about −23.6 dBFS
    check(healthy.rmsDbfs in -24.5..-22.5 && healthy.activeRatio > 0.9 && healthy.nonFinite == 0)
    check(pocketAudioLevels(pocketOutputTone()).rmsDbfs > -25) // the output-check tone remains valid
    check(pocketMeasure(floatArrayOf(Float.NaN, 0.5f)).nonFinite == 1) // measuring reports, never throws
    check(pocketPcm16(floatArrayOf(-1f, -0.5f, 0.5f, 1f, 2f).let { speech(1.0) + it }).takeLast(5)
        == listOf<Short>(-32767, -16383, 16383, 32767, 32767))
    val tone = pocketOutputTone()
    check(tone.size == 12000 && tone.first() == 0f && tone.last() == 0f)

    // --- Framing: clips shorter than the start threshold are padded so playback always starts --
    check(pocketFraming(12000, 24000) == PocketFraming(POCKET_LEAD_IN_FRAMES, 24000 + 2400 - POCKET_LEAD_IN_FRAMES - 12000))
    check(pocketFraming(12000, 4800).tailPad == 0 && pocketFraming(48000, 24000).tailPad == 0)
    check(pocketPlaybackBudgetMs(24000, 1f) == 6_000L && pocketPlaybackBudgetMs(24000, 0.9f) > 6_000L)

    // --- Streaming writer against a fake AudioTrack ---------------------------------------------
    val clock = AtomicLong(0)
    val fakeClock = { clock.get() }
    val fakeSleep = { ms: Long -> clock.addAndGet(ms * 1_000_000); Thread.sleep(1) }
    fun stream(track: FakeTrack, chunks: List<FloatArray>, check: () -> Unit = {}): Triple<Long, Long, PocketFraming> {
        val streamer = PocketStreamer(track, 1f, check, fakeClock, fakeSleep)
        try { streamer.begin(); chunks.forEach(streamer::push); return streamer.finish() } finally { streamer.close() }
    }
    // Two streamed sentences render completely; lead-in included.
    val two = FakeTrack(24000, 4800)
    stream(two, listOf(speech(1.5), speech(2.0)))
    check(two.rendered == (POCKET_LEAD_IN_FRAMES + 36000 + 48000).toLong() && two.released)
    // The 0.5 s tone with a pre-API-31 threshold equal to the 1 s buffer: without the tail pad it never starts.
    val short = FakeTrack(24000, 24000)
    val (_, _, framing) = stream(short, listOf(pocketOutputTone()))
    check(framing.tailPad > 0 && short.rendered == short.written && short.rendered >= 24000)
    // A writer error surfaces instead of a silent "completed".
    fails<IllegalStateException>("AudioTrack write error") { stream(FakeTrack(24000, 4800, failWrite = true), listOf(speech(1.0))) }
    // Cancellation during playback flushes the track and ends with the cancellation error.
    var cancelled = false
    val cancelTrack = FakeTrack(24000, 4800)
    val stop = fails<IllegalStateException>("cancelled stream") {
        stream(cancelTrack, listOf(speech(1.0), speech(5.0))) { if (cancelTrack.rendered > 12000) cancelled = true; check(!cancelled) { "Voice operation cancelled" } }
    }
    check(stop.message == "Voice operation cancelled" && cancelTrack.flushed && cancelTrack.released)
    // A head that stops 1 000 frames short (some devices) still completes after a short stall…
    val nearly = FakeTrack(24000, 4800, stallAtShort = 1000)
    stream(nearly, listOf(speech(1.0)))
    check(nearly.rendered == nearly.written - 1000)
    // …but a head stuck far from the end fails within the clip budget instead of waiting forever.
    val stuck = fails<IllegalStateException>("stuck playback") { stream(FakeTrack(24000, 4800, stallAtShort = 20000), listOf(speech(1.5))) }
    check(stuck.message!!.contains("did not finish"))

    // --- Diagnostics: bounded, redacted, never the answer text -----------------------------------
    val lines = ArrayList<String>()
    val diagnostics = PocketDiagnostics("speech-123-1", sink = { lines.add(it) }, maxLines = 5)
    diagnostics.note("header")
    repeat(10) { diagnostics.note("line $it from /data/user/0/com.carekosh.mobile/no_backup/pack/x.tflite") }
    val text = diagnostics.text()
    check(text.lines().size == 7 && text.contains("header") && text.contains("6 earlier lines omitted") && !text.contains("/data/"))
    check(lines.size == 11 && lines.all { it.startsWith("speech-123-1 ") })
    fails<IllegalArgumentException>("unsafe operation id") { PocketDiagnostics("bad id\n") }

    println("Pocket native checks passed: EOS guard/bounds, GPU-only vocoder placement, speech-level validation, " +
        "start-threshold framing, streaming completion/cancellation/write-error/stall, bounded redacted diagnostics")
}
