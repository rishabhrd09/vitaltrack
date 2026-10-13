package expo.modules.carekoshvoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.PlaybackParams
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
    fun stopNow()
    fun release()
}

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
 * waits for rendered frames within a clip-length budget, never indefinitely.
 */
internal class PocketStreamer(
    private val track: PocketTrack,
    private val pace: Float,
    private val check: () -> Unit,
    private val clock: () -> Long = System::nanoTime,
    private val sleep: (Long) -> Unit = { Thread.sleep(it) },
) {
    private val queue = LinkedBlockingQueue<ShortArray>()
    private val failure = AtomicReference<Throwable?>(null)
    @Volatile private var stopped = false
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
        check(track.isPlaying) { "Speaker playback did not start" }
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
                if (pcm === end) return
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
     * Pads past the start threshold, then waits for the written frames to be rendered. A head that
     * stops within 100 ms of the end for 1.5 s also counts as finished (some devices stop short).
     */
    fun finish(): Triple<Long, Long, PocketFraming> {
        failure.get()?.let { throw it }
        framing = pocketFraming(maxOf(1L, queuedFrames - POCKET_LEAD_IN_FRAMES).toInt(), track.startThresholdFrames)
        if (framing.tailPad > 0) { queue.put(ShortArray(framing.tailPad)); queuedFrames += framing.tailPad }
        queue.put(end)
        val budget = clock() + pocketPlaybackBudgetMs(queuedFrames.toInt(), pace) * 1_000_000
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
            kotlin.check(now < budget) {
                "Alba playback did not finish ($rendered of $queuedFrames frames rendered, ${track.underruns} underruns)"
            }
            sleep(20)
        }
        failure.get()?.let { throw it }
        val now = clock()
        return Triple(if (firstAudio < 0) -1 else (firstAudio - started) / 1_000_000, (now - started) / 1_000_000, framing)
    }

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
        override fun stopNow() { try { track.pause(); track.flush() } catch (_: IllegalStateException) { } }
        override fun release() = track.release()
    }

    /** Focus, track and streamer for one utterance; opened when the first chunk is ready. */
    private inner class Session(pace: Float, check: () -> Unit, private val manager: AudioManager, attributes: AudioAttributes) {
        private val lostFocus = java.util.concurrent.atomic.AtomicBoolean(false)
        private val streamerRef = AtomicReference<PocketStreamer?>(null)
        private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attributes).setOnAudioFocusChangeListener({
                if (it < 0) { lostFocus.set(true); streamerRef.get()?.cancel() }
            }, Handler(Looper.getMainLooper())).build()
        private var audioTrack: AudioTrack? = null
        val track: PocketTrack
        val streamer: PocketStreamer
        init {
            val focusResult = manager.requestAudioFocus(focus)
            try {
                require(focusResult == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { "Audio is busy (focus result $focusResult). Please try again" }
                check()
                val built = AudioTrack.Builder().setAudioAttributes(attributes)
                    .setAudioFormat(AudioFormat.Builder().setSampleRate(24000).setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(maxOf(24000 * 2,
                        AudioTrack.getMinBufferSize(24000, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT))).build()
                audioTrack = built
                require(built.state == AudioTrack.STATE_INITIALIZED) { "Could not open the speaker" }
                require(built.setVolume(1f) == AudioTrack.SUCCESS) { "Could not set speech playback volume" }
                // Start after 200 ms of audio instead of a full buffer (API 31+); older versions are padded instead.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) built.setStartThresholdInFrames(minOf(4800, built.bufferCapacityInFrames))
                built.playbackParams = PlaybackParams().setPitch(1f).setSpeed(pace)
                track = AndroidTrack(built)
                streamer = PocketStreamer(track, pace, { check(); kotlin.check(!lostFocus.get()) { "Speech interrupted by another app" } })
                streamerRef.set(streamer)
                synchronized(lock) { active = streamer }
                streamer.begin()
            } catch (error: Throwable) { close(); throw error }
        }
        fun close() {
            try {
                synchronized(lock) { if (active === streamerRef.get()) active = null }
                streamerRef.get()?.close() ?: audioTrack?.release()
            } finally { manager.abandonAudioFocusRequest(focus) }
        }
    }

    /**
     * Plays chunks produced by [produce]. Focus and the track open with the first chunk, so other
     * audio is not ducked while Alba is still generating. Returns after the written frames are
     * rendered; cancellation, focus loss and a clip-length budget end it early with an error.
     */
    fun stream(pace: Float, check: () -> Unit, produce: ((FloatArray) -> Unit) -> Unit): PocketPlaybackReport {
        require(pace in 0.85f..1.1f)
        check()
        // User-requested narration: the media route and volume for speakers, wired outputs and
        // Bluetooth. Never force a device or change the system volume.
        val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
        val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        require(manager.getStreamVolume(AudioManager.STREAM_MUSIC) > 0 && !manager.isStreamMute(AudioManager.STREAM_MUSIC)) {
            "Media volume is muted. Turn up media volume and check the speaker or Bluetooth output"
        }
        var session: Session? = null
        try {
            produce { chunk -> (session ?: Session(pace, check, manager, attributes).also { session = it }).streamer.push(chunk) }
            val active = session ?: error("Alba produced no audio")
            val (firstAudioMs, playbackMs, framing) = active.streamer.finish()
            val track = active.track
            val volume = manager.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 / maxOf(1, manager.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
            return PocketPlaybackReport(track.routeLabel, volume, "granted", track.stateLabel, track.capacityFrames, track.startThresholdFrames,
                active.streamer.written, track.renderedFrames, track.underruns, framing.leadIn, framing.tailPad, firstAudioMs, playbackMs)
        } finally { session?.close() }
    }

    /** One finished clip, e.g. the model-free output check tone. */
    fun play(samples: FloatArray, pace: Float, check: () -> Unit): PocketPlaybackReport = stream(pace, check) { push -> push(samples) }
}
