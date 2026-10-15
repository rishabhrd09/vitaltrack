package expo.modules.carekoshvoice

import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/** Independent serial ownership for engines and downloads; network waits never occupy an engine. */
internal class VoiceWorkLane(name: String) {
    val executor = Executors.newSingleThreadExecutor { Thread(it, name) }
    val pending = AtomicInteger(0)
}

/**
 * Failures the app can act on, each with a stable code for JavaScript. Messages are user-facing and
 * never contain answer text, recordings, keys or file paths.
 */
internal open class VoiceError(val code: String, message: String, cause: Throwable? = null) : IllegalStateException(message, cause)

/** Stop, a new question, leaving the screen or an account change. Not a failure; nothing is shown. */
internal class VoiceCancelled : VoiceError("SPEECH_CANCELLED", "Speech cancelled")

/** Another app needed audio (a call, navigation, an alarm), or the headphones were unplugged. */
internal class VoiceInterrupted(message: String) : VoiceError("SPEECH_INTERRUPTED", message)

/** Media volume is muted or audio cannot start right now; the engine itself is fine. */
internal class VoiceAudioUnavailable(message: String) : VoiceError("AUDIO_UNAVAILABLE", message)

/** A reply took too long or playback stalled; the engine stays warm for the next reply. */
internal class VoiceTimedOut(message: String) : VoiceError("SPEECH_TIMEOUT", message)

/** A download was cancelled, failed or could not be verified. Partial files may be resumed. */
internal class VoiceDownloadFailed(message: String) : VoiceError("DOWNLOAD_FAILED", message)

/**
 * Whether the compiled engine may be reused after [error]. Cancellation, interruptions, muted audio,
 * busy audio and timeouts say nothing about the engine; an inference or compile failure might.
 */
internal fun pocketKeepsEngine(error: Throwable): Boolean =
    error is VoiceCancelled || error is VoiceInterrupted || error is VoiceAudioUnavailable || error is VoiceTimedOut
