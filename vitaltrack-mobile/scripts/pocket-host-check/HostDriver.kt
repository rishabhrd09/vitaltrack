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

fun main(args: Array<String>) {
    val dir = File(args[0]); val out = File(args[1]); val mode = args.getOrElse(2) { "speak" }
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
