package expo.modules.carekoshvoice

import ai.moonshine.voice.Transcriber
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
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class CareKoshVoiceModule : Module() {
    /** One serial worker per native engine. A slow or stuck Alba GPU call never blocks the microphone. */
    private class Lane(name: String) {
        val executor: ExecutorService = Executors.newSingleThreadExecutor { Thread(it, name) }
        val pending = AtomicInteger(0)
    }
    private val speechLane = Lane("carekosh-moonshine")
    private val albaLane = Lane("carekosh-alba")
    private val executor = speechLane.executor
    private val main = Handler(Looper.getMainLooper())
    private val generation = AtomicInteger(0)
    private val cleanupQueued = AtomicBoolean(false)
    // Alba state is touched only on the Alba lane (GPU context affinity).
    private var albaEngine: PocketSynthesizer? = null
    private var albaVocoderFailure: String? = null
    private val albaUse = AtomicLong(0)
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
    private val playback = lazy { PocketPlayback(context) }
    private val pocketPlayback by playback
    @Volatile private var pocketDiagnostic = "No audio check has run in this app session."

    private fun work(promise: Promise, cancellable: Boolean = true, lane: Lane = speechLane, task: (() -> Unit) -> Any?) {
        val expected = generation.get()
        if (lane.pending.incrementAndGet() > 4) {
            lane.pending.decrementAndGet()
            promise.reject("VOICE_BUSY", "Offline speech is busy. Please try again shortly.", null)
            return
        }
        try {
            lane.executor.execute {
                try {
                    val check = {
                        check(!cancellable || expected == generation.get()) {
                            "Voice operation cancelled"
                        }
                    }
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

    private fun releaseAlba() { // Alba lane only
        albaEngine?.close()
        albaEngine = null
    }

    /** Compiled models stay warm between replies, then free about 1 GB after 90 s of no use. */
    private fun scheduleAlbaRelease() {
        val stamp = albaUse.incrementAndGet()
        main.postDelayed({ if (albaUse.get() == stamp) onAlbaLane { if (albaUse.get() == stamp) releaseAlba() } }, 90_000)
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
                    check(!cancellable || expected == generation.get()) { "Speech cancelled" }
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
                    promise.reject("DEVICE_SPEECH", e.message, e)
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

    /** Alba lane: reuse the compiled engine, or build it once for this placement. */
    private fun albaEngineFor(placement: PocketPlacement, check: () -> Unit, diagnostics: PocketDiagnostics, report: (String, Int?) -> Unit): PocketSynthesizer {
        albaEngine?.let { engine ->
            if (engine.placement == placement) { diagnostics.note("engine warm (reused) · ${engine.placements}"); return engine }
            releaseAlba()
        }
        albaVocoderFailure?.let { error(it) } // remembered for this process: no repeated multi-second compiles
        report("loading", null)
        val engine = PocketSynthesizer(pocketPack.root, placement)
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
    private fun speakPocket(text: String, pace: Double, id: String?, promise: Promise, play: Boolean = true, placementName: String = "default") {
        work(promise, lane = albaLane) { check ->
            require(text.isNotBlank() && text.length <= 640 && pace in 0.85..1.1)
            require(id == null || id.matches(Regex("[a-zA-Z0-9-]{1,80}")))
            albaUse.incrementAndGet() // cancels a pending idle release
            val placement = PocketPlacement.named(placementName)
            val deadline = System.nanoTime() + 180_000_000_000L
            val requestStart = System.nanoTime()
            val diagnostics = diagnosticsFor(id)
            diagnostics.note("Alba · LiteRT 2.1.6 · ${placement.label} · 24 kHz mono PCM16 · media route · ${if (play) "speak" else "synthesis only"}")
            diagnostics.note("text: ${text.length} characters (content not recorded)")
            pocketDiagnostic = diagnostics.text()
            val boundedCheck = { check(); kotlin.check(System.nanoTime() < deadline) { "Alba took too long. Try a shorter reply or select Device voice in Voice setup" } }
            var stage = ""
            var playing = false
            val report: (String, Int?) -> Unit = { next, frames ->
                boundedCheck()
                if (next != stage) { diagnostics.note("stage $next"); stage = next }
                // Once audio is playing, later generation stages would only confuse the status line.
                if (id != null && (!playing || next == "playing")) sendEvent("pocketSpeechProgress", mapOf("id" to id, "stage" to next, "frames" to frames))
            }
            var firstChunkMs = -1L
            try {
                report("verifying", null)
                require(pocketPack.ready(boundedCheck)) { "Download Alba in Voice setup first" }
                val engine = albaEngineFor(placement, boundedCheck, diagnostics, report)
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
                    val playbackReport = pocketPlayback.stream(pace.toFloat(), boundedCheck) { push ->
                        synthesis = engine.synthesize(text, boundedCheck, report) { deliver(it, push) }
                    }
                    synthesis?.chunks?.forEachIndexed { i, chunk -> diagnostics.note(chunk.describe(i + 1)) }
                    diagnostics.note(playbackReport.describe())
                    val firstAudio = if (playbackReport.firstAudioMs >= 0 && firstChunkMs >= 0) firstChunkMs + playbackReport.firstAudioMs else -1
                    diagnostics.note("completed in ${(System.nanoTime() - requestStart) / 1_000_000} ms · first audible frame about $firstAudio ms after the request")
                    playbackReport.asMap()
                } else {
                    val synthesis = engine.synthesize(text, boundedCheck, report) { deliver(it, null) }
                    synthesis.chunks.forEachIndexed { i, chunk -> diagnostics.note(chunk.describe(i + 1)) }
                    diagnostics.note("synthesis only: ${synthesis.samples} samples (${"%.2f".format(synthesis.samples / 24000.0)} s) in ${synthesis.ms} ms; nothing played")
                    mapOf("output" to "none (synthesis only)", "volumePercent" to 0, "audioSeconds" to synthesis.samples / 24000.0, "frames" to synthesis.samples)
                }
                result
            } catch (e: Throwable) {
                val cancelled = e is IllegalStateException && e.message == "Voice operation cancelled"
                diagnostics.note("${if (cancelled) "cancelled" else "failed"} at stage '$stage': ${e.javaClass.simpleName}${if (cancelled) "" else ": " + e.message.orEmpty().take(200)}")
                // A failed engine may hold inconsistent native state; rebuild it next time. Cancellation keeps it warm.
                if (!cancelled) releaseAlba()
                throw e
            } finally {
                pocketDiagnostic = diagnostics.text()
                scheduleAlbaRelease()
            }
        }
    }

    override fun definition() = ModuleDefinition {
        Name("CareKoshVoice")
        Events("modelDownloadProgress", "liveTranscript", "pocketDownloadProgress", "pocketSpeechProgress")

        AsyncFunction("pocketVoiceStatus") { promise: Promise ->
            work(promise, cancellable = false, lane = albaLane) { check ->
                val supported = android.os.Build.SUPPORTED_ABIS.any { it == "arm64-v8a" || it == "x86_64" }
                mapOf("supported" to supported, "ready" to (supported && pocketPack.ready(check)),
                    "bytes" to pocketPack.bytes, "name" to "Alba · Pocket TTS · English")
            }
        }
        AsyncFunction("downloadPocketVoice") { promise: Promise ->
            work(promise, lane = albaLane) { check ->
                require(android.os.Build.SUPPORTED_ABIS.any { it == "arm64-v8a" || it == "x86_64" }) { "Alba needs a 64-bit Android device" }
                releaseAlba(); albaVocoderFailure = null
                var lastEvent = 0L
                pocketPack.install(check) { done, total ->
                    val now = System.nanoTime()
                    if (now - lastEvent > 250_000_000 || done == total) {
                        lastEvent = now
                        sendEvent("pocketDownloadProgress", mapOf("downloaded" to done, "total" to total))
                    }
                }
                mapOf("ready" to true, "supported" to true, "bytes" to pocketPack.bytes, "name" to "Alba · Pocket TTS · English")
            }
        }
        AsyncFunction("removePocketVoice") { promise: Promise ->
            // Only the Alba folder: Moonshine recognition, inventory, drafts and orders are untouched.
            work(promise, lane = albaLane) { _ -> releaseAlba(); albaVocoderFailure = null; pocketPack.remove(); null }
        }
        AsyncFunction("speakPocket") { text: String, pace: Double, promise: Promise ->
            speakPocket(text, pace, null, promise)
        }
        AsyncFunction("speakPocketWithProgress") { text: String, pace: Double, id: String, promise: Promise ->
            speakPocket(text, pace, id, promise)
        }
        // Diagnostics builds only: synthesis without playback and named placement experiments.
        AsyncFunction("speakPocketDiagnostic") { text: String, pace: Double, id: String, play: Boolean, placement: String, promise: Promise ->
            speakPocket(text, pace, id, promise, play, placement)
        }
        AsyncFunction("pocketAudioDiagnostic") { promise: Promise -> promise.resolve(pocketDiagnostic) }
        AsyncFunction("checkPocketAudioOutput") { promise: Promise ->
            work(promise, lane = albaLane) { check ->
                val deadline = System.nanoTime() + 10_000_000_000L
                val boundedCheck = { check(); kotlin.check(System.nanoTime() < deadline) { "Audio output check timed out" } }
                val diagnostics = diagnosticsFor("output-check-${System.currentTimeMillis()}")
                diagnostics.note("output check · no model generation · 0.5 s 440 Hz tone · 24 kHz mono PCM16 · media route")
                try {
                    val result = pocketPlayback.play(pocketOutputTone(), 1f, boundedCheck)
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
                    for (name in requireNotNull(context.assets.list("pocket-licences"))) {
                        check()
                        require(name.matches(Regex("[A-Za-z0-9_.-]+")))
                        zip.putNextEntry(java.util.zip.ZipEntry(name.removeSuffix(".gz")))
                        context.assets.open("pocket-licences/$name").use { input ->
                            if (name.endsWith(".gz")) java.util.zip.GZIPInputStream(input).use { it.copyTo(zip) }
                            else input.copyTo(zip)
                        }
                        zip.closeEntry()
                    }
                }
                android.net.Uri.fromFile(file).toString()
            }
        }

        AsyncFunction("prepareCapture") { id: String, preview: Boolean, promise: Promise ->
            work(promise) { check ->
                require(id.matches(Regex("[a-zA-Z0-9-]{1,80}")))
                check(recording == null) { "Microphone is still stopping" }
                transcriber?.close()
                transcriber = null
                var engine: Transcriber? = null
                var take: StreamingRecording? = null
                try {
                    if (preview) {
                        require(pack.ready(check)) {
                            "Download the English speech pack for live words"
                        }
                        engine = Transcriber()
                        engine.loadFromFiles(pack.root.path, pack.architecture)
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
                require(take.id == id)
                check()
                take.start()
                true
            }
        }
        AsyncFunction("finishCapture") { id: String, promise: Promise ->
            recording?.takeIf { it.id == id }?.requestStop()
            work(promise) { _ ->
                val take = requireNotNull(recording) { "Recording is no longer available" }
                require(take.id == id)
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
            work(promise, cancellable = false) { check ->
                mapOf(
                    "ready" to pack.ready(check),
                    "bytes" to pack.bytes,
                    "model" to "Moonshine Small Streaming · English",
                )
            }
        }
        AsyncFunction("downloadModel") { promise: Promise ->
            work(promise) { check ->
                transcriber?.close()
                transcriber = null
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
                    require(pack.ready(check)) {
                        "Download the English offline speech pack in AI & Voice settings first"
                    }
                    val engine = Transcriber()
                    try {
                        engine.loadFromFiles(pack.root.path, pack.architecture)
                        transcriber = engine
                    } catch (e: Exception) {
                        engine.close()
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
                require(text.isNotBlank() && text.length <= 640)
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
        OnActivityEntersBackground {
            cancel()
            onAlbaLane { releaseAlba() } // free ~1 GB of compiled models while CareKosh is hidden
        }
        OnDestroy {
            cancel()
            onAlbaLane { releaseAlba() }
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
