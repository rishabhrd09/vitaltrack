// Adapted from john-rocky/LiteRT-Models @ 310464b5988f59c03de9283c3d7451e51d9f0260.
// Copyright (c) 2026 Daisuke Majima. MIT; see assets/pocket-licences/SAMPLE-MIT.txt.
// CareKosh: fixed preset voices only, private files, evidence-based placement, bounded generation,
// reusable compiled models, per-chunk delivery, pace as pauses, cancellation and cleanup.
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
 * Pocket TTS is a flow-matching LM over continuous 32-dim Mimi latents: per 12.5 Hz frame a
 * 6-layer/1024-wide causal transformer conditions a 1-step LSD flow head that turns one Gaussian
 * draw into the next latent; a 20M tiny Mimi (x16 upsample + 2-layer transformer + SEANet) decodes
 * latents to 24 kHz audio. The voice is a precomputed prompt KV cache (`pt_voice_*.bin`).
 *
 * Three exported graphs, all stateless with host-side state (input/output order confirmed against
 * the exporter `build_pockettts.py` @ 310464b and by same-seed host runs):
 *  * `pt_flowlm_fused` — (x, cos, sin, mask, K, V, noise) -> eos | latent | new K | new V.
 *  * `pt_mimi_dec_tx`  — 64-latent-frame decoder-transformer blocks overlapping 32 frames.
 *  * `pt_mimi_deconly` — SEANet vocoder, one-shot 256-frame window (causal; zero tail is exact).
 *
 * Placement follows [PocketPlacement]: the vocoder never runs on CPU (≈10 GB on LiteRT 2.1.6).
 * Create, use and close on one worker thread (GPU context affinity); never free during inference.
 */
internal class PocketSynthesizer(private val modelDir: File, val placement: PocketPlacement = PocketPlacement.DEFAULT, voiceFile: String = "pt_voice_alba.bin") : Closeable {
    /** The preset voice state in use; switching it reloads only the voice, never the compiled graphs. */
    var voiceFile: String = voiceFile
        private set

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
        const val FADE_IN = 120          // 5 ms per chunk start (pocket-tts PR #332: chunk-start click)
        const val FADE_OUT = 120         // 5 ms at a trimmed chunk end

        // Generation defaults from the english config / pocket_tts defaults.
        const val TEMP = 0.3f
        const val EOS_THRESHOLD = -4.0f
        const val MAX_TOKENS_PER_CHUNK = PocketText.MAX_TOKENS_PER_CHUNK
        const val MASK_NEG = -1e4f

        const val LM = "pt_flowlm_fused_fp16.tflite"
        const val DEC_TX = "pt_mimi_dec_tx_fp16.tflite"
        const val DECONLY = "pt_mimi_deconly_fp16.tflite"
        const val EMBED = "pt_embed_f16.bin"
        const val INPUT_LINEAR = "pt_input_linear_f32.bin"
        const val BOS = "pt_bos_input_f32.bin"
        const val NEUTRAL = "pt_neutral_latent_f32.bin"
        const val TOKENIZER = "pt_tokenizer.tsv"
    }

    /** Counts and timings only — never text, tokens' content or audio. */
    data class ChunkStats(val tokens: Int, val frames: Int, val eosStep: Int, val maxEosLogit: Float,
                          val promptMs: Long, val generateMs: Long, val decodeMs: Long) {
        fun describe(index: Int) = "chunk %d: %d tokens, %d frames, EOS at %d (max logit %.1f), prompt %d ms, generate %d ms (%.1f ms/step), decode %d ms"
            .format(index, tokens, frames, eosStep, maxEosLogit, promptMs, generateMs,
                if (frames + tokens > 0) generateMs.toDouble() / maxOf(1, frames + 1) else 0.0, decodeMs)
    }
    data class Result(val samples: Int, val frames: Int, val ms: Long, val chunks: List<ChunkStats>)

    private val resources = ArrayList<AutoCloseable>()
    private val placement_ = ArrayList<String>()
    val placements get() = placement_.joinToString("; ")
    var initializeMs = 0L
        private set
    private val threads = minOf(4, maxOf(1, Runtime.getRuntime().availableProcessors()))
    private fun path(name: String): File = File(modelDir, name).also {
        require(it.isFile) { "Download the Alba voice pack in Voice setup first" }
    }
    private fun <T : AutoCloseable> own(value: T): T { resources.add(value); return value }

    private fun cpu(name: String): CompiledModel {
        val options = CompiledModel.Options(Accelerator.CPU)
        options.cpuOptions = CompiledModel.CpuOptions(threads, null, null)
        return CompiledModel.create(path(name).path, options, null).also { placement_.add("$name: CPU ${threads}t") }
    }
    private fun gpu(name: String, precision: PocketGpuPrecision): CompiledModel {
        val options = CompiledModel.Options(Accelerator.GPU)
        if (precision == PocketGpuPrecision.FP32)
            options.gpuOptions = CompiledModel.GpuOptions(precision = CompiledModel.GpuOptions.Precision.FP32)
        return CompiledModel.create(path(name).path, options, null).also {
            placement_.add("$name: GPU" + if (precision == PocketGpuPrecision.FP32) " FP32" else "")
        }
    }
    /** LM/decoder transformer: GPU only when an experiment asks, with CPU as a safe fallback. */
    private fun cpuOrGpu(name: String, device: PocketDevice, check: () -> Unit): CompiledModel {
        check()
        if (device == PocketDevice.CPU) return own(cpu(name))
        return own(try { gpu(name, PocketGpuPrecision.DEFAULT) } catch (e: Exception) {
            check(); placement_.add("$name: GPU failed (${e.javaClass.simpleName})"); cpu(name)
        } catch (e: LinkageError) {
            check(); placement_.add("$name: GPU library missing (${e.javaClass.simpleName})"); cpu(name)
        })
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
    // ---- host assets (loaded by initialize) ---------------------------------
    private lateinit var embMap: ByteBuffer
    private lateinit var inputLinear: FloatArray      // [1024, 32] row-major
    private lateinit var bosInput: FloatArray         // [1024], already projected by the exporter
    private lateinit var neutral: FloatArray          // [32]
    private lateinit var textPrompt: PocketText

    // ---- host state -------------------------------------------------------
    private val pk = FloatArray(G * PMAX * HD)
    private val pv = FloatArray(G * PMAX * HD)
    private val mask = FloatArray(NH * (PMAX + 1))
    private var pos = 0

    private var voiceK = FloatArray(0)
    private var voiceV = FloatArray(0)
    private var voiceLen = 0

    private val cosArr = FloatArray(HD)
    private val sinArr = FloatArray(HD)
    private val invFreq = DoubleArray(HD / 2) { 1.0 / Math.pow(THETA, it / 32.0) }
    private val rnd = Random()
    private var stepCheck: () -> Unit = {}

    /** Load a repacked voice state: int32 T, then k and v as fp16 `[96][T][64]`. */
    private fun loadVoice(name: String) {
        require(name.matches(Regex("pt_voice_[a-z]+\\.bin"))) { "Invalid Alba voice" }
        val bb = ByteBuffer.wrap(path(name).readBytes()).order(ByteOrder.LITTLE_ENDIAN)
        val t = bb.int
        // The voice prompt, the longest chunk and a full decoder window must fit the KV cache.
        require(t in 1..200 && t + MAX_TOKENS_PER_CHUNK + 1 < PMAX && bb.remaining() == 2 * G * t * HD * 2) { "Invalid Alba voice state" }
        val n = G * t * HD
        voiceK = FloatArray(n) { Half.toFloat(bb.short) }
        voiceV = FloatArray(n) { Half.toFloat(bb.short) }
        voiceLen = t
        voiceFile = name
    }

    /** Switch the preset voice on a warm engine. Same worker thread as [synthesize]. */
    fun useVoice(name: String) { if (name != voiceFile || voiceLen == 0) loadVoice(name) }

    private fun resetToVoice() {
        pk.fill(0f); pv.fill(0f) // masked slots must stay finite: −1e4 cannot cancel NaN/Inf
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

    /** One fused frame. Output layout: eos(1) | latent(32) | new-k(96*64) | new-v(96*64). */
    private fun step(emb: FloatArray, noise: FloatArray): Pair<FloatArray, Float> {
        stepCheck()
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
        val expected = 1 + LDIM + 2 * G * HD
        require(out.size >= expected && (0 until expected).all { out[it].isFinite() }) {
            "Alba inference returned invalid values"
        }
        stepCheck() // a long native call may outlive cancellation; check before accepting its result
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

    /**
     * Generate speech chunk by chunk with the chosen preset voice. Each decoded chunk is handed to
     * [onChunk] immediately, so playback can begin after the first sentence. Bounded by the caller's
     * [check] (cancellation and deadline) and by the KV/decoder window.
     */
    fun synthesize(text: String, check: () -> Unit, progress: (String, Int) -> Unit, pace: Float = 1f, onChunk: (FloatArray) -> Unit): Result {
        require(text.isNotBlank() && text.length <= 640) { "Speech text must be 1–640 characters" }
        val pauses = pocketPauses(pace)
        val started = System.nanoTime()
        stepCheck = check
        try {
            val stats = ArrayList<ChunkStats>()
            var samples = 0
            var frames = 0
            for (chunk in textPrompt.chunks(text)) {
                check()
                val (prepared, eosGuess) = textPrompt.prepare(chunk)
                val ids = textPrompt.encode(prepared)
                progress("prompting", 0)
                val (latents, partial) = generateChunk(ids, framesAfterEos = eosGuess + 2, progress)
                require(latents.isNotEmpty()) { "Alba could not generate this reply" }
                val decodeStart = System.nanoTime()
                // Steady pauses at joins; corrupt or inaudible output is rejected before any gain.
                val trimmed = pocketTrimJoin(decode(latents, progress), first = stats.isEmpty(), pauses = pauses)
                pocketAudioLevels(trimmed)
                val audio = pocketEvenLoudness(trimmed)
                for (i in 0 until minOf(FADE_IN, audio.size)) audio[i] *= i / FADE_IN.toFloat()
                for (i in 0 until minOf(FADE_OUT, audio.size)) audio[audio.size - 1 - i] *= i / FADE_OUT.toFloat()
                frames += latents.size
                samples += audio.size
                require(samples <= SAMPLE_RATE * 90) { "Spoken reply exceeded the limit" }
                stats.add(partial.copy(decodeMs = (System.nanoTime() - decodeStart) / 1_000_000))
                onChunk(audio)
            }
            return Result(samples, frames, (System.nanoTime() - started) / 1_000_000, stats)
        } finally { stepCheck = {} }
    }

    /** Bounded autoregressive loop; a length estimate is not an EOS deadline. */
    private fun generateChunk(ids: IntArray, framesAfterEos: Int, progress: (String, Int) -> Unit): Pair<List<FloatArray>, ChunkStats> {
        require(ids.size in 1..MAX_TOKENS_PER_CHUNK && ids.all { it in 0 until 4000 }) { "Alba could not prepare this sentence" }
        val promptStart = System.nanoTime()
        resetToVoice()
        for (id in ids) step(embRow(id), zeroNoise)
        val generateStart = System.nanoTime()
        val maxGen = pocketFrameBudget(PMAX - pos - 1, DEC_FRAMES)
        val latents = ArrayList<FloatArray>(maxGen)
        var emb = bosInput
        var eosStep = -1
        var maxEos = Float.NEGATIVE_INFINITY
        for (g in 0 until maxGen) {
            val noise = FloatArray(LDIM) { (rnd.nextGaussian() * sqrt(TEMP.toDouble())).toFloat() }
            val (lat, eosLogit) = step(emb, noise)
            maxEos = maxOf(maxEos, eosLogit)
            if (g % 8 == 0) progress("generating", g)
            if (eosStep < 0 && pocketEosAccepted(g, eosLogit, EOS_THRESHOLD)) eosStep = g
            if (eosStep >= 0 && g >= eosStep + framesAfterEos) break
            latents.add(lat)
            emb = projectLatent(lat)
        }
        val now = System.nanoTime()
        require(pocketSentenceFinished(eosStep, latents.size, framesAfterEos, maxGen)) {
            "Alba could not finish this sentence (no end-of-speech signal within ${latents.size} frames). Your answer is still on screen"
        }
        return latents to ChunkStats(ids.size, latents.size, eosStep, maxEos,
            (generateStart - promptStart) / 1_000_000, (now - generateStart) / 1_000_000, 0)
    }

    /** Mimi decode: overlapped dec_tx blocks -> one-shot SEANet window. */
    private fun decode(latents: List<FloatArray>, progress: (String, Int) -> Unit): FloatArray {
        stepCheck()
        progress("decoding", latents.size)
        require(latents.size in 1..DEC_FRAMES) { "Alba produced an invalid sentence length" }
        val t = latents.size
        val feat = FloatArray(MIMI_D * S_DEC)
        val blk = FloatArray((1 + F_BLK) * LDIM)

        fun runBlock(prev: FloatArray, start: Int): FloatArray {
            stepCheck()
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

        stepCheck()
        deconlyIn[0].writeFloat(feat)
        deconly.run(deconlyIn, deconlyOut)
        val wav = deconlyOut[0].readFloat()
        require(wav.size >= t * SPF) { "Invalid Alba audio length" }
        for (i in 0 until t * SPF) require(wav[i].isFinite()) { "Alba returned invalid audio values" }
        stepCheck()
        return FloatArray(t * SPF) { wav[it].coerceIn(-1f, 1f) }
    }

    /** Compile once; the same instance then serves many replies on the same worker thread. */
    fun initialize(check: () -> Unit) {
        val started = System.nanoTime()
        try {
            check()
            embMap = ByteBuffer.wrap(path(EMBED).readBytes()).order(ByteOrder.LITTLE_ENDIAN)
            inputLinear = readF32(path(INPUT_LINEAR))
            bosInput = readF32(path(BOS))
            neutral = readF32(path(NEUTRAL))
            textPrompt = PocketText(PocketTokenizer(path(TOKENIZER)))
            loadVoice(voiceFile)
            check()
            lm = cpuOrGpu(LM, placement.lm, check)
            dectx = cpuOrGpu(DEC_TX, placement.decoderTransformer, check)
            check()
            deconly = own(try { gpu(DECONLY, placement.vocoderPrecision) } catch (e: Exception) {
                placement_.add("$DECONLY: GPU failed (${e.javaClass.simpleName})"); throw PocketVocoderUnavailable(e)
            } catch (e: LinkageError) {
                placement_.add("$DECONLY: GPU library missing (${e.javaClass.simpleName})"); throw PocketVocoderUnavailable(e)
            })
            fun buffers(m: CompiledModel, input: Boolean) =
                (if (input) m.createInputBuffers() else m.createOutputBuffers()).also { b -> b.forEach { own(it) } }
            lmIn = buffers(lm, true); lmOut = buffers(lm, false)
            dectxIn = buffers(dectx, true); dectxOut = buffers(dectx, false)
            deconlyIn = buffers(deconly, true); deconlyOut = buffers(deconly, false)
            check()
            initializeMs = (System.nanoTime() - started) / 1_000_000
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
