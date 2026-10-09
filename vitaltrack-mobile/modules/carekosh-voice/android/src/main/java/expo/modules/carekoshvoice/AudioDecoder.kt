package expo.modules.carekoshvoice

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Decode bounded temporary app recordings; no remote URIs or persistent audio. */
internal fun decodeRecording(
    context: Context,
    uri: String,
    check: () -> Unit,
): Pair<FloatArray, Int> {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Invalid recording location" }
    val file = File(requireNotNull(parsed.path)).canonicalFile
    require(
        file.path.startsWith(context.cacheDir.canonicalPath + File.separator) &&
            file.length() in 1..900_000
    ) {
        "Invalid recording"
    }
    if (file.extension == "wav") return decodeCaptureWav(file, check)
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    try {
        extractor.setDataSource(file.path)
        require(extractor.trackCount == 1) { "Use an audio-only recording" }
        val format = extractor.getTrackFormat(0)
        val mime = format.getString(MediaFormat.KEY_MIME)
        require(mime == "audio/mp4a-latm") { "Use a mono AAC recording" }
        var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        require(rate in 8000..48000 && channels == 1)
        extractor.selectTrack(0)
        val decoder = MediaCodec.createDecoderByType(mime)
        codec = decoder
        decoder.configure(format, null, null, 0)
        decoder.start()
        val samples = FloatArray(48000 * 30)
        var size = 0
        var ended = false
        val info = MediaCodec.BufferInfo()
        val deadline = System.nanoTime() + 10_000_000_000L
        while (true) {
            check()
            require(System.nanoTime() < deadline) { "Recording decode timed out" }
            if (!ended) {
                val index = decoder.dequeueInputBuffer(10000)
                if (index >= 0) {
                    val input = requireNotNull(decoder.getInputBuffer(index))
                    val count = extractor.readSampleData(input, 0)
                    if (count < 0) {
                        decoder.queueInputBuffer(
                            index,
                            0,
                            0,
                            0,
                            MediaCodec.BUFFER_FLAG_END_OF_STREAM,
                        )
                        ended = true
                    } else {
                        decoder.queueInputBuffer(index, 0, count, extractor.sampleTime, 0)
                        extractor.advance()
                    }
                }
            }
            val index = decoder.dequeueOutputBuffer(info, 10000)
            if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                val output = decoder.outputFormat
                rate = output.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                channels = output.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                require(rate in 8000..48000 && channels == 1)
                require(
                    !output.containsKey(MediaFormat.KEY_PCM_ENCODING) ||
                        output.getInteger(MediaFormat.KEY_PCM_ENCODING) ==
                            AudioFormat.ENCODING_PCM_16BIT
                )
            } else if (index >= 0) {
                val buffer =
                    requireNotNull(decoder.getOutputBuffer(index)).order(ByteOrder.LITTLE_ENDIAN)
                buffer.position(info.offset)
                buffer.limit(info.offset + info.size)
                require(size + info.size / 2 <= rate * 30 && info.size % 2 == 0) {
                    "Recording exceeds 30 seconds"
                }
                while (buffer.remaining() >= 2) samples[size++] = buffer.short / 32768f
                decoder.releaseOutputBuffer(index, false)
                if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
            }
        }
        require(size >= rate * 0.3) { "Please record a longer question" }
        var min = 1f
        var max = -1f
        for (i in 0 until size) {
            min = minOf(min, samples[i])
            max = maxOf(max, samples[i])
        }
        require(max - min > 0.0001f) { "No microphone signal. Please try again" }
        return samples.copyOf(size) to rate
    } finally {
        try {
            codec?.stop()
        } catch (_: Exception) {}
        codec?.release()
        extractor.release()
    }
}

/** Exactly the mono PCM16/16 kHz WAV our capture writes. Reject malformed headers. */
internal fun decodeCaptureWav(file: File, check: () -> Unit): Pair<FloatArray, Int> {
    check()
    require(file.length() in 44..896_044) { "Invalid speech recording size" }
    val bytes = file.readBytes()
    val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    fun tag(offset: Int, expected: String) =
        bytes.copyOfRange(offset, offset + 4).contentEquals(expected.toByteArray())
    require(tag(0, "RIFF") && tag(8, "WAVE") && tag(12, "fmt ") && tag(36, "data")) {
        "Invalid speech recording header"
    }
    val size = buffer.getInt(40)
    require(
        buffer.getInt(4) == bytes.size - 8 &&
            buffer.getInt(16) == 16 &&
            buffer.getShort(20).toInt() == 1 &&
            buffer.getShort(22).toInt() == 1 &&
            buffer.getInt(24) == 16000 &&
            buffer.getInt(28) == 32000 &&
            buffer.getShort(32).toInt() == 2 &&
            buffer.getShort(34).toInt() == 16 &&
            size == bytes.size - 44 &&
            size % 2 == 0 &&
            size >= 9600
    ) {
        "Use a mono 16 kHz speech recording of at least 0.3 seconds"
    }
    buffer.position(44)
    var minimum = 1f
    var maximum = -1f
    val samples =
        FloatArray(size / 2) { i ->
            if (i % 4096 == 0) check()
            val sample = buffer.short / 32768f
            minimum = minOf(minimum, sample)
            maximum = maxOf(maximum, sample)
            sample
        }
    require(maximum - minimum > 0.0001f) { "No microphone signal. Please try again" }
    return samples to 16000
}
