package expo.modules.carekoshvoice

import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection

/**
 * Resumable, bounded download of one pinned file into [partial]. A file kept from an interrupted
 * download (screen locked, app closed, network drop) continues with an HTTP Range request when the
 * server honours it; otherwise it starts again. The caller verifies size and checksum afterwards
 * and deletes the partial file only when that check fails.
 */
internal fun downloadResumable(
    partial: File,
    expectedBytes: Long,
    check: () -> Unit,
    open: (rangeStart: Long) -> HttpURLConnection,
    progress: (Long) -> Unit,
) {
    var start = if (partial.isFile) partial.length() else 0L
    if (start > expectedBytes) { partial.delete(); start = 0L }
    if (start == expectedBytes) { progress(start); return }
    val connection = open(start)
    try {
        val resumed = start > 0 && connection.responseCode == HttpURLConnection.HTTP_PARTIAL && rangeStartOf(connection.getHeaderField("Content-Range")) == start
        if (!resumed) start = 0L
        FileOutputStream(partial, resumed).buffered().use { output ->
            connection.inputStream.buffered().use { input ->
                var received = start
                progress(received)
                val buffer = ByteArray(65536)
                while (true) {
                    check()
                    val n = input.read(buffer)
                    if (n < 0) break
                    received += n
                    if (received > expectedBytes) throw VoiceDownloadFailed("The download was larger than expected. Please retry")
                    output.write(buffer, 0, n)
                    progress(received)
                }
            }
        }
    } finally { connection.disconnect() }
}

/** Hugging Face serves pinned files from its CDN hosts; SHA-256 remains the integrity check. */
internal fun huggingFaceHost(host: String) = host == "huggingface.co" || host.endsWith(".huggingface.co") || host.endsWith(".hf.co")

/** Opens a pinned HTTPS file, optionally from [rangeStart], following up to five redirects among [trusted] hosts. */
internal fun openPinned(initial: String, rangeStart: Long, check: () -> Unit, trusted: (String) -> Boolean, unavailable: String): HttpURLConnection {
    var next = java.net.URL(initial)
    repeat(6) {
        check()
        require(next.protocol == "https" && next.userInfo == null && next.port == -1 && trusted(next.host)) { "Untrusted voice download redirect" }
        val connection = (next.openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000; readTimeout = 15000; instanceFollowRedirects = false
            setRequestProperty("Accept-Encoding", "identity")
            if (rangeStart > 0) setRequestProperty("Range", "bytes=$rangeStart-")
        }
        try {
            when (connection.responseCode) {
                200, 206 -> return connection
                301, 302, 303, 307, 308 -> next = java.net.URL(next, requireNotNull(connection.getHeaderField("Location")) { unavailable })
                else -> throw VoiceDownloadFailed(unavailable)
            }
        } catch (error: Exception) { connection.disconnect(); throw error }
        connection.disconnect()
    }
    throw VoiceDownloadFailed("Too many voice download redirects")
}

/** Lower-case hex SHA-256 of [file], checking for cancellation between blocks. */
internal fun sha256Of(file: File, check: () -> Unit): String {
    val hash = java.security.MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered().use { input ->
        val buffer = ByteArray(65536)
        while (true) {
            check()
            val n = input.read(buffer)
            if (n < 0) break
            hash.update(buffer, 0, n)
        }
    }
    return hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
}

/** Start offset from "bytes 123-456/789"; -1 when absent or malformed. */
internal fun rangeStartOf(contentRange: String?): Long =
    Regex("^bytes (\\d+)-\\d+/(?:\\d+|\\*)$").find(contentRange?.trim().orEmpty())?.groupValues?.get(1)?.toLongOrNull() ?: -1L

/** Free bytes still needed for [assets] given files already complete and partial downloads kept. */
internal fun missingBytes(sizes: List<Pair<Long, Long>>): Long = sizes.sumOf { (expected, present) -> maxOf(0L, expected - minOf(present, expected)) }
