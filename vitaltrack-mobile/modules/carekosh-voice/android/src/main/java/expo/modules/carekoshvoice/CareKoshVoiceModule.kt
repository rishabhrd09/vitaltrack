package expo.modules.carekoshvoice

import ai.moonshine.voice.Transcriber
import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class CareKoshVoiceModule : Module() {
    /** One serial worker per native engine. A slow or stuck Alba GPU call never blocks the microphone. */
    private val speechLane = VoiceWorkLane("carekosh-moonshine")
    /** Offline voice lane: Alba and the Kokoro test voice, so their syntheses never overlap. */
    private val albaLane = VoiceWorkLane("carekosh-alba")
    private val downloadLane = VoiceWorkLane("carekosh-downloads")
    // Whistle's C API is synchronous and cannot be interrupted. It must never occupy capture's lane.
    private val whistleLane = VoiceWorkLane("carekosh-whistle")
    private val whistleRunning = AtomicBoolean(false)
    private val executor = speechLane.executor
    private val main = Handler(Looper.getMainLooper())
    /** Speech, recording and recognition: stopped by Stop, a new question or leaving the screen. */
    private val generation = AtomicInteger(0)
    /** Pack downloads: only an explicit cancel stops them, never backgrounding or another action. */
    private val downloadGeneration = AtomicInteger(0)
    private val backgroundStamp = AtomicLong(0)
    private val cleanupQueued = AtomicBoolean(false)
    // Alba and Kokoro state is touched only on the offline voice lane (Alba's GPU context affinity).
    private var albaEngine: PocketSynthesizer? = null
    private var albaVocoderFailure: String? = null
    private var kokoroEngine: KokoroEngine? = null
    private val offlineVoiceUse = AtomicLong(0)
    private var transcriber: Transcriber? = null // touched only by executor
    @Volatile private var recording: StreamingRecording? = null
    private var tts: TextToSpeech? = null // touched only on main thread
    private var ttsReady = false
    private var speechInit = 0
    private var activeSpeech: Promise? = null
    private var activeSpeechId: String? = null
    private val ttsWaiters = mutableListOf<(TextToSpeech?) -> Unit>()
    private val context
        get() = requireNotNull(appContext.reactContext) { "Voice context unavailable" }

    private val pack by lazy { ModelPack(context) }
    private val pocketPack by lazy { PocketPack(context) }
    private val kokoroPack by lazy { KokoroPack(context) }
    private val whistlePack by lazy { WhistlePack(context) }
    private val playback = lazy { PocketPlayback(context) }
    private val pocketPlayback by playback
    @Volatile private var pocketDiagnostic = "No audio check has run in this app session."

    private fun whistleStatus(check: () -> Unit): Map<String, Any> {
        val supported = WhistleRuntime.supported
        return mapOf(
            "supported" to supported,
            "ready" to (supported && whistlePack.ready(check)),
            "bytes" to whistlePack.bytes,
            "model" to WhistleRuntime.name,
            "telemetryDisabled" to (supported && WhistleRuntime.configureTelemetry()),
            "busy" to whistleRunning.get(),
            "reason" to (if (supported) "" else "Whistle needs the ARM64 diagnostic APK"),
        )
    }

    /**
     * One active C call, an independent worker, and exactly one promise settlement. The watchdog
     * bounds the screen wait but cannot abort C inference. Busy remains true until C returns, and
     * a late result is discarded without cancelling a newer microphone session.
     */
    private fun transcribeWhistle(uri: String, promise: Promise) {
        if (!WhistleRuntime.supported) {
            promise.reject("WHISTLE_UNAVAILABLE", "Whistle needs the ARM64 diagnostic APK", null)
            return
        }
        if (!whistleRunning.compareAndSet(false, true)) {
            promise.reject("WHISTLE_BUSY", "Whistle is still finishing its previous recording. Choose Moonshine or try again shortly", null)
            return
        }
        val expected = generation.get()
        val settled = AtomicBoolean(false)
        val deadline = System.nanoTime() + 45_000_000_000L
        val watchdog = Runnable {
            if (settled.compareAndSet(false, true)) {
                if (generation.get() != expected) promise.reject("SPEECH_CANCELLED", "Speech cancelled", null)
                else promise.reject("WHISTLE_TIMEOUT", "Whistle took too long. Choose Moonshine or try a shorter question", null)
            }
        }
        main.postDelayed(watchdog, 45_000)
        try {
            whistleLane.executor.execute {
                try {
                    val check = {
                        if (generation.get() != expected) throw VoiceCancelled()
                        if (System.nanoTime() >= deadline) throw VoiceTimedOut("Whistle took too long. Try a shorter question")
                    }
                    check()
                    // Whistle accepts only the finalized PCM16 WAV produced by our capture, not AAC
                    // or a caller-supplied remote/content URI. decodeRecording validates app ownership.
                    val captureName = android.net.Uri.parse(uri).lastPathSegment.orEmpty()
                    require(captureName.startsWith("carekosh-capture-") && captureName.endsWith(".wav")) { "Whistle needs a completed microphone recording" }
                    val (samples, rate) = decodeRecording(context, uri, check)
                    require(rate == 16000 && samples.size <= 448000) { "Whistle needs a mono 16 kHz recording up to 28 seconds" }
                    require(whistlePack.ready(check, refresh = true)) { "Download Whistle in Voice setup first" }
                    val text = WhistleRuntime.transcribe(whistlePack.model, samples, check)
                    check()
                    if (settled.compareAndSet(false, true)) promise.resolve(mapOf("transcript" to text, "requires_confirmation" to true))
                } catch (error: Throwable) {
                    if (settled.compareAndSet(false, true)) {
                        when (error) {
                            is VoiceCancelled -> promise.reject(error.code, error.message, null)
                            is VoiceTimedOut -> promise.reject("WHISTLE_TIMEOUT", error.message, null)
                            is LinkageError -> promise.reject("WHISTLE_UNAVAILABLE", "Whistle is unavailable in this build or CPU architecture", null)
                            is OutOfMemoryError -> promise.reject("VOICE_MEMORY", "Not enough memory for Whistle. Choose Moonshine or type", null)
                            else -> promise.reject("WHISTLE_FAILED", "Whistle could not transcribe this recording. Try again, choose Moonshine or type", null)
                        }
                    }
                } finally {
                    main.removeCallbacks(watchdog)
                    whistleRunning.set(false)
                }
            }
        } catch (_: RejectedExecutionException) {
            main.removeCallbacks(watchdog)
            whistleRunning.set(false)
            if (settled.compareAndSet(false, true)) promise.reject("VOICE_CLOSED", "Voice screen closed", null)
        }
    }

    /** [cancelledBy] is the counter whose change cancels this task; null runs it to completion. */
    private fun work(promise: Promise, cancelledBy: AtomicInteger? = generation, lane: VoiceWorkLane = speechLane, task: (() -> Unit) -> Any?) {
        val expected = cancelledBy?.get()
        if (lane.pending.incrementAndGet() > 4) {
            lane.pending.decrementAndGet()
            promise.reject("VOICE_BUSY", "Offline speech is busy. Please try again shortly.", null)
            return
        }
        try {
            lane.executor.execute {
                try {
                    val check = { if (cancelledBy != null && expected != cancelledBy.get()) throw VoiceCancelled() }
                    check()
                    val result = task(check)
                    check()
                    promise.resolve(result)
                } catch (_: LinkageError) {
                    promise.reject(
                        "VOICE_RUNTIME",
                        "Offline speech is not available in this build or CPU architecture.",
                        null,
                    )
                } catch (_: OutOfMemoryError) {
                    promise.reject("VOICE_MEMORY", "Not enough memory for offline speech. Your answer is still on screen.", null)
                } catch (e: VoiceError) {
                    promise.reject(e.code, e.message ?: "Offline voice unavailable", null)
                } catch (e: Exception) {
                    promise.reject("VOICE_OPERATION", e.message ?: "Offline voice unavailable", e)
                } catch (e: Throwable) {
                    // Any other Error (stack overflow, internal VM error) must still settle the promise;
                    // otherwise the screen would wait forever.
                    promise.reject("VOICE_FAILURE", "Offline speech stopped unexpectedly (${e.javaClass.simpleName}). Your answer is still on screen.", null)
                } finally {
                    lane.pending.decrementAndGet()
                }
            }
        } catch (e: RejectedExecutionException) {
            lane.pending.decrementAndGet()
            promise.reject("VOICE_CLOSED", "Voice screen closed", e)
        }
    }

    /** Runs housekeeping on the Alba lane; never concurrently with an in-flight inference. */
    private fun onAlbaLane(task: () -> Unit) {
        try { albaLane.executor.execute { try { task() } catch (_: Throwable) { } } } catch (_: RejectedExecutionException) { }
    }

    private fun releaseAlba() { // offline voice lane only
        albaEngine?.close()
        albaEngine = null
    }
    private fun releaseKokoro() { // offline voice lane only
        kokoroEngine?.close()
        kokoroEngine = null
    }
    private fun releaseOfflineVoices() { releaseAlba(); releaseKokoro() }

    /**
     * Expo reports "background" on every Activity pause, including permission dialogs and the share
     * sheet. Warm engines are released only if CareKosh stays hidden for 30 s.
     */
    private fun releaseVoicesIfStillHidden() {
        val stamp = backgroundStamp.incrementAndGet()
        main.postDelayed({ if (backgroundStamp.get() == stamp) onAlbaLane { if (backgroundStamp.get() == stamp) releaseOfflineVoices() } }, 30_000)
    }

    /** Android asks for memory back: drop the warm Alba (about 1 GB) and Kokoro engines; they load again when needed. */
    private val memoryCallbacks = object : ComponentCallbacks2 {
        override fun onTrimMemory(level: Int) {
            @Suppress("DEPRECATION")
            if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW && level != ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN) onAlbaLane { releaseOfflineVoices() }
        }
        override fun onConfigurationChanged(newConfig: Configuration) {}
        @Deprecated("Deprecated in Java")
        override fun onLowMemory() { onAlbaLane { releaseOfflineVoices() } }
    }
    @Volatile private var memoryRegistered: Context? = null

    /** Phones with little memory get a warning before the Alba download; nothing is blocked. */
    private fun lowMemoryDevice(): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val info = ActivityManager.MemoryInfo().also { manager.getMemoryInfo(it) }
        return manager.isLowRamDevice || info.totalMem < 6L * 1024 * 1024 * 1024
    }

    /** Loaded models stay warm between replies, then free their memory after 90 s of no use. */
    private fun scheduleOfflineRelease() {
        val stamp = offlineVoiceUse.incrementAndGet()
        main.postDelayed({ if (offlineVoiceUse.get() == stamp) onAlbaLane { if (offlineVoiceUse.get() == stamp) releaseOfflineVoices() } }, 90_000)
    }

    private fun cancel() {
        generation.incrementAndGet()
        if (playback.isInitialized()) pocketPlayback.stop()
        val previousRecording = recording
        previousRecording?.cancel() // Release the mic promptly; join only on worker.
        main.post {
            tts?.stop()
            activeSpeech?.reject("SPEECH_CANCELLED", "Speech cancelled", null)
            activeSpeech = null
            activeSpeechId = null
        }
        // Never free native memory concurrently with an in-flight inference.
        if (!cleanupQueued.compareAndSet(false, true)) return
        try {
            executor.execute {
                try {
                    previousRecording?.discard()
                    if (recording === previousRecording) recording = null
                    transcriber?.close()
                    transcriber = null
                } finally {
                    cleanupQueued.set(false)
                }
            }
        } catch (_: RejectedExecutionException) {
            /* Already shut down after module destruction. */
        }
    }

    private fun withSpeech(
        promise: Promise,
        cancellable: Boolean = true,
        resolveImmediately: Boolean = true,
        action: (TextToSpeech) -> Any?,
    ) {
        val expected = generation.get()
        main.post {
            val complete: (TextToSpeech?) -> Unit = { engine ->
                try {
                    if (cancellable && expected != generation.get()) throw VoiceCancelled()
                    requireNotNull(engine) {
                        "Install an offline English voice in Android Text-to-speech settings"
                    }
                    val result = action(engine)
                    if (resolveImmediately) promise.resolve(result)
                } catch (e: Exception) {
                    if (activeSpeech === promise) {
                        activeSpeech = null
                        activeSpeechId = null
                    }
                    if (e is VoiceError) promise.reject(e.code, e.message, null) else promise.reject("DEVICE_SPEECH", e.message, e)
                }
            }
            if (ttsReady) complete(tts)
            else {
                ttsWaiters.add(complete)
                if (tts == null) {
                    val attempt = ++speechInit
                    main.postDelayed(
                        {
                            if (attempt == speechInit && !ttsReady) {
                                speechInit++
                                val callbacks = ttsWaiters.toList()
                                ttsWaiters.clear()
                                callbacks.forEach { it(null) }
                                tts?.shutdown()
                                tts = null
                            }
                        },
                        10_000,
                    )
                    tts =
                        TextToSpeech(context) { result ->
                            main.post {
                                if (attempt != speechInit) return@post
                                ttsReady = result == TextToSpeech.SUCCESS
                                val callbacks = ttsWaiters.toList()
                                ttsWaiters.clear()
                                callbacks.forEach { it(if (ttsReady) tts else null) }
                                if (!ttsReady) {
                                    tts?.shutdown()
                                    tts = null
                                }
                            }
                        }
                }
            }
        }
    }

    private fun localVoice(engine: TextToSpeech): Voice? =
        engine.voices
            .orEmpty()
            .filter {
                !it.isNetworkConnectionRequired &&
                    it.locale.language == "en" &&
                    !it.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
            }
            .sortedWith(
                compareByDescending<Voice> { it.locale.country == "IN" }
                    .thenByDescending { it.quality }
                    .thenBy { it.name }
            )
            .firstOrNull()

    private fun diagnosticsFor(id: String?): PocketDiagnostics {
        val operation = id ?: "speech-${System.currentTimeMillis()}"
        val diagnostics = PocketDiagnostics(operation, sink = { Log.i("CareKoshVoice", it) })
        val app = try {
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            "${info.versionName} (${if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()})"
        } catch (_: Exception) { "unknown" }
        diagnostics.note("app $app · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}) · ${Build.MANUFACTURER} ${Build.MODEL} · ${Build.SUPPORTED_ABIS.firstOrNull() ?: "?"}")
        return diagnostics
    }

    /** Alba lane: reuse the compiled engine (switching only the voice state), or build it once for this placement. */
    private fun albaEngineFor(placement: PocketPlacement, voiceFile: String, check: () -> Unit, diagnostics: PocketDiagnostics, report: (String, Int?) -> Unit): PocketSynthesizer {
        albaEngine?.let { engine ->
            if (engine.placement == placement) {
                engine.useVoice(voiceFile)
                diagnostics.note("engine warm (reused) · ${engine.placements}")
                return engine
            }
            releaseAlba()
        }
        albaVocoderFailure?.let { throw VoiceError("ENGINE_UNAVAILABLE", it) } // remembered for this process: no repeated multi-second compiles
        report("loading", null)
        releaseKokoro() // one offline voice in memory at a time
        val engine = PocketSynthesizer(pocketPack.root, placement, voiceFile)
        try {
            engine.initialize(check)
        } catch (e: PocketVocoderUnavailable) {
            albaVocoderFailure = e.message
            diagnostics.note("vocoder GPU compile failed: ${e.cause?.javaClass?.simpleName}: ${e.cause?.message.orEmpty().take(160)}")
            throw e
        }
        diagnostics.note("engine cold, initialized in ${engine.initializeMs} ms · ${engine.placements}")
        albaEngine = engine
        return engine
    }

    /**
     * Generates Alba speech chunk by chunk and (unless [play] is false) streams each chunk as soon as
     * it is decoded. Records a bounded diagnostic for this utterance; no text or audio is retained.
     */
    private fun speakPocket(text: String, pace: Double, id: String?, promise: Promise, play: Boolean = true, placementName: String = "default", voice: String = "alba") {
        work(promise, lane = albaLane) { check ->
            require(text.isNotBlank() && text.length <= 640 && pace in 0.85..1.1) { "Invalid speech request" }
            require(id == null || id.matches(Regex("[a-zA-Z0-9-]{1,80}"))) { "Invalid speech request" }
            offlineVoiceUse.incrementAndGet() // cancels a pending idle release
            val placement = PocketPlacement.named(placementName)
            val voiceFile = pocketPack.voiceFile(voice)
            val deadline = System.nanoTime() + 180_000_000_000L
            val requestStart = System.nanoTime()
            val diagnostics = diagnosticsFor(id)
            diagnostics.note("Pocket TTS voice $voice · LiteRT 2.1.6 · ${placement.label} · 24 kHz mono PCM16 · media route · pace $pace as pauses · ${if (play) "speak" else "synthesis only"}")
            diagnostics.note("text: ${text.length} characters (content not recorded)")
            pocketDiagnostic = diagnostics.text()
            val boundedCheck = { check(); if (System.nanoTime() >= deadline) throw VoiceTimedOut("Alba took too long. Try a shorter reply or select Device voice in Voice setup") }
            var stage = ""
            var playing = false
            val report: (String, Int?) -> Unit = { next, frames ->
                boundedCheck()
                if (next != stage) { diagnostics.note("stage $next"); stage = next }
                // Once audio is playing, later generation stages would only confuse the status line.
                if (id != null && (!playing || next == "playing")) sendEvent("pocketSpeechProgress",
                    if (frames == null) mapOf("id" to id, "stage" to next) else mapOf("id" to id, "stage" to next, "frames" to frames))
            }
            var firstChunkMs = -1L
            try {
                report("verifying", null)
                require(pocketPack.ready(voice, boundedCheck)) { "Download this Alba voice in Voice setup first" }
                // A muted phone or an active call fails here, before compiling about 1 GB of models.
                if (play) pocketPlayback.preflight()
                val engine = albaEngineFor(placement, voiceFile, boundedCheck, diagnostics, report)
                report("generating", null)
                var index = 0
                fun deliver(audio: FloatArray, push: ((FloatArray) -> Unit)?) {
                    val levels = pocketMeasure(audio)
                    diagnostics.note("chunk ${++index} waveform: ${audio.size} samples, ${levels.describe()}")
                    if (firstChunkMs < 0) firstChunkMs = (System.nanoTime() - requestStart) / 1_000_000
                    if (push != null) {
                        if (!playing) { playing = true; report("playing", null) }
                        push(audio)
                    } else pocketAudioLevels(audio)
                }
                val result = if (play) {
                    var synthesis: PocketSynthesizer.Result? = null
                    val playbackReport = pocketPlayback.stream(boundedCheck) { push ->
                        synthesis = engine.synthesize(text, boundedCheck, report, pace.toFloat()) { deliver(it, push) }
                    }
                    synthesis?.chunks?.forEachIndexed { i, chunk -> diagnostics.note(chunk.describe(i + 1)) }
                    diagnostics.note(playbackReport.describe())
                    val firstAudio = if (playbackReport.firstAudioMs >= 0 && firstChunkMs >= 0) firstChunkMs + playbackReport.firstAudioMs else -1
                    diagnostics.note("completed in ${(System.nanoTime() - requestStart) / 1_000_000} ms · first audible frame about $firstAudio ms after the request")
                    playbackReport.asMap()
                } else {
                    val synthesis = engine.synthesize(text, boundedCheck, report, pace.toFloat()) { deliver(it, null) }
                    synthesis.chunks.forEachIndexed { i, chunk -> diagnostics.note(chunk.describe(i + 1)) }
                    diagnostics.note("synthesis only: ${synthesis.samples} samples (${"%.2f".format(synthesis.samples / 24000.0)} s) in ${synthesis.ms} ms; nothing played")
                    mapOf("output" to "none (synthesis only)", "volumePercent" to 0, "audioSeconds" to synthesis.samples / 24000.0, "frames" to synthesis.samples)
                }
                result
            } catch (e: Throwable) {
                val cancelled = e is VoiceCancelled
                diagnostics.note("${if (cancelled) "cancelled" else "failed"} at stage '$stage': ${e.javaClass.simpleName}${if (cancelled) "" else ": " + e.message.orEmpty().take(200)}")
                // Only an inference or compile failure may leave inconsistent native state. Cancellation,
                // interruptions, muted audio and timeouts keep the engine warm for the next reply.
                if (!pocketKeepsEngine(e)) releaseAlba()
                throw e
            } finally {
                pocketDiagnostic = diagnostics.text()
                scheduleOfflineRelease()
            }
        }
    }

    /** Offline voice lane: reuse the loaded Kokoro voice, or load it once (Alba is released first). */
    private fun kokoroEngineFor(voice: String, check: () -> Unit, diagnostics: PocketDiagnostics, report: (String) -> Unit): KokoroEngine {
        kokoroEngine?.let { engine ->
            if (engine.voice == voice) { diagnostics.note("Kokoro warm (reused)"); return engine }
            releaseKokoro()
        }
        report("loading")
        releaseAlba() // one offline voice in memory at a time
        check()
        val engine = KokoroEngine(context, kokoroPack.root, voice)
        diagnostics.note("Kokoro cold, loaded in ${engine.loadMs} ms")
        kokoroEngine = engine
        return engine
    }

    /**
     * Diagnostics builds only. Kokoro speech sentence group by sentence group, each played (unless [play]
     * is false) as soon as it is ready, through the same focus-aware AudioTrack path as Alba. Records
     * time to first audio, real-time factor, total time and native heap; never the text or audio.
     */
    private fun speakKokoro(text: String, pace: Double, id: String?, voice: String, play: Boolean, promise: Promise) {
        work(promise, lane = albaLane) { check ->
            require(text.isNotBlank() && text.length <= 640) { "Invalid speech request" }
            require(id == null || id.matches(Regex("[a-zA-Z0-9-]{1,80}"))) { "Invalid speech request" }
            kokoroSpeed(pace)
            kokoroPack.requireVoice(voice)
            offlineVoiceUse.incrementAndGet() // cancels a pending idle release
            val deadline = System.nanoTime() + 180_000_000_000L
            val requestStart = System.nanoTime()
            val diagnostics = diagnosticsFor(id)
            diagnostics.note("Kokoro-82M voice $voice · moonshine-voice 0.1.5 (ONNX Runtime, CPU) · 24 kHz mono PCM16 · media route · speed $pace · ${if (play) "speak" else "synthesis only"}")
            diagnostics.note("text: ${text.length} characters (content not recorded)")
            pocketDiagnostic = diagnostics.text()
            val boundedCheck = { check(); if (System.nanoTime() >= deadline) throw VoiceTimedOut("Kokoro took too long. Try a shorter reply or select Device voice in Voice setup") }
            var stage = ""
            var playing = false
            val report: (String) -> Unit = { next ->
                boundedCheck()
                if (next != stage) { diagnostics.note("stage $next"); stage = next }
                if (id != null && (!playing || next == "playing")) sendEvent("kokoroSpeechProgress", mapOf("id" to id, "stage" to next))
            }
            var peakNative = android.os.Debug.getNativeHeapAllocatedSize()
            try {
                report("verifying")
                require(kokoroPack.ready(voice, boundedCheck)) { "Download this Kokoro voice in Voice setup first" }
                if (play) pocketPlayback.preflight()
                val engine = kokoroEngineFor(voice, boundedCheck, diagnostics, report)
                peakNative = maxOf(peakNative, android.os.Debug.getNativeHeapAllocatedSize())
                report("generating")
                val chunks = engine.chunks(text)
                var synthesisMs = 0L
                var samples = 0L
                var firstChunkMs = -1L
                fun produce(push: ((FloatArray) -> Unit)?) {
                    for ((index, chunk) in chunks.withIndex()) {
                        boundedCheck()
                        val started = System.nanoTime()
                        val raw = engine.synthesize(chunk, pace)
                        val ms = (System.nanoTime() - started) / 1_000_000
                        boundedCheck() // a long native call may outlive cancellation
                        peakNative = maxOf(peakNative, android.os.Debug.getNativeHeapAllocatedSize())
                        pocketAudioLevels(raw, "Kokoro")
                        val audio = kokoroHeadroom(pocketEvenLoudness(raw))
                        synthesisMs += ms; samples += raw.size
                        diagnostics.note("chunk ${index + 1}: ${chunk.length} characters → %.2f s audio in %d ms (real-time factor %.2f) · %s"
                            .format(raw.size / 24000.0, ms, ms / 1000.0 / maxOf(0.001, raw.size / 24000.0), pocketMeasure(audio).describe()))
                        if (firstChunkMs < 0) firstChunkMs = (System.nanoTime() - requestStart) / 1_000_000
                        if (push != null) {
                            if (!playing) { playing = true; report("playing") }
                            push(audio)
                        }
                    }
                }
                val result = if (play) {
                    val playbackReport = pocketPlayback.stream(boundedCheck) { push -> produce(push) }
                    diagnostics.note(playbackReport.describe())
                    val firstAudio = if (playbackReport.firstAudioMs >= 0 && firstChunkMs >= 0) firstChunkMs + playbackReport.firstAudioMs else -1
                    diagnostics.note("first audible frame about $firstAudio ms after the request")
                    playbackReport.asMap()
                } else {
                    produce(null)
                    mapOf("output" to "none (synthesis only)", "volumePercent" to 0, "audioSeconds" to samples / 24000.0, "frames" to samples)
                }
                diagnostics.note("Kokoro: ${chunks.size} chunk(s), first chunk ready $firstChunkMs ms after the request, synthesis real-time factor %.2f, total %d ms, peak native heap %d MB"
                    .format(synthesisMs / 1000.0 / maxOf(0.001, samples / 24000.0), (System.nanoTime() - requestStart) / 1_000_000, peakNative / 1_048_576))
                result
            } catch (e: Throwable) {
                val cancelled = e is VoiceCancelled
                diagnostics.note("${if (cancelled) "cancelled" else "failed"} at stage '$stage': ${e.javaClass.simpleName}${if (cancelled) "" else ": " + e.message.orEmpty().take(200)}")
                if (!pocketKeepsEngine(e)) releaseKokoro()
                throw e
            } finally {
                pocketDiagnostic = diagnostics.text()
                scheduleOfflineRelease()
            }
        }
    }

    override fun definition() = ModuleDefinition {
        Name("CareKoshVoice")
        Events("modelDownloadProgress", "liveTranscript", "pocketDownloadProgress", "pocketSpeechProgress", "kokoroDownloadProgress", "kokoroSpeechProgress", "whistleDownloadProgress")

        AsyncFunction("whistleStatus") { promise: Promise ->
            // No native load and no wait behind inference, even after a C API timeout.
            work(promise, cancelledBy = null, lane = downloadLane) { check -> whistleStatus(check) }
        }
        AsyncFunction("downloadWhistleModel") { promise: Promise ->
            work(promise, cancelledBy = downloadGeneration, lane = downloadLane) { check ->
                require(WhistleRuntime.supported) { "Whistle needs the ARM64 diagnostic APK" }
                var lastEvent = 0L
                whistlePack.install(check) { done, total ->
                    val now = System.nanoTime()
                    if (now - lastEvent > 250_000_000 || done == total) {
                        lastEvent = now
                        sendEvent("whistleDownloadProgress", mapOf("downloaded" to done, "total" to total))
                    }
                }
                whistleStatus(check)
            }
        }
        AsyncFunction("removeWhistleModel") { promise: Promise ->
            if (!WhistleRuntime.supported) promise.reject("WHISTLE_UNAVAILABLE", "Whistle needs the ARM64 diagnostic APK", null)
            else if (!whistleRunning.compareAndSet(false, true)) promise.reject("WHISTLE_BUSY", "Stop and wait for Whistle to finish before removing it", null)
            else try {
                downloadGeneration.incrementAndGet()
                downloadLane.executor.execute {
                    try { whistlePack.remove(); promise.resolve(null) }
                    catch (_: Throwable) { promise.reject("WHISTLE_FAILED", "Could not remove Whistle. Please retry", null) }
                    finally { whistleRunning.set(false) }
                }
            } catch (_: RejectedExecutionException) {
                whistleRunning.set(false)
                promise.reject("VOICE_CLOSED", "Voice screen closed", null)
            }
        }
        AsyncFunction("transcribeWhistle") { uri: String, promise: Promise -> transcribeWhistle(uri, promise) }

        AsyncFunction("pocketVoiceStatus") { promise: Promise ->
            work(promise, cancelledBy = null, lane = albaLane) { check ->
                val supported = android.os.Build.SUPPORTED_ABIS.any { it == "arm64-v8a" || it == "x86_64" }
                val ready = if (supported) pocketPack.readyVoices(check) else emptyList()
                mapOf("supported" to supported, "ready" to ("alba" in ready), "readyVoices" to ready,
                    "voices" to pocketPack.voices.map { mapOf("id" to it.id, "label" to it.label) },
                    "bytes" to pocketPack.bytes(), "lowMemory" to lowMemoryDevice(), "name" to "Alba · Pocket TTS · English")
            }
        }
        AsyncFunction("downloadPocketVoice") { voice: String, promise: Promise ->
            work(promise, cancelledBy = downloadGeneration, lane = downloadLane) { check ->
                require(android.os.Build.SUPPORTED_ABIS.any { it == "arm64-v8a" || it == "x86_64" }) { "Alba needs a 64-bit Android device" }
                pocketPack.voiceFile(voice)
                onAlbaLane { albaVocoderFailure = null }
                var lastEvent = 0L
                pocketPack.install(voice, check) { done, total ->
                    val now = System.nanoTime()
                    if (now - lastEvent > 250_000_000 || done == total) {
                        lastEvent = now
                        sendEvent("pocketDownloadProgress", mapOf("downloaded" to done, "total" to total))
                    }
                }
                mapOf("ready" to true, "supported" to true, "readyVoices" to pocketPack.readyVoices(check), "bytes" to pocketPack.bytes(voice), "name" to "Alba · Pocket TTS · English")
            }
        }
        AsyncFunction("removePocketVoice") { promise: Promise ->
            // Only the Alba folder: Moonshine recognition, inventory, drafts and orders are untouched.
            downloadGeneration.incrementAndGet()
            work(promise, cancelledBy = null, lane = albaLane) { _ -> releaseAlba(); albaVocoderFailure = null; pocketPack.remove(); null }
        }
        AsyncFunction("speakPocket") { text: String, pace: Double, voice: String, promise: Promise ->
            speakPocket(text, pace, null, promise, voice = voice)
        }
        AsyncFunction("speakPocketWithProgress") { text: String, pace: Double, id: String, voice: String, promise: Promise ->
            speakPocket(text, pace, id, promise, voice = voice)
        }
        // Diagnostics builds only: synthesis without playback and named placement experiments.
        AsyncFunction("speakPocketDiagnostic") { text: String, pace: Double, id: String, play: Boolean, placement: String, voice: String, promise: Promise ->
            speakPocket(text, pace, id, promise, play, placement, voice)
        }
        // Kokoro test voice (diagnostics builds only; the app never offers it otherwise).
        AsyncFunction("kokoroVoiceStatus") { promise: Promise ->
            work(promise, cancelledBy = null, lane = albaLane) { check ->
                val supported = android.os.Build.SUPPORTED_ABIS.any { it == "arm64-v8a" || it == "x86_64" }
                mapOf("supported" to supported, "readyVoices" to (if (supported) kokoroPack.readyVoices(check) else emptyList()),
                    "voices" to kokoroPack.voices.map { mapOf("id" to it.id, "label" to it.label) },
                    "bytes" to kokoroPack.bytes(), "lowMemory" to lowMemoryDevice(), "name" to "Kokoro-82M · English (test)")
            }
        }
        AsyncFunction("downloadKokoroVoice") { voice: String, promise: Promise ->
            work(promise, cancelledBy = downloadGeneration, lane = downloadLane) { check ->
                require(android.os.Build.SUPPORTED_ABIS.any { it == "arm64-v8a" || it == "x86_64" }) { "Kokoro needs a 64-bit Android device" }
                kokoroPack.requireVoice(voice)
                var lastEvent = 0L
                kokoroPack.install(voice, check) { done, total ->
                    val now = System.nanoTime()
                    if (now - lastEvent > 250_000_000 || done == total) {
                        lastEvent = now
                        sendEvent("kokoroDownloadProgress", mapOf("downloaded" to done, "total" to total))
                    }
                }
                mapOf("supported" to true, "readyVoices" to kokoroPack.readyVoices(check),
                    "voices" to kokoroPack.voices.map { mapOf("id" to it.id, "label" to it.label) },
                    "bytes" to kokoroPack.bytes(voice), "lowMemory" to lowMemoryDevice(), "name" to "Kokoro-82M · English (test)")
            }
        }
        AsyncFunction("removeKokoroVoice") { promise: Promise ->
            // Only the Kokoro folder: Alba, Moonshine recognition, inventory, drafts and orders are untouched.
            downloadGeneration.incrementAndGet()
            work(promise, cancelledBy = null, lane = albaLane) { _ -> releaseKokoro(); kokoroPack.remove(); null }
        }
        AsyncFunction("speakKokoro") { text: String, pace: Double, id: String, voice: String, play: Boolean, promise: Promise ->
            speakKokoro(text, pace, id, voice, play, promise)
        }
        AsyncFunction("pocketAudioDiagnostic") { promise: Promise -> promise.resolve(pocketDiagnostic) }
        AsyncFunction("checkPocketAudioOutput") { promise: Promise ->
            work(promise, lane = albaLane) { check ->
                val deadline = System.nanoTime() + 10_000_000_000L
                val boundedCheck = { check(); if (System.nanoTime() >= deadline) throw VoiceTimedOut("Audio output check timed out") }
                val diagnostics = diagnosticsFor("output-check-${System.currentTimeMillis()}")
                diagnostics.note("output check · no model generation · 0.5 s 440 Hz tone · 24 kHz mono PCM16 · media route")
                try {
                    val result = pocketPlayback.play(pocketOutputTone(), boundedCheck)
                    diagnostics.note(result.describe())
                    result.asMap()
                } catch (e: Throwable) {
                    diagnostics.note("output check failed: ${e.javaClass.simpleName}: ${e.message.orEmpty().take(200)}"); throw e
                } finally { pocketDiagnostic = diagnostics.text() }
            }
        }
        AsyncFunction("pocketLicenceArchive") { promise: Promise ->
            work(promise, lane = albaLane) { check ->
                val file = java.io.File(context.cacheDir, "carekosh-pocket-licences.zip")
                java.util.zip.ZipOutputStream(file.outputStream().buffered()).use { zip ->
                    for (folder in listOf("pocket-licences", "whistle-licences")) {
                        for (name in requireNotNull(context.assets.list(folder))) {
                            check()
                            require(name.matches(Regex("[A-Za-z0-9_.-]+"))) { "Invalid licence file" }
                            val exported = if (folder == "pocket-licences") name.removeSuffix(".gz") else "whistle/$name"
                            zip.putNextEntry(java.util.zip.ZipEntry(exported))
                            context.assets.open("$folder/$name").use { input ->
                                if (name.endsWith(".gz")) java.util.zip.GZIPInputStream(input).use { it.copyTo(zip) }
                                else input.copyTo(zip)
                            }
                            zip.closeEntry()
                        }
                    }
                }
                android.net.Uri.fromFile(file).toString()
            }
        }

        AsyncFunction("prepareCapture") { id: String, preview: Boolean, promise: Promise ->
            work(promise) { check ->
                require(id.matches(Regex("[a-zA-Z0-9-]{1,80}"))) { "Invalid recording request" }
                check(recording == null) { "Microphone is still stopping" }
                transcriber?.close()
                transcriber = null
                var engine: Transcriber? = null
                var take: StreamingRecording? = null
                try {
                    if (preview) {
                        require(pack.ready(check, refresh = true)) {
                            "Download the English speech pack for live words"
                        }
                        engine = Transcriber()
                        try { engine.loadFromFiles(pack.root.path, pack.architecture) }
                        catch (error: Throwable) { pack.forget(); throw error }
                        engine.setUpdateInterval(0.5)
                    }
                    check()
                    val expected = generation.get()
                    take =
                        StreamingRecording(context, id, engine) { event ->
                            if (expected == generation.get()) sendEvent("liveTranscript", event)
                        }
                    check()
                    recording = take
                    // Publishing ownership before this check lets cancellation find the take.
                    // If it raced with preparation, the catch still disposes our own resources.
                    check()
                    mapOf("uri" to take.uri)
                } catch (error: Throwable) {
                    if (take != null) take.discard() else engine?.close()
                    if (recording === take) recording = null
                    throw error
                }
            }
        }
        AsyncFunction("startCapture") { id: String, promise: Promise ->
            work(promise) { check ->
                val take = requireNotNull(recording) { "Microphone was not prepared" }
                require(take.id == id) { "This recording is no longer current" }
                check()
                take.start()
                true
            }
        }
        AsyncFunction("finishCapture") { id: String, promise: Promise ->
            recording?.takeIf { it.id == id }?.requestStop()
            work(promise) { _ ->
                val take = requireNotNull(recording) { "Recording is no longer available" }
                require(take.id == id) { "This recording is no longer current" }
                try {
                    mapOf("uri" to take.finish())
                } catch (error: Throwable) {
                    take.discard()
                    throw error
                } finally {
                    if (recording === take) recording = null
                }
            }
        }

        AsyncFunction("modelStatus") { promise: Promise ->
            work(promise, cancelledBy = null) { check ->
                mapOf(
                    "ready" to pack.ready(check),
                    "bytes" to pack.bytes,
                    "model" to "Moonshine Small Streaming · English",
                )
            }
        }
        AsyncFunction("downloadModel") { promise: Promise ->
            work(promise, cancelledBy = downloadGeneration, lane = downloadLane) { check ->
                var lastEvent = 0L
                pack.install(check) { done, total ->
                    val now = System.nanoTime()
                    if (now - lastEvent > 250_000_000 || done == total) {
                        lastEvent = now
                        sendEvent(
                            "modelDownloadProgress",
                            mapOf("downloaded" to done, "total" to total),
                        )
                    }
                }
                mapOf("ready" to pack.ready(check), "bytes" to pack.bytes)
            }
        }
        AsyncFunction("removeModel") { promise: Promise ->
            downloadGeneration.incrementAndGet()
            work(promise) { _ ->
                transcriber?.close()
                transcriber = null
                pack.remove()
                null
            }
        }
        AsyncFunction("transcribe") { uri: String, promise: Promise ->
            work(promise) { check ->
                val (samples, rate) = decodeRecording(context, uri, check)
                if (transcriber == null) {
                    require(pack.ready(check, refresh = true)) {
                        "Download the English offline speech pack in AI & Voice settings first"
                    }
                    val engine = Transcriber()
                    try {
                        engine.loadFromFiles(pack.root.path, pack.architecture)
                        transcriber = engine
                    } catch (e: Throwable) {
                        engine.close()
                        pack.forget() // a file may have changed: hash the pack again next time
                        throw e
                    }
                }
                check()
                val text =
                    requireNotNull(transcriber)
                        .transcribeWithoutStreaming(samples, rate)
                        .text()
                        .trim()
                check()
                require(text.length in 1..600 && text.any { it.isLetter() }) {
                    "Speech was unclear. Please try again or type"
                }
                mapOf("transcript" to text, "requires_confirmation" to true)
            }
        }
        AsyncFunction("deviceVoiceStatus") { promise: Promise ->
            withSpeech(promise, cancellable = false) { engine ->
                val voice = localVoice(engine)
                mapOf(
                    "ready" to (voice != null),
                    "name" to (voice?.name ?: "No offline English voice installed"),
                )
            }
        }
        AsyncFunction("speakOffline") { text: String, promise: Promise ->
            // Resolve when speech finishes, not when it is merely queued. The UI
            // can then give the user a full reading window without cutting speech.
            withSpeech(promise, resolveImmediately = false) { engine ->
                require(text.isNotBlank() && text.length <= 640) { "Invalid speech request" }
                val voice =
                    requireNotNull(localVoice(engine)) {
                        "Install an offline English voice in Android Text-to-speech settings"
                    }
                check(engine.setVoice(voice) == TextToSpeech.SUCCESS) {
                    "Offline voice unavailable"
                }
                activeSpeech?.reject("SPEECH_CANCELLED", "Replaced by another reply", null)
                val utterance = "carekosh-reply-${System.nanoTime()}"
                activeSpeech = promise
                activeSpeechId = utterance
                engine.setOnUtteranceProgressListener(
                    object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) {}

                        override fun onDone(utteranceId: String?) {
                            finishSpeech(utteranceId, false)
                        }

                        @Suppress("DEPRECATION")
                        override fun onError(utteranceId: String?) {
                            finishSpeech(utteranceId, true)
                        }

                        override fun onStop(utteranceId: String?, interrupted: Boolean) {
                            finishSpeech(utteranceId, true)
                        }

                        private fun finishSpeech(id: String?, failed: Boolean) {
                            main.post {
                                if (id == activeSpeechId) {
                                    if (failed)
                                        activeSpeech?.reject(
                                            "DEVICE_SPEECH",
                                            "Speech interrupted",
                                            null,
                                        )
                                    else activeSpeech?.resolve(null)
                                    activeSpeech = null
                                    activeSpeechId = null
                                }
                            }
                        }
                    }
                )
                check(
                    engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, utterance) ==
                        TextToSpeech.SUCCESS
                ) {
                    "Could not play the offline voice"
                }
                // Some device engines never report completion. Bound the wait.
                main.postDelayed(
                    {
                        if (activeSpeechId == utterance) {
                            engine.stop()
                            activeSpeech?.reject("DEVICE_SPEECH", "Device speech timed out", null)
                            activeSpeech = null
                            activeSpeechId = null
                        }
                    },
                    90_000,
                )
                null
            }
        }
        Function("cancel") { cancel() }
        // Only explicit Cancel or Remove stops a pack download; partial files are kept for resuming.
        Function("cancelDownloads") { downloadGeneration.incrementAndGet() }
        OnCreate {
            appContext.reactContext?.applicationContext?.let { app ->
                app.registerComponentCallbacks(memoryCallbacks)
                memoryRegistered = app
            }
        }
        OnActivityEntersBackground {
            cancel() // the microphone and speech stop while CareKosh is hidden; downloads continue
            releaseVoicesIfStillHidden()
        }
        OnActivityEntersForeground { backgroundStamp.incrementAndGet() }
        OnDestroy {
            memoryRegistered?.unregisterComponentCallbacks(memoryCallbacks)
            memoryRegistered = null
            downloadGeneration.incrementAndGet()
            downloadLane.executor.shutdown()
            // shutdown() lets an in-flight C call finish safely; never free its buffers concurrently.
            whistleLane.executor.shutdown()
            cancel()
            onAlbaLane { releaseOfflineVoices() }
            albaLane.executor.shutdown()
            main.post {
                speechInit++
                ttsWaiters.toList().forEach { it(null) }
                ttsWaiters.clear()
                tts?.shutdown()
                tts = null
                ttsReady = false
            }
            executor.shutdown()
        }
    }
}
