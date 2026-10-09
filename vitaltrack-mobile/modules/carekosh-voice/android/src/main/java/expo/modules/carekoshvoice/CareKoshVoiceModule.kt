package expo.modules.carekoshvoice

import ai.moonshine.voice.Transcriber
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class CareKoshVoiceModule : Module() {
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val generation = AtomicInteger(0)
    private val pending = AtomicInteger(0)
    private val cleanupQueued = AtomicBoolean(false)
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

    private fun work(promise: Promise, cancellable: Boolean = true, task: (() -> Unit) -> Any?) {
        val expected = generation.get()
        if (pending.incrementAndGet() > 4) {
            pending.decrementAndGet()
            promise.reject("VOICE_BUSY", "Offline speech is busy. Please try again shortly.", null)
            return
        }
        try {
            executor.execute {
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
                } catch (e: Exception) {
                    promise.reject("VOICE_OPERATION", e.message ?: "Offline voice unavailable", e)
                } finally {
                    pending.decrementAndGet()
                }
            }
        } catch (e: RejectedExecutionException) {
            pending.decrementAndGet()
            promise.reject("VOICE_CLOSED", "Voice screen closed", e)
        }
    }

    private fun cancel() {
        generation.incrementAndGet()
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

    override fun definition() = ModuleDefinition {
        Name("CareKoshVoice")
        Events("modelDownloadProgress", "liveTranscript")

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
        OnActivityEntersBackground { cancel() }
        OnDestroy {
            cancel()
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
