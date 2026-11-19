package expo.modules.carekoshvoice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Minimal track surface; lets the streaming logic be tested on a JVM with a fake track. */
internal interface PocketTrack {
    val capacityFrames: Int
    val startThresholdFrames: Int
    fun play()
    val isPlaying: Boolean
    /** Non-blocking; returns frames written (0 when full) or a negative AudioTrack error code. */
    fun write(pcm: ShortArray, offset: Int, count: Int): Int
    val renderedFrames: Long
    val underruns: Int
    val stateLabel: String
    val routeLabel: String
    /** Plays everything already written, then stops (stream mode), even below the start threshold. */
    fun drainAndStop()
    /** Track gain for ducking: 1 normally, lower while another app speaks briefly. */
    fun setGain(gain: Float)
    fun stopNow()
    fun release()
}

/** What an audio-focus change means for a spoken reply. */
internal enum class PocketFocusAction { DUCK, RESTORE, STOP, IGNORE }

/**
 * Android does not duck speech content itself; it tells the app. A short sound (a notification,
 * navigation prompt) lowers the voice and restores it; a call or another app's playback stops it.
 */
internal fun pocketFocusAction(change: Int): PocketFocusAction = when (change) {
    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> PocketFocusAction.DUCK
    AudioManager.AUDIOFOCUS_GAIN -> PocketFocusAction.RESTORE
    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS -> PocketFocusAction.STOP
    else -> PocketFocusAction.IGNORE
}

internal const val POCKET_DUCKED_GAIN = 0.3f

/** Counts, states and timings only — never speech text or audio. */
internal data class PocketPlaybackReport(
    val output: String, val volumePercent: Int, val focus: String, val track: String,
    val capacityFrames: Int, val startThresholdFrames: Int, val writtenFrames: Long, val renderedFrames: Long,
    val underruns: Int, val leadInFrames: Int, val tailPadFrames: Int, val firstAudioMs: Long, val playbackMs: Long,
) {
    val frames: Int get() = renderedFrames.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    fun asMap(): Map<String, Any> = mapOf("output" to output, "volumePercent" to volumePercent,
        "audioSeconds" to renderedFrames / 24000.0, "frames" to frames)
    fun describe() = ("playback: focus %s, media volume %d%%, route %s, track %s, buffer %d fr, start threshold %d fr, " +
        "written %d fr (lead-in %d, tail pad %d), rendered %d fr, underruns %d, first write→audio %d ms, playback %d ms")
        .format(focus, volumePercent, output, track, capacityFrames, startThresholdFrames, writtenFrames, leadInFrames,
            tailPadFrames, renderedFrames, underruns, firstAudioMs, playbackMs)
}

/**
 * Streams PCM16 chunks to one track from a dedicated writer thread, so generation of the next
 * sentence continues while the previous one plays. Cancellation flushes immediately; completion
 * drains the track and waits for rendered frames within a clip-length budget, never indefinitely.
 */
internal class PocketStreamer(
    private val track: PocketTrack,
    private val check: () -> Unit,
    private val clock: () -> Long = System::nanoTime,
    private val sleep: (Long) -> Unit = { Thread.sleep(it) },
) {
    private val queue = LinkedBlockingQueue<ShortArray>()
    private val failure = AtomicReference<Throwable?>(null)
    @Volatile private var stopped = false
    @Volatile private var drained = false
    @Volatile private var started = 0L
    @Volatile private var firstAudio = -1L
    @Volatile var written = 0L
        private set
    private var queuedFrames = 0L
    private var framing = PocketFraming(POCKET_LEAD_IN_FRAMES, 0)
    private val end = ShortArray(0)
    private val writer = Thread({ drain() }, "carekosh-alba-playback")

    fun begin() {
        started = clock()
        track.play()
        if (!track.isPlaying) throw VoiceAudioUnavailable("Speaker playback did not start. Check the audio output and try again")
        queue.put(ShortArray(POCKET_LEAD_IN_FRAMES))
        queuedFrames += POCKET_LEAD_IN_FRAMES
        writer.start()
    }

    /** Validates then queues one decoded chunk; rethrows a writer failure (e.g. focus loss). */
    fun push(samples: FloatArray) {
        failure.get()?.let { throw it }
        check()
        val pcm = pocketPcm16(samples)
        queue.put(pcm)
        queuedFrames += pcm.size
    }

    private fun drain() {
        try {
            while (!stopped) {
                val pcm = queue.poll(20, TimeUnit.MILLISECONDS) ?: continue
                if (pcm === end) {
                    // Keep playing while finish() observes the playback head. AudioTrack.stop()
                    // resets that counter immediately, even though presentation is asynchronous.
                    return
                }
                var offset = 0
                while (offset < pcm.size) {
                    if (stopped) return
                    check()
                    val n = track.write(pcm, offset, minOf(2400, pcm.size - offset))
                    if (n < 0) error("Could not play Alba audio (AudioTrack error $n)")
                    if (n == 0) sleep(10) else { offset += n; written += n }
                    if (firstAudio < 0 && track.renderedFrames > POCKET_LEAD_IN_FRAMES) firstAudio = clock()
                }
            }
        } catch (error: Throwable) {
            failure.compareAndSet(null, error)
            stopped = true
            try { track.stopNow() } catch (_: Exception) { }
        }
    }

    /**
     * Pads past the start threshold, waits for the written frames, then stops. A head that stops
     * within 100 ms of the end for 1.5 s also counts as finished (some devices stop short).
     */
    fun finish(): Triple<Long, Long, PocketFraming> {
        failure.get()?.let { throw it }
        framing = pocketFraming(maxOf(1L, queuedFrames - POCKET_LEAD_IN_FRAMES).toInt(), track.startThresholdFrames)
        if (framing.tailPad > 0) { queue.put(ShortArray(framing.tailPad)); queuedFrames += framing.tailPad }
        queue.put(end)
        val budget = clock() + pocketPlaybackBudgetMs(queuedFrames.toInt()) * 1_000_000
        var lastRendered = -1L
        var lastChange = clock()
        while (true) {
            failure.get()?.let { throw it }
            check()
            val rendered = track.renderedFrames
            val now = clock()
            if (firstAudio < 0 && rendered > POCKET_LEAD_IN_FRAMES) firstAudio = now
            if (rendered != lastRendered) { lastRendered = rendered; lastChange = now }
            if (!writer.isAlive && (rendered >= queuedFrames ||
                    (rendered >= queuedFrames - 2400 && now - lastChange > 1_500_000_000L))) break
            if (now >= budget) throw VoiceTimedOut("Alba playback did not finish ($rendered of $queuedFrames frames played). Your answer is still on screen")
            sleep(20)
        }
        failure.get()?.let { throw it }
        val now = clock()
        completedFrames = track.renderedFrames
        track.drainAndStop()
        drained = true
        return Triple(if (firstAudio < 0) -1 else (firstAudio - started) / 1_000_000, (now - started) / 1_000_000, framing)
    }

    val finishedByDrain: Boolean get() = drained
    /** Snapshot before stop() resets Android's playback head to zero. */
    var completedFrames = 0L
        private set

    fun cancel() {
        stopped = true
        try { track.stopNow() } catch (_: Exception) { }
    }

    fun close() {
        cancel()
        writer.join(1_000)
        track.release()
    }
}

/** Android media playback, foreground audio focus and an honest per-utterance report. */
internal class PocketPlayback(private val context: Context) {
    private val lock = Any()
    private var active: PocketStreamer? = null

    fun stop() = synchronized(lock) { active?.cancel() }

    private class AndroidTrack(private val track: AudioTrack) : PocketTrack {
        override val capacityFrames: Int get() = track.bufferCapacityInFrames
        override val startThresholdFrames: Int get() =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) track.startThresholdInFrames else track.bufferCapacityInFrames
        override fun play() = track.play()
        override val isPlaying get() = track.playState == AudioTrack.PLAYSTATE_PLAYING
        override fun write(pcm: ShortArray, offset: Int, count: Int) = track.write(pcm, offset, count, AudioTrack.WRITE_NON_BLOCKING)
        override val renderedFrames: Long get() = track.playbackHeadPosition.toLong() and 0xffffffffL
        override val underruns: Int get() = track.underrunCount
        override val stateLabel: String get() = (if (track.state == AudioTrack.STATE_INITIALIZED) "initialized" else "uninitialized") +
            "/" + when (track.playState) { AudioTrack.PLAYSTATE_PLAYING -> "playing"; AudioTrack.PLAYSTATE_PAUSED -> "paused"; else -> "stopped" }
        override val routeLabel: String get() = when (track.routedDevice?.type) {
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Phone speaker"
            AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "Phone earpiece"
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER -> "Bluetooth audio"
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Wired headphones"
            AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE -> "USB audio"
            null -> "Android-selected output"
            else -> "External audio output"
        }
        override fun drainAndStop() { try { track.stop() } catch (_: IllegalStateException) { } }
        override fun setGain(gain: Float) { try { track.setVolume(gain) } catch (_: IllegalStateException) { } }
        override fun stopNow() { try { track.pause(); track.flush() } catch (_: IllegalStateException) { } }
        override fun release() = track.release()
    }

    /** Focus, route watch, track and streamer for one utterance; opened when the first chunk is ready. */
    private inner class Session(check: () -> Unit, private val manager: AudioManager, attributes: AudioAttributes) {
        private val interrupted = AtomicReference<String?>(null)
        private val streamerRef = AtomicReference<PocketStreamer?>(null)
        private var audioTrack: AudioTrack? = null
        private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attributes).setOnAudioFocusChangeListener({ change ->
                when (pocketFocusAction(change)) {
                    PocketFocusAction.DUCK -> gain(POCKET_DUCKED_GAIN)
                    PocketFocusAction.RESTORE -> gain(1f)
                    PocketFocusAction.STOP -> stopFor("Speech paused because another app needed audio. Your answer is still on screen")
                    PocketFocusAction.IGNORE -> Unit
                }
            }, Handler(Looper.getMainLooper())).build()
        // Unplugged headphones or a Bluetooth drop must not move the reply to the loudspeaker.
        private val noisy = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) stopFor("Speech stopped because the headphones were disconnected. Your answer is still on screen")
            }
        }
        private var noisyRegistered = false
        val track: PocketTrack
        val streamer: PocketStreamer

        private fun gain(value: Float) { try { audioTrack?.setVolume(value) } catch (_: IllegalStateException) { } }

        private fun stopFor(reason: String) {
            interrupted.compareAndSet(null, reason)
            streamerRef.get()?.cancel()
        }

        init {
            val focusResult = manager.requestAudioFocus(focus)
            try {
                if (focusResult != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) throw VoiceAudioUnavailable("Audio is busy, for example during a call. Please try again")
                check()
                val built = AudioTrack.Builder().setAudioAttributes(attributes)
                    .setAudioFormat(AudioFormat.Builder().setSampleRate(24000).setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(maxOf(24000 * 2,
                        AudioTrack.getMinBufferSize(24000, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT))).build()
                audioTrack = built
                if (built.state != AudioTrack.STATE_INITIALIZED) throw VoiceAudioUnavailable("Could not open the speaker. Check the audio output and try again")
                if (built.setVolume(1f) != AudioTrack.SUCCESS) throw VoiceAudioUnavailable("Could not set speech playback volume")
                // Start after 200 ms of audio instead of a full buffer (API 31+); older versions are padded instead.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) built.setStartThresholdInFrames(minOf(4800, built.bufferCapacityInFrames))
                // Always 1×: pace is spoken as longer or shorter pauses, never a time-stretch.
                track = AndroidTrack(built)
                val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
                if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(noisy, filter, Context.RECEIVER_NOT_EXPORTED)
                else context.registerReceiver(noisy, filter)
                noisyRegistered = true
                streamer = PocketStreamer(track, { check(); interrupted.get()?.let { throw VoiceInterrupted(it) } })
                streamerRef.set(streamer)
                synchronized(lock) { active = streamer }
                streamer.begin()
            } catch (error: Throwable) { close(); throw error }
        }
        fun close() {
            try {
                synchronized(lock) { if (active === streamerRef.get()) active = null }
                streamerRef.get()?.close() ?: audioTrack?.release()
            } finally {
                if (noisyRegistered) { try { context.unregisterReceiver(noisy) } catch (_: IllegalArgumentException) { } }
                manager.abandonAudioFocusRequest(focus)
            }
        }
    }

    private val manager get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    /** Cheap checks before compiling a model: a muted phone or an active call fails in milliseconds. */
    fun preflight() {
        val audio = manager
        if (audio.getStreamVolume(AudioManager.STREAM_MUSIC) <= 0 || audio.isStreamMute(AudioManager.STREAM_MUSIC))
            throw VoiceAudioUnavailable("Media volume is muted. Turn up media volume and check the speaker or Bluetooth output")
        if (audio.mode == AudioManager.MODE_IN_CALL || audio.mode == AudioManager.MODE_IN_COMMUNICATION)
            throw VoiceAudioUnavailable("Audio is busy during a call. Your answer is still on screen")
    }

    /**
     * Plays chunks produced by [produce]. Focus and the track open with the first chunk, so other
     * audio is not ducked while Alba is still generating. Returns after the written frames are
     * rendered; cancellation, interruptions and a clip-length budget end it early with an error.
     */
    fun stream(check: () -> Unit, produce: ((FloatArray) -> Unit) -> Unit): PocketPlaybackReport {
        check()
        // User-requested narration: the media route and volume for speakers, wired outputs and
        // Bluetooth. Never force a device or change the system volume.
        val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
        val audio = manager
        preflight()
        var session: Session? = null
        try {
            produce { chunk -> (session ?: Session(check, audio, attributes).also { session = it }).streamer.push(chunk) }
            val active = session ?: error("Alba produced no audio")
            val (firstAudioMs, playbackMs, framing) = active.streamer.finish()
            val track = active.track
            val volume = audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 / maxOf(1, audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
            return PocketPlaybackReport(track.routeLabel, volume, "granted", track.stateLabel, track.capacityFrames, track.startThresholdFrames,
                active.streamer.written, active.streamer.completedFrames, track.underruns, framing.leadIn, framing.tailPad, firstAudioMs, playbackMs)
        } finally { session?.close() }
    }

    /** One finished clip, e.g. the model-free output check tone. */
    fun play(samples: FloatArray, check: () -> Unit): PocketPlaybackReport = stream(check) { push -> push(samples) }
}
