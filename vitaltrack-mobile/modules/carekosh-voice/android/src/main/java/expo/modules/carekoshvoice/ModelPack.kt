package expo.modules.carekoshvoice

import ai.moonshine.voice.JNI
import ai.moonshine.voice.Transcriber
import ai.moonshine.voice.TranscriberOption
import android.content.Context
import android.util.Base64
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.security.MessageDigest
import org.json.JSONObject

/**
 * Only model DATA can be fetched, only from the catalog bundled with the pinned SDK. No downloader
 * or high-level auto-loading Moonshine API runs during recognition.
 */
internal class ModelPack(context: Context) {
    val root = File(context.noBackupFilesDir, "carekosh-moonshine-small-en-0.1.5")
    val architecture = JNI.MOONSHINE_MODEL_ARCH_SMALL_STREAMING

    data class Asset(
        val name: String,
        val url: String,
        val size: Long,
        val checksum: String,
        val algorithm: String,
    )

    private val assets: List<Asset> by lazy {
        val manifest =
            JSONObject(
                Transcriber.getSttDependencies(
                    "en",
                    listOf(TranscriberOption("model_arch", architecture.toString())),
                )
            )
        val groups = manifest.getJSONArray("groups")
        require(groups.length() == 1) { "Unexpected speech model catalog" }
        val files = groups.getJSONObject(0).getJSONArray("files")
        require(files.length() in 1..10)
        (0 until files.length())
            .map { i ->
                val f = files.getJSONObject(i)
                val asset =
                    Asset(
                        f.getString("name"),
                        f.getString("url"),
                        f.getLong("size"),
                        f.getString("checksum"),
                        f.getString("checksum_type"),
                    )
                val url = URL(asset.url)
                require(
                    url.protocol == "https" &&
                        url.host == "download.moonshine.ai" &&
                        url.port == -1 &&
                        url.query == null &&
                        url.userInfo == null
                )
                require(
                    url.path.startsWith("/model/small-streaming-en/quantized_") &&
                        !url.path.contains("..")
                )
                require(asset.name.matches(Regex("[a-zA-Z0-9_.-]+")) && !asset.name.contains(".."))
                require(asset.size in 1..200_000_000 && asset.checksum.isNotBlank())
                require(asset.algorithm in setOf("crc32c", "sha256", "md5")) {
                    "Unsupported model integrity check"
                }
                asset
            }
            .also {
                require(
                    it.sumOf { a -> a.size } <= 300_000_000 &&
                        it.map { a -> a.name }.distinct().size == it.size
                )
            }
    }
    val bytes: Long
        get() = assets.sumOf { it.size }

    private val crcTable =
        IntArray(256) { index ->
            var crc = index
            repeat(8) { crc = (crc ushr 1) xor (if ((crc and 1) != 0) 0x82F63B78.toInt() else 0) }
            crc
        }

    private fun valid(file: File, asset: Asset, check: () -> Unit): Boolean {
        if (!file.isFile || file.length() != asset.size) return false
        var crc = -1
        val digest =
            if (asset.algorithm == "crc32c") null
            else MessageDigest.getInstance(if (asset.algorithm == "sha256") "SHA-256" else "MD5")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(65536)
            while (true) {
                check()
                val count = input.read(buffer)
                if (count == -1) break
                if (digest != null) digest.update(buffer, 0, count)
                else
                    for (i in 0 until count) crc =
                        crcTable[(crc xor buffer[i].toInt()) and 255] xor (crc ushr 8)
            }
        }
        val actual = digest?.digest() ?: ByteBuffer.allocate(4).putInt(crc.inv()).array()
        // CDN catalog digests are base64, not hexadecimal.
        return MessageDigest.isEqual(actual, Base64.decode(asset.checksum, Base64.DEFAULT))
    }

    /**
     * Status checks reuse an unchanged size/time fingerprint. A fresh native engine load passes
     * refresh=true, so changed bytes cannot be trusted solely because that metadata was preserved.
     */
    @Volatile private var verified: List<Pair<Long, Long>>? = null
    private fun fingerprint() = assets.map { File(root, it.name).let { f -> f.length() to f.lastModified() } }

    @Synchronized
    fun ready(check: () -> Unit = {}, refresh: Boolean = false): Boolean {
        check()
        val state = fingerprint()
        if (!refresh && verified == state) return true
        val result = assets.all { valid(File(root, it.name), it, check) }
        verified = if (result) state else null
        return result
    }

    /** A load failure means a file changed underneath us: the next check hashes everything again. */
    @Synchronized fun forget() { verified = null }

    private fun connect(asset: Asset, rangeStart: Long): HttpURLConnection =
        (URL(asset.url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 15000
            instanceFollowRedirects = false
            if (rangeStart > 0) setRequestProperty("Range", "bytes=$rangeStart-")
            if (responseCode != 200 && responseCode != 206) {
                disconnect()
                throw VoiceDownloadFailed("Speech pack download unavailable. Please retry later")
            }
        }

    /** Resumes partial files kept from an interrupted download; a failed check deletes only that file. */
    fun install(check: () -> Unit, progress: (Long, Long) -> Unit) {
        synchronized(this) { check(); root.mkdirs() }
        verified = null
        val deadline = System.nanoTime() + 600_000_000_000L
        val boundedCheck = {
            check()
            if (System.nanoTime() >= deadline) throw VoiceDownloadFailed("Speech pack download timed out. Please retry; finished parts are kept")
        }
        val missing = assets.filterNot { valid(File(root, it.name), it, boundedCheck) }
        val needed = missingBytes(missing.map { it.size to File(root, it.name + ".part").let { part -> if (part.isFile) part.length() else 0L } })
        if (root.usableSpace <= needed + 64_000_000) throw VoiceDownloadFailed("Not enough storage for the offline speech pack")
        var completed = bytes - missing.sumOf { it.size }
        progress(completed, bytes)
        for (asset in missing) {
            boundedCheck()
            val partial = File(root, asset.name + ".part")
            downloadResumable(partial, asset.size, boundedCheck, { start -> connect(asset, start) }) { received -> progress(completed + received, bytes) }
            boundedCheck()
            if (!valid(partial, asset, boundedCheck)) {
                partial.delete()
                throw VoiceDownloadFailed("Speech pack integrity check failed; please retry")
            }
            synchronized(this) {
                boundedCheck() // removal cancels this generation before taking the same publication lock
                val target = File(root, asset.name)
                target.delete()
                if (!partial.renameTo(target)) throw VoiceDownloadFailed("Could not install speech pack")
                verified = null
            }
            completed += asset.size
        }
    }

    @Synchronized fun remove() {
        verified = null
        // Exact app-owned model directory, never a caller-supplied path.
        if (root.exists()) check(root.deleteRecursively()) { "Could not remove speech pack" }
    }
}
