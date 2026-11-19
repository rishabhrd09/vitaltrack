// Host driver: the actual CareKosh Kotlin synthesizer/text/audio code against real LiteRT 2.1.6
// numerics through the shim (LM + decoder transformer CPU/XNNPACK, vocoder GPU/Metal). Not Android.
package expo.modules.carekoshvoice

import com.google.ai.edge.litert.Server
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

private fun writeWav(file: File, pcm: FloatArray) {
    val data = ByteBuffer.allocate(44 + pcm.size * 2).order(ByteOrder.LITTLE_ENDIAN)
    data.put("RIFF".toByteArray()).putInt(36 + pcm.size * 2).put("WAVEfmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
        .putInt(24000).putInt(48000).putShort(2).putShort(16).put("data".toByteArray()).putInt(pcm.size * 2)
    pocketPcm16(pcm).forEach { data.putShort(it) }
    file.writeBytes(data.array())
}

/**
 * Speech onset (ms) and the chunk-start burst pocket-tts PR #334 removes: sound above −45 dBFS that
 * stops at least 50 ms before the speech proper (the first 100 ms run above −35 dBFS). 10 ms RMS windows.
 */
private fun chunkStart(samples: FloatArray): Pair<Int, Boolean> {
    val db = DoubleArray(samples.size / 240) { w ->
        var energy = 0.0
        for (i in w * 240 until (w + 1) * 240) energy += samples[i].toDouble() * samples[i]
        10 * Math.log10(energy / 240 + 1e-12)
    }
    val onset = (0..db.size - 10).firstOrNull { s -> (s until s + 10).all { db[it] > -35 } } ?: return -1 to false
    val burst = (0 until onset).any { w -> db[w] > -45 && w + 5 < onset && (w + 1..w + 5).all { db[it] <= -45 } }
    return onset * 10 to burst
}

/** Old against new voice states: chunk-start bursts, one-word replies and timings, plus WAVs for an ASR check. */
private fun compare(dir: File, out: File, voices: List<String>, reps: Int) {
    val short = listOf("Yes.", "No.", "Done.", "Twelve.", "Saved.", "Gloves.", "Syringes.", "Okay.", "Cancelled.",
        "Three boxes.", "Out of stock.", "Draft cleared.")
    val long = listOf(
        "Low stock: 1 item. Surgical Mask: 3 boxes.",
        "Saline 0.9% bottles: 12.5 litres remaining. Recorded supplier: MedPlus.",
        "Stock summary: 42 active items. 3 low-stock items. 1 out-of-stock items. Counts reflect the last successful refresh.",
        "I added 2 items to the draft order. Gloves, 4 boxes. Syringes, 10 pieces. Review the draft before sending it.",
    )
    val index = StringBuilder()
    for (voice in voices) {
        val engine = PocketSynthesizer(dir, voiceFile = voice)
        engine.initialize {}
        var shortBursts = 0; var shortFailures = 0; var shortSeconds = 0.0; var shortCount = 0
        var chunkBursts = 0; var chunkCount = 0; var firstChunkMs = 0L; var totalMs = 0L; var audioSeconds = 0.0; var longFailures = 0
        val onsets = ArrayList<Int>()
        for ((t, text) in (short + long).withIndex()) repeat(reps) { rep ->
            val chunks = ArrayList<FloatArray>()
            val started = System.nanoTime()
            var first = -1L
            val result = try {
                engine.synthesize(text, {}, { _, _ -> }) { chunks.add(it); if (first < 0) first = (System.nanoTime() - started) / 1_000_000 }
            } catch (e: IllegalArgumentException) { if (t < short.size) shortFailures++ else longFailures++; return@repeat }
            val all = FloatArray(chunks.sumOf { it.size }).also { var o = 0; chunks.forEach { c -> System.arraycopy(c, 0, it, o, c.size); o += c.size } }
            val name = "${voice.removeSuffix(".bin")}-$t-$rep.wav"
            writeWav(File(out, name), all)
            index.append(name).append('\t').append(text).append('\n')
            val starts = chunks.map { chunkStart(it) }
            val bursts = starts.count { it.second }
            starts.filter { it.first >= 0 }.forEach { onsets.add(it.first) }
            if (t < short.size) { shortBursts += bursts; shortSeconds += all.size / 24000.0; shortCount++ }
            else { chunkBursts += bursts; chunkCount += chunks.size; firstChunkMs += first; totalMs += result.ms; audioSeconds += all.size / 24000.0 }
        }
        engine.close()
        val longRuns = long.size * reps - longFailures
        println("$voice: one-word/short ${shortCount}/${short.size * reps} spoken, mean %.2f s, bursts $shortBursts; ".format(shortSeconds / maxOf(1, shortCount)) +
            "replies $longRuns/${long.size * reps}, chunk-start bursts $chunkBursts/$chunkCount, first chunk %d ms, real-time factor %.2f; "
                .format(firstChunkMs / maxOf(1, longRuns), totalMs / 1000.0 / maxOf(0.001, audioSeconds)) +
            "speech onset after chunk start: median ${onsets.sorted().getOrElse(onsets.size / 2) { -1 }} ms")
    }
    File(out, "index.tsv").writeText(index.toString())
}

fun main(args: Array<String>) {
    val dir = File(args[0]); val out = File(args[1]); val mode = args.getOrElse(2) { "speak" }
    if (mode == "compare") return compare(dir, out, args.drop(3), (System.getenv("REPS") ?: "3").toInt())
    if (mode == "vocoder-gpu-fails") {
        val engine = PocketSynthesizer(dir)
        try { engine.initialize {}; error("initialized without a vocoder") }
        catch (e: PocketVocoderUnavailable) {
            val vocoderCalls = Server.calls.filter { it.startsWith("pt_mimi_deconly") }
            check(vocoderCalls == listOf("pt_mimi_deconly_fp16.tflite:GPU")) { "vocoder attempts: $vocoderCalls" }
            println("PASS vocoder GPU failure -> PocketVocoderUnavailable; vocoder attempts: $vocoderCalls (no CPU attempt); placements: ${engine.placements}")
        }
        return
    }
    val engine = PocketSynthesizer(dir)
    engine.initialize {}
    println("cold initialize ${engine.initializeMs} ms · ${engine.placements}")
    check(Server.calls.none { it.startsWith("pt_mimi_deconly") && it.endsWith(":CPU") })
    val texts = listOf(
        "Hello. I am your CareKosh stock assistant.",
        "Low stock: 1 item. Surgical Mask: 3 boxes.",
        "Saline 0.9% bottles: 12.5 litres remaining. Recorded supplier: MedPlus.",
        "Stock summary: 42 active items. 3 low-stock items. 1 out-of-stock items. Counts reflect the last successful refresh.",
    )
    for ((i, text) in texts.withIndex()) {
        val chunks = ArrayList<FloatArray>()
        val started = System.nanoTime()
        var firstChunkMs = -1L
        val result = engine.synthesize(text, {}, { _, _ -> }) { chunks.add(it); if (firstChunkMs < 0) firstChunkMs = (System.nanoTime() - started) / 1_000_000 }
        val all = FloatArray(chunks.sumOf { it.size }).also { var o = 0; chunks.forEach { c -> System.arraycopy(c, 0, it, o, c.size); o += c.size } }
        val levels = pocketAudioLevels(all) // the same validation the app applies before playback
        chunks.forEach { pocketAudioLevels(it) }
        writeWav(File(out, "kotlin-$i.wav"), all)
        println("[$i] ${result.chunks.size} chunk(s), ${"%.2f".format(all.size / 24000.0)} s, total ${result.ms} ms, first chunk ${firstChunkMs} ms · ${levels.describe()}")
        result.chunks.forEachIndexed { c, s -> println("     " + s.describe(c + 1)) }
    }
    // Decimal points are not sentence ends (pocket-tts PR #217).
    val text = PocketText(PocketTokenizer(File(dir, "pt_tokenizer.tsv")))
    val parts = text.chunks("Saline 0.9% bottles: 12.5 litres remaining. Recorded supplier: MedPlus.")
    check(parts.none { it.endsWith("0.") || it.endsWith("12.") }) { "decimal split: $parts" }
    println("decimal-aware chunks: ${parts.size} -> ${parts.map { it.length }} characters")
    // Cancellation mid-reply, then the same warm engine serves the next reply.
    var calls = 0
    try {
        engine.synthesize(texts[3], { calls++; check(calls < 40) { "Voice operation cancelled" } }, { _, _ -> }) { }
        error("cancellation ignored")
    } catch (e: IllegalStateException) { check(e.message == "Voice operation cancelled") { e.message!! } }
    val again = ArrayList<FloatArray>()
    engine.synthesize(texts[0], {}, { _, _ -> }) { again.add(it) }
    println("cancelled after $calls checks; warm engine reused afterwards: ${pocketAudioLevels(again.reduce { a, b -> a + b }).describe()}")
    engine.close()
    println("PASS actual Kotlin synthesizer with real LiteRT 2.1.6 numerics (host)")
}
