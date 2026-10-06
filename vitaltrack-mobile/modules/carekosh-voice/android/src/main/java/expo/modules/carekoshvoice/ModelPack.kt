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

    fun ready(check: () -> Unit = {}): Boolean = assets.all {
        valid(File(root, it.name), it, check)
    }

    fun install(check: () -> Unit, progress: (Long, Long) -> Unit) {
        root.mkdirs()
        require(root.usableSpace > bytes + 64_000_000) {
            "Not enough storage for the offline speech pack"
        }
        var completed = 0L
        val deadline = System.nanoTime() + 600_000_000_000L
        val boundedCheck = {
            check()
            kotlin.check(System.nanoTime() < deadline) { "Speech pack download timed out" }
        }
        for (asset in assets) {
            boundedCheck()
            val target = File(root, asset.name)
            if (valid(target, asset, boundedCheck)) {
                completed += asset.size
                progress(completed, bytes)
                continue
            }
            val partial = File(root, asset.name + ".part")
            val connection = URL(asset.url).openConnection() as HttpURLConnection
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.instanceFollowRedirects = false
            try {
                require(connection.responseCode == 200) { "Speech pack download unavailable" }
                connection.inputStream.buffered().use { input ->
                    partial.outputStream().buffered().use { output ->
                        val buffer = ByteArray(65536)
                        var received = 0L
                        while (true) {
                            boundedCheck()
                            val count = input.read(buffer)
                            if (count == -1) break
                            received += count
                            require(received <= asset.size) { "Invalid speech pack size" }
                            output.write(buffer, 0, count)
                            progress(completed + received, bytes)
                        }
                    }
                }
                require(valid(partial, asset, boundedCheck)) {
                    "Speech pack integrity check failed; please retry"
                }
                require(partial.renameTo(target)) { "Could not install speech pack" }
                completed += asset.size
            } finally {
                connection.disconnect()
                partial.delete()
            }
        }
    }

    fun remove() {
        // Exact app-owned model directory, never a caller-supplied path.
        if (root.exists()) check(root.deleteRecursively()) { "Could not remove speech pack" }
    }
}
