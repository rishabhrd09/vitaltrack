package expo.modules.carekoshvoice

/**
 * Generation bounds and accelerator placement for the pinned Pocket TTS graphs.
 *
 * Evidence (13 Oct 2026, host LiteRT 2.1.6 with the exact pinned files): one CPU run of
 * `pt_mimi_deconly_fp16` (SEANet vocoder, fixed 256-frame window) peaks at about 10.1 GB with XNNPACK
 * and 8.3 GB with builtin kernels; its op outputs total 9.6 GB. The GPU run of the same graph used
 * about 140 MB. The vocoder therefore never falls back to CPU on a phone — the former GPU→CPU retry
 * and the silent CPU fallback after a GPU compile error both led there. The flow LM and the Mimi
 * decoder transformer run on CPU: same-seed host runs are bit-identical to the verified all-CPU
 * reference (about 0.6 GB and 0.2 GB), and upstream measured the transformer degraded on Mali and
 * PowerVR GPUs.
 */
internal enum class PocketDevice { CPU, GPU }
internal enum class PocketGpuPrecision { DEFAULT, FP32 }

internal data class PocketPlacement(
    val lm: PocketDevice = PocketDevice.CPU,
    val decoderTransformer: PocketDevice = PocketDevice.CPU,
    val vocoderPrecision: PocketGpuPrecision = PocketGpuPrecision.DEFAULT,
) {
    val label: String get() = "flow LM ${lm.name} · decoder transformer ${decoderTransformer.name} · vocoder GPU" +
        if (vocoderPrecision == PocketGpuPrecision.FP32) " FP32" else ""

    companion object {
        val DEFAULT = PocketPlacement()
        /** Diagnostics builds only: compare named experiments on a test phone. */
        fun named(name: String): PocketPlacement = when (name) {
            "default" -> DEFAULT
            "lm_gpu" -> PocketPlacement(lm = PocketDevice.GPU)
            "vocoder_fp32" -> PocketPlacement(vocoderPrecision = PocketGpuPrecision.FP32)
            else -> throw IllegalArgumentException("Unknown Alba placement")
        }
    }
}

/** The vocoder could not be compiled for this phone's GPU. A CPU attempt would need several GB. */
internal class PocketVocoderUnavailable(cause: Throwable) : VoiceError("ENGINE_UNAVAILABLE",
    "This phone's graphics processor could not run Alba's audio decoder, so Alba cannot speak on this phone. " +
        "Your answer is still on screen; select Device voice in Voice setup.", cause)

internal fun pocketFrameBudget(remainingKv: Int, decoderFrames: Int): Int =
    minOf(remainingKv, decoderFrames).also { require(it > 0) { "Alba has no generation space" } }

/**
 * pocket-tts PR #319: during the leading pause of short texts the EOS logit can briefly exceed the
 * threshold, ending generation before the word. EOS is ignored for the first frames.
 */
internal const val POCKET_EOS_GUARD_FRAMES = 6

internal fun pocketEosAccepted(step: Int, logit: Float, threshold: Float): Boolean =
    step >= POCKET_EOS_GUARD_FRAMES && logit > threshold

/** Reference rule: keep the EOS frame plus `tail - 1` frames, and never hit the hard budget. */
internal fun pocketSentenceFinished(eosStep: Int, frames: Int, tail: Int, budget: Int): Boolean =
    eosStep >= 0 && frames >= eosStep + tail && frames < budget
