package expo.modules.carekoshvoice

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import java.io.File
import java.nio.ByteOrder

/** Decode only a bounded Expo cache recording; no URIs, sockets or persistent PCM files. */
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
