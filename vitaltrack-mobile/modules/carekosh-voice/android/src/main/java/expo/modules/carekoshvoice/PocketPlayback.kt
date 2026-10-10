package expo.modules.carekoshvoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
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
    data class Report(val output: String, val volumePercent: Int, val frames: Int) {
        fun asMap(): Map<String, Any> = mapOf("output" to output, "volumePercent" to volumePercent,
            "audioSeconds" to frames / 24000.0, "frames" to frames)
    }
    private val lock = Any()
    private var track: AudioTrack? = null
    fun stop() = synchronized(lock) {
        track?.let { try { it.pause(); it.flush() } catch (_: IllegalStateException) { } }
    }
    fun play(samples: FloatArray, pace: Float, check: () -> Unit): Report {
        require(pace in 0.85f..1.1f && samples.isNotEmpty() && samples.size <= 24000 * 90)
        val pcm = pocketPcm16(samples)
        check()
        // This is user-requested app narration. Use the media route/volume consistently
        // for phone speakers, wired outputs and Bluetooth; do not force a device.
        val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
        val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        require(manager.getStreamVolume(AudioManager.STREAM_MUSIC) > 0 && !manager.isStreamMute(AudioManager.STREAM_MUSIC)) {
            "Media volume is muted. Turn up media volume and check the speaker or Bluetooth output"
        }
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
                .setAudioFormat(AudioFormat.Builder().setSampleRate(24000).setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(maxOf(24000 * 2,
                    AudioTrack.getMinBufferSize(24000, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT))).build()
            require(output.state == AudioTrack.STATE_INITIALIZED) { "Could not open the speaker" }
            synchronized(lock) { track = output }
            require(output.setVolume(1f) == AudioTrack.SUCCESS) { "Could not set speech playback volume" }
            output.playbackParams = PlaybackParams().setPitch(1f).setSpeed(pace)
            val deadline = System.nanoTime() + 120_000_000_000L
            val ready = { check(); kotlin.check(!lostFocus.get()) { "Speech interrupted by another app" }; kotlin.check(System.nanoTime() < deadline) { "Alba playback timed out" } }
            ready(); output.play()
            require(output.playState == AudioTrack.PLAYSTATE_PLAYING) { "Speaker playback did not start" }
            var offset = 0
            while (offset < samples.size) {
                ready()
                val n = output.write(pcm, offset, minOf(2400, pcm.size - offset), AudioTrack.WRITE_NON_BLOCKING)
                require(n >= 0) { "Could not play Alba audio" }
                if (n == 0) Thread.sleep(10) else offset += n
            }
            // Await rendered frames before starting the answer timer. This is not acoustic proof.
            while (output.playbackHeadPosition.toLong() < samples.size) { ready(); Thread.sleep(20) }
            ready()
            val route = when (output.routedDevice?.type) {
                AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Phone speaker"
                AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "Phone earpiece"
                AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER -> "Bluetooth audio"
                AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Wired headphones"
                AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE -> "USB audio"
                null -> "Android-selected output"
                else -> "External audio output"
            }
            val volume = manager.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 /
                maxOf(1, manager.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
            return Report(route, volume, output.playbackHeadPosition)
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
