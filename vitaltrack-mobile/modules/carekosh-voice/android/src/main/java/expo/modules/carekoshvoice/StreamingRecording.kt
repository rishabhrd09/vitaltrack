package expo.modules.carekoshvoice

import ai.moonshine.voice.Transcriber
import ai.moonshine.voice.TranscriptEvent
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.Uri
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min

/**
 * One microphone feeds both the temporary WAV and genuine, provisional local captions. Capture and
 * inference have separate threads so a slow model cannot block audio reads. Native sample and
 * wall-clock limits bound the take even if JS is suspended.
 */
internal class StreamingRecording(
    context: Context,
    val id: String,
    private val engine: Transcriber?,
    private val emit: (Map<String, Any>) -> Unit,
) {
    private val rate = 16000
    private val maxSamples = rate * 28
    private val file = File.createTempFile("carekosh-capture-", ".wav", context.cacheDir)
    val uri: String = Uri.fromFile(file).toString()
    private val output = RandomAccessFile(file, "rw")
    private val stopRequested = AtomicBoolean(false)
    private val cancelled = AtomicBoolean(false)
    private val previewStopped = AtomicBoolean(false)
    private val captureDone = AtomicBoolean(false)
    // At most one complete 28-second take, about 1.8 MB of float samples.
    private val queue = LinkedBlockingQueue<FloatArray>(280)
    private var captureThread: Thread? = null
    private var processingThread: Thread? = null
    @Volatile private var microphone: AudioRecord? = null
    @Volatile private var failure: String? = null
    private val texts = linkedMapOf<Long, String>() // processing thread only
    private var samples = 0

    init {
        output.write(ByteArray(44))
    }

    fun start() {
        check(!cancelled.get() && captureThread == null) {
            "Recording cancelled or already started"
        }
        val minimum =
            AudioRecord.getMinBufferSize(
                rate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            )
        check(minimum > 0) { "This phone cannot open the speech microphone" }
        val mic =
            AudioRecord.Builder()
                .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setSampleRate(rate)
                        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .build()
                )
                .setBufferSizeInBytes(maxOf(minimum * 2, 6400))
                .build()
        microphone = mic
        try {
            check(mic.state == AudioRecord.STATE_INITIALIZED) { "Microphone initialization failed" }
            mic.startRecording()
            check(mic.recordingState == AudioRecord.RECORDSTATE_RECORDING && !cancelled.get()) {
                "Microphone did not start"
            }
            engine?.addListener { event ->
                if (
                    event is TranscriptEvent.LineTextChanged ||
                        event is TranscriptEvent.LineCompleted
                ) {
                    val line =
                        when (event) {
                            is TranscriptEvent.LineTextChanged -> event.line
                            is TranscriptEvent.LineCompleted -> event.line
                            else -> error("Unexpected transcript event")
                        }
                    texts[line.id] = line.text.orEmpty()
                    if (!cancelled.get())
                        emit(
                            mapOf(
                                "id" to id,
                                "transcript" to texts.values.joinToString(" ").trim().take(600),
                            )
                        )
                }
            }
            processingThread = Thread({ process() }, "carekosh-live-words").also { it.start() }
            captureThread = Thread({ capture(mic) }, "carekosh-microphone").also { it.start() }
        } catch (error: Throwable) {
            requestStop()
            mic.release()
            microphone = null
            throw error
        }
    }

    private fun capture(mic: AudioRecord) {
        val buffer = ShortArray(1600) // 100 ms, independent of inference speed
        val started = System.nanoTime()
        try {
            while (
                !stopRequested.get() &&
                    samples < maxSamples &&
                    System.nanoTime() - started < 28_000_000_000L
            ) {
                val count =
                    mic.read(
                        buffer,
                        0,
                        min(buffer.size, maxSamples - samples),
                        AudioRecord.READ_BLOCKING,
                    )
                // Keep a positive final partial read; dropping it can cut off the last syllable.
                if (count <= 0 && stopRequested.get()) break
                check(count > 0) { "Android interrupted the microphone ($count)" }
                val bytes = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN)
                val floats =
                    if (engine != null && !previewStopped.get()) FloatArray(count) else null
                for (i in 0 until count) {
                    bytes.putShort(buffer[i])
                    floats?.set(i, buffer[i] / 32768f)
                }
                output.write(bytes.array())
                samples += count
                if (floats != null && !queue.offer(floats)) stopPreview()
            }
        } catch (error: Throwable) {
            if (!stopRequested.get()) failure = error.message ?: "Microphone interrupted"
        } finally {
            stopRequested.set(true)
            try {
                mic.stop()
            } catch (_: Exception) {}
            mic.release()
            microphone = null
            captureDone.set(true)
            if (!cancelled.get())
                emit(mapOf("id" to id, "finished" to true, "error" to (failure ?: "")))
        }
    }

    private fun process() {
        try {
            engine?.start()
            while (
                !cancelled.get() &&
                    !previewStopped.get() &&
                    (!captureDone.get() || queue.isNotEmpty())
            ) {
                val audio = queue.poll(100, TimeUnit.MILLISECONDS) ?: continue
                engine?.addAudio(audio, rate)
            }
            if (!cancelled.get() && !previewStopped.get()) engine?.stop()
        } catch (error: Throwable) {
            // A preview failure must not stop the actual microphone or discard the final take.
            stopPreview()
        } finally {
            engine?.close()
        }
    }

    private fun stopPreview() {
        if (previewStopped.compareAndSet(false, true)) {
            queue.clear()
            if (!cancelled.get()) emit(mapOf("id" to id, "previewError" to true))
        }
    }

    fun requestStop() {
        stopRequested.set(true)
        try {
            microphone?.stop()
        } catch (_: Exception) {}
    }

    /** Called from the module worker, never the UI thread. */
    fun finish(): String {
        requestStop()
        captureThread?.join(2000)
        check(captureThread?.isAlive != true) { "Microphone is still stopping" }
        // The microphone is already released. Do not block indefinitely on a slow model.
        processingThread?.join(5000)
        if (processingThread?.isAlive == true) previewStopped.set(true)
        if (processingThread == null) engine?.close()
        writeHeader()
        output.close()
        check(!cancelled.get()) { "Recording cancelled" }
        check(failure == null && samples > 0) { failure ?: "No audio was captured" }
        return uri
    }

    fun cancel() {
        cancelled.set(true)
        requestStop()
    }

    /** Cancellation retains no audio; inference owns and releases its native memory. */
    fun discard() {
        cancel()
        captureThread?.join(2000)
        processingThread?.join(5000)
        if (processingThread == null) engine?.close()
        if (captureThread?.isAlive != true) {
            try {
                output.close()
            } catch (_: Exception) {}
            file.delete()
        }
    }

    private fun writeHeader() {
        val size = samples * 2
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header
            .put("RIFF".toByteArray())
            .putInt(size + 36)
            .put("WAVEfmt ".toByteArray())
            .putInt(16)
            .putShort(1.toShort())
            .putShort(1.toShort())
            .putInt(rate)
            .putInt(rate * 2)
            .putShort(2.toShort())
            .putShort(16.toShort())
            .put("data".toByteArray())
            .putInt(size)
        output.seek(0)
        output.write(header.array())
    }
}
