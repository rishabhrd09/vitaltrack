// Adapted from john-rocky/LiteRT-Models @ 310464b5988f59c03de9283c3d7451e51d9f0260.
// Copyright (c) 2026 Daisuke Majima. MIT; see assets/pocket-licences/SAMPLE-MIT.txt.
// CareKosh: preset Alba only, private files, bounded generation, cancellation and cleanup.
package expo.modules.carekoshvoice

import android.util.Half
import com.google.ai.edge.litert.Accelerator
import com.google.ai.edge.litert.CompiledModel
import java.io.Closeable
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Random
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Pocket TTS (Kyutai, 100M) on LiteRT CompiledModel.
 *
 * Pocket TTS is a flow-matching LM over continuous 32-dim Mimi latents: per
 * 12.5 Hz frame a 6-layer/1024-wide causal transformer conditions a 6-block
 * AdaLN MLP flow head that turns one Gaussian draw into the next latent
 * (Lagrangian Self Distillation, 1 step — no iterative sampling loop); a 20M
 * tiny Mimi (x16 ConvTranspose upsample + 2-layer transformer + SEANet)
 * decodes latents to 24 kHz audio. The voice is a precomputed prompt KV cache
 * (`pt_voice_*.bin`, repacked from Kyutai's published per-voice states).
 *
 * Three exported graphs, all stateless with host-side state:
 *  * `pt_flowlm_fused` — one AR step and flow head; packed KV in/out.
 *  * `pt_mimi_dec_tx`  — 64-latent-frame block of the Mimi decoder
 *    transformer; blocks overlap 32 frames because the 2-layer sliding-window
 *    (250) attention has a stacked receptive field of 498 positions.
 *  * `pt_mimi_deconly` — SEANet decoder, one-shot 256-frame window (causal,
 *    so real frames are exact regardless of the zero tail).
 *
 * Adapted from the pinned upstream Android example. CareKosh additionally
 * bounds text, token chunks, generation time and PCM length. Reference graph
 * parity is reported by the exporter; Android inference must be tested on-device.
 */
internal class PocketSynthesizer(private val modelDir: File, private val checkOperation: () -> Unit, private val cpuOnly: Boolean = false) : Closeable {

    companion object {
        const val H = 1024               // flow-LM width
        const val HD = 64                // head dim
        const val NH = 16                // heads
        const val LAYERS = 6
        const val G = LAYERS * NH        // packed KV groups
        const val PMAX = 512             // KV capacity: voice + text + audio frames
        const val LDIM = 32              // Mimi latent dim
        const val THETA = 10000.0

        const val UPS = 16               // 12.5 Hz -> 200 Hz
        const val MIMI_D = 512
        const val F_BLK = 64             // dec_tx block payload frames
        const val F_HOP = 32             // dec_tx block hop
        const val S_BLK = F_BLK * UPS
        const val DEC_FRAMES = 256       // deconly window frames
        const val S_DEC = DEC_FRAMES * UPS
        const val SPF = 1920             // samples per 12.5 Hz frame
        const val SAMPLE_RATE = 24000

        // Generation defaults from the english config / pocket_tts defaults.
        const val TEMP = 0.3f
        const val EOS_THRESHOLD = -4.0f
        const val MAX_TOKENS_PER_CHUNK = PocketText.MAX_TOKENS_PER_CHUNK
        const val MASK_NEG = -1e4f

        // step + flow head fused into one graph with one output tensor: on
        // Mali the per-frame cost is dispatch/sync-bound, and two invocations
        // plus four readbacks per frame cost more than the math itself.
        const val LM = "pt_flowlm_fused_fp16.tflite"
        const val DEC_TX = "pt_mimi_dec_tx_fp16.tflite"
        const val DECONLY = "pt_mimi_deconly_fp16.tflite"
        const val EMBED = "pt_embed_f16.bin"
        const val INPUT_LINEAR = "pt_input_linear_f32.bin"
        const val BOS = "pt_bos_input_f32.bin"
        const val NEUTRAL = "pt_neutral_latent_f32.bin"
        const val TOKENIZER = "pt_tokenizer.tsv"

        // Only the CC-BY-4.0 Alba preset is offered. No voice-cloning input.
        val VOICES = listOf("alba")
    }

    private val resources = ArrayList<AutoCloseable>()
    var usesGpu = false
        private set
    private fun path(name: String): File = File(modelDir, name).also {
        require(it.isFile) { "Download the Alba voice pack in Voice setup first" }
    }
    private fun <T : AutoCloseable> own(value: T): T { resources.add(value); return value }
    private fun load(name: String, gpu: Boolean): CompiledModel {
        checkOperation()
        val result = if (gpu && !cpuOnly) try {
            CompiledModel.create(path(name).path, CompiledModel.Options(Accelerator.GPU), null).also { usesGpu = true }
        } catch (_: Exception) {
            checkOperation()
            CompiledModel.create(path(name).path, CompiledModel.Options(Accelerator.CPU), null)
        } else CompiledModel.create(path(name).path, CompiledModel.Options(Accelerator.CPU), null)
        return own(result)
    }
    private lateinit var lm: CompiledModel
    private lateinit var dectx: CompiledModel
    private lateinit var deconly: CompiledModel
    private lateinit var lmIn: List<com.google.ai.edge.litert.TensorBuffer>
    private lateinit var lmOut: List<com.google.ai.edge.litert.TensorBuffer>
    private lateinit var dectxIn: List<com.google.ai.edge.litert.TensorBuffer>
    private lateinit var dectxOut: List<com.google.ai.edge.litert.TensorBuffer>
    private lateinit var deconlyIn: List<com.google.ai.edge.litert.TensorBuffer>
    private lateinit var deconlyOut: List<com.google.ai.edge.litert.TensorBuffer>
    // ---- host assets ------------------------------------------------------
    private val embMap = ByteBuffer.wrap(path(EMBED).readBytes()).order(ByteOrder.LITTLE_ENDIAN)
    private val inputLinear = readF32(path(INPUT_LINEAR))      // [1024, 32] row-major
    private val bosInput = readF32(path(BOS))                  // [1024]
    private val neutral = readF32(path(NEUTRAL))               // [32]
    val tokenizer = PocketTokenizer(path(TOKENIZER))

    private val textPrompt = PocketText(tokenizer)

    // ---- host state -------------------------------------------------------
    private val pk = FloatArray(G * PMAX * HD)
    private val pv = FloatArray(G * PMAX * HD)
    private val mask = FloatArray(NH * (PMAX + 1))
    private var pos = 0

    private var voiceName = ""
    private var voiceK = FloatArray(0)
    private var voiceV = FloatArray(0)
    private var voiceLen = 0

    private val cosArr = FloatArray(HD)
    private val sinArr = FloatArray(HD)
    private val invFreq = DoubleArray(HD / 2) { 1.0 / Math.pow(THETA, it / 32.0) }
    private val rnd = Random()

    data class Result(val audio: FloatArray, val frames: Int, val ms: Long)

    /** Load a repacked voice state: int32 T, then k and v as fp16 `[96][T][64]`. */
    fun loadVoice(name: String) {
        require(name == "alba") { "Only the reviewed Alba voice is available" }
        if (name == voiceName) return
        val bb = ByteBuffer.wrap(path("pt_voice_$name.bin").readBytes())
            .order(ByteOrder.LITTLE_ENDIAN)
        val t = bb.int
        require(t in 1..200 && bb.remaining() == 2 * G * t * HD * 2) { "Invalid Alba voice state" }
        val n = G * t * HD
        val k = FloatArray(n) { Half.toFloat(bb.short) }
        val v = FloatArray(n) { Half.toFloat(bb.short) }
        voiceK = k; voiceV = v; voiceLen = t; voiceName = name
    }

    private fun resetToVoice() {
        pk.fill(0f); pv.fill(0f)
        for (g in 0 until G) {
            System.arraycopy(voiceK, g * voiceLen * HD, pk, g * PMAX * HD, voiceLen * HD)
            System.arraycopy(voiceV, g * voiceLen * HD, pv, g * PMAX * HD, voiceLen * HD)
        }
        mask.fill(MASK_NEG)
        for (h in 0 until NH) {
            val base = h * (PMAX + 1)
            for (p in 0 until voiceLen) mask[base + p] = 0f
            mask[base + PMAX] = 0f                        // current token, concatenated at tail
        }
        pos = voiceLen
    }

    // ---- small host math --------------------------------------------------
    private fun embRow(id: Int): FloatArray {
        val out = FloatArray(H)
        var b = id * H * 2
        for (j in 0 until H) { out[j] = Half.toFloat(embMap.getShort(b)); b += 2 }
        return out
    }

    private fun projectLatent(lat: FloatArray): FloatArray {
        val out = FloatArray(H)
        for (o in 0 until H) {
            var acc = 0f
            val row = o * LDIM
            for (i in 0 until LDIM) acc += inputLinear[row + i] * lat[i]
            out[o] = acc
        }
        return out
    }

    private fun ropeFill(p: Int) {
        for (j in 0 until HD / 2) {
            val ang = p * invFreq[j]
            val c = cos(ang).toFloat(); val s = sin(ang).toFloat()
            cosArr[j] = c; cosArr[j + HD / 2] = c
            sinArr[j] = s; sinArr[j + HD / 2] = s
        }
    }

    private val zeroNoise = FloatArray(LDIM)

    /**
     * One fused frame: flow-LM step + flow head in a single invocation.
     * Output layout: eos(1) | latent(32) | new-k(96*64) | new-v(96*64).
     * Returns (latent, eosLogit) and appends this step's K/V at [pos].
     * Text prompting passes zero noise and ignores the latent.
     */
    private fun step(emb: FloatArray, noise: FloatArray): Pair<FloatArray, Float> {
        checkOperation()
        check(pos < PMAX) { "KV cache overflow at $pos" }
        ropeFill(pos)
        lmIn[0].writeFloat(emb)
        lmIn[1].writeFloat(cosArr)
        lmIn[2].writeFloat(sinArr)
        lmIn[3].writeFloat(mask)
        lmIn[4].writeFloat(pk)
        lmIn[5].writeFloat(pv)
        lmIn[6].writeFloat(noise)
        lm.run(lmIn, lmOut)
        val out = lmOut[0].readFloat()
        val eos = out[0]
        val latent = out.copyOfRange(1, 1 + LDIM)
        val kvBase = 1 + LDIM
        for (g in 0 until G) {
            System.arraycopy(out, kvBase + g * HD, pk, g * PMAX * HD + pos * HD, HD)
            System.arraycopy(out, kvBase + G * HD + g * HD, pv, g * PMAX * HD + pos * HD, HD)
        }
        for (h in 0 until NH) mask[h * (PMAX + 1) + pos] = 0f
        pos++
        return latent to eos
    }

    /** Generate speech for `text` with the currently loaded voice. */
    fun synthesize(text: String, voice: String): Result {
        require(text.isNotBlank() && text.length <= 640) { "Speech text must be 1–640 characters" }
        val t0 = System.nanoTime()
        loadVoice(voice)
        val audio = ArrayList<FloatArray>()
        var frames = 0
        val chunks = textPrompt.chunks(text)
        for (chunk in chunks) {
            checkOperation()
            val (prepared, eosGuess) = textPrompt.prepare(chunk)
            val ids = tokenizer.encode(prepared)
            val latents = generateChunk(ids, framesAfterEos = eosGuess + 2)
            frames += latents.size
            require(latents.isNotEmpty()) { "Alba could not generate this reply" }
            audio.add(decode(latents))
            require(audio.sumOf { it.size } <= SAMPLE_RATE * 90) { "Spoken reply exceeded the limit" }
        }
        val total = audio.sumOf { it.size }
        val out = FloatArray(total)
        var o = 0
        for (a in audio) { System.arraycopy(a, 0, out, o, a.size); o += a.size }
        return Result(out, frames, (System.nanoTime() - t0) / 1_000_000)
    }

    /** Bounded autoregressive loop; a length estimate is not an EOS deadline. */
    private fun generateChunk(ids: IntArray, framesAfterEos: Int): List<FloatArray> {
        require(ids.size in 1..MAX_TOKENS_PER_CHUNK && ids.all { it in 0 until 4000 })
        resetToVoice()
        for (id in ids) step(embRow(id), zeroNoise)
        // The old 3-tokens/second estimate could expire before a valid slower
        // utterance reached EOS. Keep the actual KV/decoder bounds and deadline.
        val maxGen = pocketFrameBudget(PMAX - pos - 1, DEC_FRAMES)
        val latents = ArrayList<FloatArray>(maxGen)
        var emb = bosInput
        var eosStep = -1
        for (g in 0 until maxGen) {
            val noise = FloatArray(LDIM) {
                (rnd.nextGaussian() * sqrt(TEMP.toDouble())).toFloat()
            }
            val (lat, eosLogit) = step(emb, noise)
            if (eosLogit > EOS_THRESHOLD && eosStep < 0) eosStep = g
            if (eosStep >= 0 && g >= eosStep + framesAfterEos) break
            latents.add(lat)
            emb = projectLatent(lat)
        }
        require(pocketSentenceFinished(eosStep, latents.size, framesAfterEos, maxGen)) { "Alba could not finish this sentence. Try Preview voice again or select Device voice in Voice setup" }
        return latents
    }

    /** Mimi decode: overlapped dec_tx blocks -> one-shot SEANet window. */
    private fun decode(latents: List<FloatArray>): FloatArray {
        checkOperation()
        require(latents.size in 1..DEC_FRAMES)
        val t = latents.size
        val feat = FloatArray(MIMI_D * S_DEC)
        val blk = FloatArray((1 + F_BLK) * LDIM)

        fun runBlock(prev: FloatArray, start: Int): FloatArray {
            checkOperation()
            System.arraycopy(prev, 0, blk, 0, LDIM)
            for (f in 0 until F_BLK) {
                val src = if (start + f < t) latents[start + f] else neutral
                System.arraycopy(src, 0, blk, (1 + f) * LDIM, LDIM)
            }
            dectxIn[0].writeFloat(blk)
            dectx.run(dectxIn, dectxOut)
            return dectxOut[0].readFloat()               // [512 * 1024]
        }

        var out = runBlock(neutral, 0)
        val n0 = minOf(F_BLK, t)
        for (c in 0 until MIMI_D)
            System.arraycopy(out, c * S_BLK, feat, c * S_DEC, n0 * UPS)
        var kept = F_BLK
        while (kept < t) {
            val start = kept - F_HOP
            out = runBlock(latents[start - 1], start)
            val n = minOf(F_BLK, t - start)
            val keepN = (n - F_HOP) * UPS
            for (c in 0 until MIMI_D)
                System.arraycopy(out, c * S_BLK + F_HOP * UPS, feat, c * S_DEC + kept * UPS, keepN)
            kept += n - F_HOP
        }

        checkOperation()
        deconlyIn[0].writeFloat(feat)
        deconly.run(deconlyIn, deconlyOut)
        val wav = deconlyOut[0].readFloat()
        require(wav.size >= t * SPF) { "Invalid Alba audio length" }
        for (i in 0 until t * SPF) require(wav[i].isFinite()) { "Invalid Alba audio" }
        checkOperation()
        return FloatArray(t * SPF) { wav[it].coerceIn(-1f, 1f) }
    }

    // Create/close on the same worker (GPU context affinity). Never free during inference.
    fun initialize() {
        try {
            lm = load(LM, true)
            // CPU decoder transformer preserves voice quality on Mali devices.
            dectx = load(DEC_TX, false)
            deconly = load(DECONLY, true)
            fun buffers(m: CompiledModel, input: Boolean) =
                (if (input) m.createInputBuffers() else m.createOutputBuffers()).also { b -> b.forEach { own(it) } }
            lmIn = buffers(lm, true); lmOut = buffers(lm, false)
            dectxIn = buffers(dectx, true); dectxOut = buffers(dectx, false)
            deconlyIn = buffers(deconly, true); deconlyOut = buffers(deconly, false)
            loadVoice("alba")
            checkOperation()
        } catch (error: Throwable) { close(); throw error }
    }
    override fun close() {
        resources.asReversed().forEach { try { it.close() } catch (_: Exception) { } }
        resources.clear()
    }

    private fun readF32(f: File): FloatArray {
        val b = f.readBytes()
        val bb = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN)
        return FloatArray(b.size / 4) { bb.float }
    }
}
