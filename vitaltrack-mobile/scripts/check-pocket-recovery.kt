package expo.modules.carekoshvoice

fun main() {
    // 12 prompt tokens formerly got only ceil((12/3+2)*12.5)=75 frames.
    // A valid 90-frame sentence plus EOS tail must be allowed, not truncated.
    check(pocketFrameBudget(300, 256) == 256)
    check(pocketFrameBudget(200, 256) == 200)
    check(pocketSentenceFinished(90, 93, 3, pocketFrameBudget(300, 256)))
    check(!pocketSentenceFinished(90, 75, 3, 75))
    check(!pocketSentenceFinished(-1, 100, 3, 256))
    check(!pocketSentenceFinished(254, 256, 3, 256))
    val stages = mutableListOf<String>()
    val attempts = mutableListOf<Boolean>()
    val result = recoverPocketAudio({}, stages::add) { cpu ->
        attempts.add(cpu)
        if (!cpu) throw PocketGpuFailure(IllegalStateException("Simulated GPU invocation failure"))
        floatArrayOf(0.1f, -0.2f)
    }
    check(result.contentEquals(floatArrayOf(0.1f, -0.2f)))
    check(attempts == listOf(false, true) && stages == listOf("cpu_retry"))
    var cancelled = false
    var calls = 0
    try {
        recoverPocketAudio({ check(!cancelled) { "Cancelled" } }, {}) {
            calls++; cancelled = true; throw PocketGpuFailure(IllegalStateException("GPU failed after cancel"))
        }
        error("Cancelled speech returned")
    } catch (e: IllegalStateException) { check(e.message == "Cancelled" && calls == 1) }
    for (audio in listOf(floatArrayOf(), floatArrayOf(0f, 0f), floatArrayOf(Float.NaN))) {
        try { recoverPocketAudio({}, {}) { audio }; error("Invalid audio accepted") }
        catch (_: IllegalArgumentException) { }
    }
    // One barely non-zero sample used to pass the old peak-only silent check.
    val nearlySilent = FloatArray(24000).also { it[100] = 0.0001f }
    try { recoverPocketAudio({}, {}) { nearlySilent }; error("Inaudible waveform accepted") }
    catch (e: IllegalArgumentException) { check(e.message!!.contains("inaudible")) }
    val pcm = pocketPcm16(floatArrayOf(-1f, -0.5f, 0f, 0.5f, 1f, 2f))
    check(pcm.contentEquals(shortArrayOf(-32767, -16383, 0, 16383, 32767, 32767)))
    val tone = pocketOutputTone()
    check(tone.size == 12000 && tone.first() == 0f && tone.last() == 0f)
    check(pocketAudioLevels(tone).rms in 0.05..0.15)
    var failures = 0
    try {
        recoverPocketAudio({}, {}) { cpu ->
            failures++
            if (!cpu) throw PocketGpuFailure(IllegalStateException("GPU failure"))
            throw IllegalStateException("CPU failure")
        }
        error("CPU failure accepted")
    } catch (e: IllegalStateException) { check(e.message == "CPU failure" && failures == 2) }
    var direct = 0
    try { recoverPocketAudio({}, {}) { direct++; throw IllegalStateException("Asset failure") }; error("Asset failure accepted") }
    catch (e: IllegalStateException) { check(e.message == "Asset failure" && direct == 1) }
    println("Pocket recovery/audio: late EOS, bounds, GPU→CPU, cancellation, inaudible PCM rejection, PCM16 and faded output tone passed")
}
