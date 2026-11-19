package expo.modules.carekoshvoice

import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.PI
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Pure-JVM checks for the offline Alba voice: generation bounds, placement policy, waveform
 * validation, playback framing, the streaming writer (against a fake AudioTrack that honours a start
 * threshold and drains on stop), focus and engine policies, sentence chunking with a synthetic
 * tokenizer, join trimming, loudness, resumable downloads and bounded diagnostics. Not an Android
 * device test.
 */
private class FakeTrack(
    override val capacityFrames: Int,
    override val startThresholdFrames: Int,
    private val failWrite: Boolean = false,
    private val stallAtShort: Int = -1, // stop rendering this many frames before the end
) : PocketTrack {
    var buffered = 0; var rendered = 0L; var written = 0L; var played = false; var flushed = false; var released = false
    var draining = false; var lastGain = 1f
    private var started = false; private var under = 0
    override fun play() { played = true }
    override val isPlaying get() = played && !flushed && !draining
    @Synchronized override fun write(pcm: ShortArray, offset: Int, count: Int): Int {
        if (failWrite) return -6
        val n = minOf(count, capacityFrames - buffered)
        buffered += n; written += n
        return n
    }
    override val renderedFrames: Long @Synchronized get() {
        // Real non-offloaded AudioTrack.stop() resets its public playback head immediately.
        // Keep `rendered` separately as a cumulative test observation of frames presented.
        if (draining) return 0
        if (played && !flushed && !started && (buffered >= startThresholdFrames || draining)) started = true
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
    @Synchronized override fun drainAndStop() { draining = true }
    override fun setGain(gain: Float) { lastGain = gain }
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

/** A complete 4000-piece table whose normal pieces are single characters (with and without "▁"). */
private fun syntheticTokenizer(): PocketTokenizer {
    val file = File.createTempFile("pocket-tokenizer", ".tsv")
    val rows = ArrayList<String>()
    for (b in 0 until 256) rows.add("$b\t6\t0\t<0x%02X>".format(b))
    rows.add("256\t2\t0\t<unk>")
    var id = 257
    for (c in 32..126) {
        val ch = c.toChar().toString().replace("\\", "\\\\")
        rows.add("${id++}\t1\t-1\t$ch")
        rows.add("${id++}\t1\t-1\t▁$ch")
    }
    rows.add("${id++}\t1\t-1\t▁")
    while (id < 4000) rows.add("${id++}\t1\t-100\tunused$id")
    file.writeText(rows.joinToString("\n"))
    return PocketTokenizer(file).also { file.delete() }
}

private class FakeConnection(private val body: ByteArray, private val code: Int, private val range: String?) : HttpURLConnection(URL("https://example.invalid/pack")) {
    override fun getResponseCode() = code
    override fun getInputStream() = body.inputStream()
    override fun getHeaderField(name: String?) = if (name == "Content-Range") range else null
    override fun connect() {}
    override fun disconnect() {}
    override fun usingProxy() = false
}

fun main() {
    // A blocked network request must not occupy either engine's serial worker.
    val downloadLane = VoiceWorkLane("check-download")
    val captureLane = VoiceWorkLane("check-capture")
    val voiceLane = VoiceWorkLane("check-voice")
    val downloading = CountDownLatch(1)
    val releaseDownload = CountDownLatch(1)
    try {
        downloadLane.executor.execute { downloading.countDown(); releaseDownload.await() }
        check(downloading.await(1, TimeUnit.SECONDS))
        check(captureLane.executor.submit<Boolean> { true }.get(1, TimeUnit.SECONDS))
        check(voiceLane.executor.submit<Boolean> { true }.get(1, TimeUnit.SECONDS))
    } finally {
        releaseDownload.countDown()
        listOf(downloadLane, captureLane, voiceLane).forEach { it.executor.shutdownNow() }
    }
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
    check(pocketPlaybackBudgetMs(24000) == 6_000L) // playback is always 1×: pace is spoken as pauses

    // --- Streaming writer against a fake AudioTrack ---------------------------------------------
    val clock = AtomicLong(0)
    val fakeClock = { clock.get() }
    val fakeSleep = { ms: Long -> clock.addAndGet(ms * 1_000_000); Thread.sleep(1) }
    fun stream(track: FakeTrack, chunks: List<FloatArray>, check: () -> Unit = {}): Triple<Long, Long, PocketFraming> {
        val streamer = PocketStreamer(track, check, fakeClock, fakeSleep)
        try {
            streamer.begin(); chunks.forEach(streamer::push)
            return streamer.finish().also {
                check(streamer.finishedByDrain && track.renderedFrames == 0L)
                check(streamer.completedFrames == track.rendered && streamer.completedFrames > 0)
            }
        } finally { streamer.close() }
    }
    // Two streamed sentences render completely; lead-in included.
    val two = FakeTrack(24000, 4800)
    stream(two, listOf(speech(1.5), speech(2.0)))
    check(two.rendered == (POCKET_LEAD_IN_FRAMES + 36000 + 48000).toLong() && two.released && two.draining)
    // The 0.5 s tone with a pre-API-31 threshold equal to the 1 s buffer: without the tail pad it never starts.
    val short = FakeTrack(24000, 24000)
    val (_, _, framing) = stream(short, listOf(pocketOutputTone()))
    check(framing.tailPad > 0 && short.rendered == short.written && short.rendered >= 24000)
    // A writer error surfaces instead of a silent "completed".
    fails<IllegalStateException>("AudioTrack write error") { stream(FakeTrack(24000, 4800, failWrite = true), listOf(speech(1.0))) }
    // Cancellation during playback flushes the track and ends with the cancellation error.
    var cancelled = false
    val cancelTrack = FakeTrack(24000, 4800)
    val stop = fails<VoiceCancelled>("cancelled stream") {
        stream(cancelTrack, listOf(speech(1.0), speech(5.0))) { if (cancelTrack.rendered > 12000) cancelled = true; if (cancelled) throw VoiceCancelled() }
    }
    check(stop.code == "SPEECH_CANCELLED" && cancelTrack.flushed && cancelTrack.released)
    // A head that stops 1 000 frames short (some devices) still completes after a short stall…
    val nearly = FakeTrack(24000, 4800, stallAtShort = 1000)
    stream(nearly, listOf(speech(1.0)))
    check(nearly.rendered == nearly.written - 1000)
    // …but a head stuck far from the end fails within the clip budget instead of waiting forever.
    val stuck = fails<VoiceTimedOut>("stuck playback") { stream(FakeTrack(24000, 4800, stallAtShort = 20000), listOf(speech(1.5))) }
    check(stuck.message!!.contains("did not finish") && pocketKeepsEngine(stuck))

    // --- Focus and engine policy (V-28) ----------------------------------------------------------
    check(pocketFocusAction(-3) == PocketFocusAction.DUCK && pocketFocusAction(1) == PocketFocusAction.RESTORE)
    check(pocketFocusAction(-2) == PocketFocusAction.STOP && pocketFocusAction(-1) == PocketFocusAction.STOP && pocketFocusAction(2) == PocketFocusAction.IGNORE)
    check(listOf(VoiceCancelled(), VoiceInterrupted("x"), VoiceAudioUnavailable("x"), VoiceTimedOut("x")).all(::pocketKeepsEngine))
    check(!pocketKeepsEngine(IllegalStateException("inference")) && !pocketKeepsEngine(PocketVocoderUnavailable(RuntimeException("gpu"))))
    check(PocketVocoderUnavailable(RuntimeException("gpu")).code == "ENGINE_UNAVAILABLE")

    // --- End punctuation: pocket-tts PR #296 (V-36) ----------------------------------------------
    for ((written, prepared) in listOf("Hello" to "Hello.", "Hello," to "Hello.", "Low stock:" to "Low stock.", "Wait;" to "Wait.",
            "Wait -" to "Wait.", "Masks — " to "Masks.", "He said \"yes\"" to "He said \"yes\".", "(10 ml)" to "(10 ml).", "5%" to "5%.",
            "Done!" to "Done!", "\"Done.\"" to "\"Done.\"", "Really?" to "Really?", "Wait…" to "Wait…", "Saline 0.9" to "Saline 0.9."))
        check(pocketTerminalPunctuation(written) == prepared) { "$written -> ${pocketTerminalPunctuation(written)}" }

    // --- Chunking with a synthetic character tokenizer (V-36) ------------------------------------
    val chunker = PocketText(syntheticTokenizer())
    fun tokens(chunk: String) = chunker.encode(chunker.prepare(chunk).first).size
    val list = "Low stock: 3 items. Hand gloves, 2 pairs; masks, 0 boxes; saline, 4 bottles."
    val listChunks = chunker.chunks(list)
    check(listChunks.all { tokens(it) <= PocketText.MAX_TOKENS_PER_CHUNK }) { listChunks.toString() }
    check(listChunks.none { it.split(" ").size == 1 }) { "no one-word chunks: $listChunks" }
    check(listChunks.any { it.contains("Hand gloves, 2 pairs; masks, 0 boxes") }) { "a list clause stays together: $listChunks" }
    val three = chunker.chunks("First sentence is here. Second sentence is here. Third one is here too.")
    check(three.first() == "First sentence is here." && three.size == 2) { "a short first chunk, then packing up to 50: $three" }
    check(chunker.chunks("Saline 0.9 percent is low.").size == 1)
    val long = chunker.chunks((1..30).joinToString(" ") { "word$it" })
    check(long.size > 1 && long.all { tokens(it) <= PocketText.MAX_TOKENS_PER_CHUNK }) { long.toString() }
    check(tokens(long.first()) <= PocketText.FIRST_CHUNK_TOKENS) { "the first long clause obeys the 32-token cap: $long" }

    // --- Join trimming and loudness (V-36, V-39) -------------------------------------------------
    fun quiet(seconds: Double) = FloatArray((24000 * seconds).toInt())
    val padded = quiet(0.4) + speech(1.0) + quiet(0.3)
    val natural = pocketPauses(1f)
    val firstJoin = pocketTrimJoin(padded, first = true, pauses = natural)
    check(firstJoin.size in (24000 * (0.08 + 1.0 + 0.24)).toInt() - 480..(24000 * (0.08 + 1.0 + 0.24)).toInt() + 480) { "first ${firstJoin.size}" }
    val laterJoin = pocketTrimJoin(padded, first = false, pauses = natural)
    check(laterJoin.size > firstJoin.size && laterJoin.size < padded.size)
    val relaxed = pocketTrimJoin(padded, first = false, pauses = pocketPauses(0.9f))
    val brisk = pocketTrimJoin(padded, first = false, pauses = pocketPauses(1.1f))
    check(relaxed.size > laterJoin.size && brisk.size < laterJoin.size)
    check(pocketTrimJoin(quiet(1.0), true, natural).size == 24000) { "all-quiet audio is left for the level check" }
    check(pocketTrimJoin(speech(1.0), true, natural).size == 24000) { "no silence, nothing trimmed" }
    // speech(x) measures about x − 3.6 dBFS because of its envelope.
    val soft = speech(1.0, -26.0)
    val evened = pocketEvenLoudness(soft)
    check(pocketMeasure(evened).rmsDbfs - pocketMeasure(soft).rmsDbfs in 3.9..4.1 && pocketMeasure(evened).peak <= 0.9001f) { "gain is capped at +4 dB: ${pocketMeasure(evened).describe()}" }
    val near = pocketEvenLoudness(speech(1.0, -16.4))
    check(pocketMeasure(near).rmsDbfs in -18.2..-17.8) { "reaches −18 dBFS: ${pocketMeasure(near).describe()}" }
    val loud = speech(1.0, -12.0)
    check(pocketEvenLoudness(loud) === loud) { "already loud audio is unchanged" }
    val spiky = speech(1.0, -30.0).also { it[100] = 0.85f }
    check(pocketMeasure(pocketEvenLoudness(spiky)).peak <= 0.9001f) { "gain never clips a peak" }
    val fullPeak = speech(1.0, -12.0).also { it[100] = 1f }
    check(pocketMeasure(pocketEvenLoudness(fullPeak)).peak <= 0.9001f) { "already loud input is attenuated to the same headroom" }
    val overRange = fullPeak.copyOf().also { it[100] = 2f }
    check(pocketEvenLoudness(overRange).all { it in -0.9001f..0.9001f }) { "headroom uses actual sample peaks, not their clipped measurement" }

    // --- Resumable downloads (V-31) -----------------------------------------------------------------
    val payload = ByteArray(100) { it.toByte() }
    val folder = File.createTempFile("carekosh-download", "").also { it.delete(); it.mkdirs() }
    try {
        val partial = File(folder, "pack.part").also { it.writeBytes(payload.copyOf(40)) }
        var asked = -1L
        downloadResumable(partial, 100, {}, { start -> asked = start; FakeConnection(payload.copyOfRange(40, 100), 206, "bytes 40-99/100") }) {}
        check(asked == 40L && partial.readBytes().contentEquals(payload)) { "resumed from byte 40" }
        partial.writeBytes(payload.copyOf(40))
        downloadResumable(partial, 100, {}, { FakeConnection(payload, 200, null) }) {}
        check(partial.readBytes().contentEquals(payload)) { "a server that ignores Range restarts the file" }
        partial.writeBytes(payload.copyOf(40))
        downloadResumable(partial, 100, {}, { FakeConnection(payload, 206, "bytes 0-99/100") }) {}
        check(partial.readBytes().contentEquals(payload)) { "a range that does not match the kept part restarts the file" }
        partial.delete()
        fails<VoiceDownloadFailed>("oversized download") { downloadResumable(partial, 50, {}, { FakeConnection(payload, 200, null) }) {} }
        val cancelledAt = fails<VoiceCancelled>("cancelled download") {
            var reads = 0
            downloadResumable(partial, 100, { if (++reads > 1) throw VoiceCancelled() }, { FakeConnection(payload, 200, null) }) {}
        }
        check(cancelledAt.code == "SPEECH_CANCELLED" && partial.isFile) { "an interrupted download keeps its partial file" }
        check(rangeStartOf("bytes 40-99/100") == 40L && rangeStartOf("bytes */100") == -1L && rangeStartOf(null) == -1L)
        check(missingBytes(listOf(100L to 40L, 50L to 0L, 10L to 99L)) == 110L)
    } finally { folder.deleteRecursively() }

    // --- Voice-state packing (V-40) -----------------------------------------------------------------
    // fp16 rounding is numpy's: ties go to the even neighbour, in normal and subnormal ranges.
    val halves = mapOf(1f to 0x3c00, -0f to 0x8000, 65504f to 0x7bff, 65520f to 0x7c00, Math.scalb(1f, -24) to 0x0001,
        Math.scalb(1f, -25) to 0x0000, 3 * Math.scalb(1f, -25) to 0x0002, 1 + Math.scalb(1f, -11) to 0x3c00,
        1 + 3 * Math.scalb(1f, -11) to 0x3c02, 1e-8f to 0x0000, -2.5f to 0xc100)
    halves.forEach { (value, bits) -> check(pocketHalf(value).toInt() and 0xffff == bits) { "half($value) = ${"%04x".format(pocketHalf(value))}" } }
    check(packPocketVoiceState(syntheticVoiceState(frames = 3, capacity = 4)).contentEquals(expectedVoiceBin(frames = 3, capacity = 4))) {
        "packs layer, head, frame and de-interleaved key order"
    }
    check(packPocketVoiceState(syntheticVoiceState(frames = 2, capacity = 2, pad = null)).size == 4 + 2 * 96 * 2 * 64 * 2) { "older files without pad" }
    fails<IllegalArgumentException>("padded state") { packPocketVoiceState(syntheticVoiceState(3, 4, pad = 1)) }
    fails<IllegalArgumentException>("offset past capacity") { packPocketVoiceState(syntheticVoiceState(5, 4)) }
    fails<IllegalArgumentException>("non-finite value") { packPocketVoiceState(syntheticVoiceState(3, 4, poison = Float.NaN)) }
    fails<IllegalArgumentException>("out of fp16 range") { packPocketVoiceState(syntheticVoiceState(3, 4, poison = 70000f)) }
    fails<IllegalArgumentException>("unexpected tensor") { packPocketVoiceState(syntheticVoiceState(3, 4, extra = "speaker_proj_weight")) }
    fails<IllegalArgumentException>("truncated file") { packPocketVoiceState(syntheticVoiceState(3, 4).let { it.copyOf(it.size - 4) }) }
    fails<IllegalArgumentException>("escaped header text") { packPocketVoiceState(syntheticVoiceState(3, 4, extra = "a\\\"b")) }
    check(packPocketVoiceState(syntheticVoiceState(3, 4, padding = true)).contentEquals(expectedVoiceBin(3, 4))) { "header space padding" }

    // --- Kokoro test voice (V-41): short sentences merge; pace is Kokoro's own speed ---------------
    check(kokoroChunks(listOf("Yes.", "Done.")) == listOf("Yes. Done.")) { "one-word replies are spoken together" }
    check(kokoroChunks(listOf("Low stock: 1 item.", "Surgical Mask: 3 boxes.")) == listOf("Low stock: 1 item.", "Surgical Mask: 3 boxes.")) { "full sentences stay separate" }
    check(kokoroChunks(listOf("Hello.", "I am your CareKosh stock assistant.", "Okay.")) == listOf("Hello. I am your CareKosh stock assistant. Okay.")) { "short sentences join a neighbour" }
    val longSentence = "Gloves, " + "masks, ".repeat(40) + "and syringes."
    check(kokoroChunks(listOf("Note.", longSentence)).let { it.size == 2 && it[1] == longSentence }) { "chunks stay under the length cap" }
    check(kokoroChunks(listOf("  ", "", "Draft cleared.")) == listOf("Draft cleared.")) { "blank pieces are dropped" }
    check(kokoroSpeed(0.9) == "0.90" && kokoroSpeed(1.0) == "1.00" && kokoroSpeed(1.1) == "1.10")
    fails<IllegalArgumentException>("speed outside the pace choices") { kokoroSpeed(2.0) }
    check(kokoroLanguage("af_heart") == "en_us" && kokoroLanguage("bf_emma") == "en_gb")
    check(kokoroText("Saline 0.9 percent: 12.5 Litres and 3.25 millilitres left.") == "Saline 0 point 9 percent: 12 point 5 Liters and 3 point 2 5 milliliters left.") { kokoroText("Saline 0.9 percent: 12.5 Litres and 3.25 millilitres left.") }
    check(kokoroText("Gloves: 4 boxes. Masks: 12.") == "Gloves: 4 boxes. Masks: 12.") { "sentence ends are not decimals" }
    for (text in listOf("Expiry 15.10.2026", "Version 1.2.3", "Item AB.12.5", "Item AB-12.5", "Rate 1.5x"))
        check(kokoroText(text) == text) { "dates and codes retain their spelling: $text -> ${kokoroText(text)}" }
    check(kokoroText("Quantity: 12.5.") == "Quantity: 12 point 5.") { "a decimal before sentence punctuation still works" }
    val fullScale = speech(1.0, -6.0).also { it[10] = 1f }
    check(pocketMeasure(kokoroHeadroom(fullScale)).peak in 0.899f..0.9001f) { "full-scale replies get 0.9 peak headroom" }
    val moderate = speech(1.0, -20.0)
    check(kokoroHeadroom(moderate) === moderate) { "replies with headroom are unchanged" }

    // --- Diagnostics: bounded, redacted, never the answer text -----------------------------------
    val lines = ArrayList<String>()
    val diagnostics = PocketDiagnostics("speech-123-1", sink = { lines.add(it) }, maxLines = 5)
    diagnostics.note("header")
    repeat(10) { diagnostics.note("line $it from /data/user/0/com.carekosh.mobile/no_backup/pack/x.tflite") }
    val text = diagnostics.text()
    check(text.lines().size == 7 && text.contains("header") && text.contains("6 earlier lines omitted") && !text.contains("/data/"))
    check(lines.size == 11 && lines.all { it.startsWith("speech-123-1 ") })
    fails<IllegalArgumentException>("unsafe operation id") { PocketDiagnostics("bad id\n") }

    println("Pocket native checks passed: independent download/engine workers, EOS guard/bounds, GPU-only vocoder placement, speech-level validation, " +
        "start-threshold framing, streaming drain/completion/cancellation/write-error/stall, focus and engine policy, " +
        "end punctuation, chunking, join trimming, loudness, resumable downloads, voice-state packing, Kokoro chunking, bounded redacted diagnostics")
}

/** Cache value for kv (0 = K, 1 = V), layer, frame, head and dim: unique and exactly representable in fp16. */
private fun cacheValue(kv: Int, layer: Int, t: Int, head: Int, d: Int) = (((kv * 6 + layer) * 8 + t) * 16 + head) * 0.25f + d / 64f

/** A pocket-tts voice-state .safetensors file (6 layers, [2, 1, capacity, 16, 64] float32 caches). */
private fun syntheticVoiceState(frames: Int, capacity: Int, pad: Int? = 0, poison: Float? = null, extra: String? = null, padding: Boolean = false): ByteArray {
    val tensors = ArrayList<Pair<String, ByteArray>>()
    fun le(size: Int) = java.nio.ByteBuffer.allocate(size).order(java.nio.ByteOrder.LITTLE_ENDIAN)
    for (layer in 0 until 6) {
        tensors.add("transformer.layers.$layer.self_attn/offset" to le(8).putLong(frames.toLong()).array())
        if (pad != null) tensors.add("transformer.layers.$layer.self_attn/pad" to le(8).putLong(pad.toLong()).array())
        val cache = le(2 * capacity * 16 * 64 * 4)
        for (kv in 0..1) for (t in 0 until capacity) for (head in 0 until 16) for (d in 0 until 64)
            cache.putFloat(if (poison != null && layer == 5 && kv == 1 && t == 0 && head == 3 && d == 7) poison else cacheValue(kv, layer, t, head, d))
        tensors.add("transformer.layers.$layer.self_attn/cache" to cache.array())
    }
    if (extra != null) tensors.add(extra to le(8).putLong(0).array())
    val header = StringBuilder("{")
    var offset = 0L
    for ((name, data) in tensors) {
        val dtype = if (name.endsWith("/cache")) "F32" else "I64"
        val shape = if (name.endsWith("/cache")) "[2,1,$capacity,16,64]" else "[1]"
        if (header.length > 1) header.append(',')
        header.append("\"$name\":{\"dtype\":\"$dtype\",\"shape\":$shape,\"data_offsets\":[$offset,${offset + data.size}]}")
        offset += data.size
    }
    header.append('}')
    if (padding) header.append("   ")
    val json = header.toString().toByteArray()
    val out = le(8 + json.size + offset.toInt()).putLong(json.size.toLong()).put(json)
    tensors.forEach { out.put(it.second) }
    return out.array()
}

/**
 * The expected pt_voice_*.bin: int32 frames, then K and V as fp16 [layer*16 + head][frame][dim], K dims in
 * upstream's de-interleave order (torch.cat([arange(0, 64, 2), arange(1, 64, 2)])). Rounding is checked above.
 */
private fun expectedVoiceBin(frames: Int, capacity: Int): ByteArray {
    check(capacity >= frames)
    val keyOrder = (0 until 64 step 2) + (1 until 64 step 2)
    val out = java.nio.ByteBuffer.allocate(4 + 2 * 96 * frames * 64 * 2).order(java.nio.ByteOrder.LITTLE_ENDIAN).putInt(frames)
    for (kv in 0..1) for (layer in 0 until 6) for (head in 0 until 16) for (t in 0 until frames) for (d in 0 until 64)
        out.putShort(pocketHalf(cacheValue(kv, layer, t, head, if (kv == 0) keyOrder[d] else d)))
    return out.array()
}
