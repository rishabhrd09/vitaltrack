package expo.modules.carekoshvoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.PlaybackParams
import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicBoolean

/** Worker owns track lifetime. Cancellation may pause/flush, never release in-flight writes. */
internal class PocketPlayback(private val context: Context) {
    private val lock = Any()
    private var track: AudioTrack? = null
    fun stop() = synchronized(lock) {
        track?.let { try { it.pause(); it.flush() } catch (_: IllegalStateException) { } }
    }
    fun play(samples: FloatArray, pace: Float, check: () -> Unit) {
        require(pace in 0.85f..1.1f && samples.isNotEmpty() && samples.size <= 24000 * 90)
        check()
        val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
        val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val lostFocus = AtomicBoolean(false)
        val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attributes).setOnAudioFocusChangeListener({
                if (it < 0) { lostFocus.set(true); stop() }
            }, Handler(Looper.getMainLooper())).build()
        require(manager.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { "Audio is busy. Please try again" }
        var output: AudioTrack? = null
        try {
            check()
            output = AudioTrack.Builder().setAudioAttributes(attributes)
                .setAudioFormat(AudioFormat.Builder().setSampleRate(24000).setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(24000 * 4).build()
            require(output.state == AudioTrack.STATE_INITIALIZED) { "Could not open the speaker" }
            synchronized(lock) { track = output }
            output.playbackParams = PlaybackParams().setPitch(1f).setSpeed(pace)
            val deadline = System.nanoTime() + 120_000_000_000L
            val ready = { check(); kotlin.check(!lostFocus.get()) { "Speech interrupted by another app" }; kotlin.check(System.nanoTime() < deadline) { "Alba playback timed out" } }
            ready(); output.play()
            var offset = 0
            while (offset < samples.size) {
                ready()
                val n = output.write(samples, offset, minOf(2400, samples.size - offset), AudioTrack.WRITE_NON_BLOCKING)
                require(n >= 0) { "Could not play Alba audio" }
                if (n == 0) Thread.sleep(10) else offset += n
            }
            // Await audible completion so the answer's reading timer does not cut speech.
            while (output.playbackHeadPosition.toLong() < samples.size) { ready(); Thread.sleep(20) }
            ready()
        } finally {
            try {
                synchronized(lock) {
                    if (track === output) track = null
                    output?.let { try { it.pause(); it.flush() } catch (_: IllegalStateException) { } finally { it.release() } }
                }
            } finally { manager.abandonAudioFocusRequest(focus) }
        }
    }
}
