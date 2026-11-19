package expo.modules.carekoshvoice

/**
 * Bounded, privacy-preserving record of one offline-speech operation: identifiers, placement,
 * stage timings, counts, waveform levels and playback state. Callers pass counts and states only —
 * never the answer text, inventory data, recordings, keys or file paths. Lines are mirrored to
 * [sink] (the module uses logcat tag "CareKoshVoice", so `adb logcat -s CareKoshVoice` captures
 * only these lines without clearing the device's other logs).
 */
internal class PocketDiagnostics(
    val operation: String,
    private val clock: () -> Long = System::nanoTime,
    private val sink: (String) -> Unit = {},
    private val maxLines: Int = 60,
) {
    private val started = clock()
    private val lines = ArrayList<String>()
    private var dropped = 0

    init { require(operation.matches(Regex("[a-zA-Z0-9-]{1,80}"))) { "Invalid diagnostic operation id" } }

    @Synchronized fun note(message: String) {
        val clean = message.replace('\n', ' ').replace(Regex("/[\\w./-]+"), "[path]").take(240)
        val line = "${(clock() - started) / 1_000_000} ms: $clean"
        if (lines.size >= maxLines) { lines.removeAt(1); dropped++ } // keep the header line
        lines.add(line)
        sink("$operation $line")
    }

    @Synchronized fun text(): String =
        "operation $operation\n" + lines.joinToString("\n") + if (dropped > 0) "\n($dropped earlier lines omitted)" else ""
}
