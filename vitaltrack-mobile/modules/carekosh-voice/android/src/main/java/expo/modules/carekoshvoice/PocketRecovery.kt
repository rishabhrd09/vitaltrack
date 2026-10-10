package expo.modules.carekoshvoice

/** One local CPU retry after GPU generation failure; cancellation always wins. */
internal class PocketGpuFailure(cause: Exception) : RuntimeException(cause)

internal fun pocketFrameBudget(remainingKv: Int, decoderFrames: Int): Int =
    minOf(remainingKv, decoderFrames).also { require(it > 0) { "Alba has no generation space" } }

internal fun pocketSentenceFinished(eosStep: Int, frames: Int, tail: Int, budget: Int): Boolean =
    eosStep >= 0 && frames >= eosStep + tail && frames < budget

internal fun recoverPocketAudio(
    check: () -> Unit,
    report: (String) -> Unit,
    generate: (Boolean) -> FloatArray,
): FloatArray {
    check()
    val audio = try {
        generate(false)
    } catch (_: PocketGpuFailure) {
        check() // Never turn cancellation or an expired deadline into another attempt.
        report("cpu_retry")
        generate(true)
    }
    check()
    pocketAudioLevels(audio)
    return audio
}
