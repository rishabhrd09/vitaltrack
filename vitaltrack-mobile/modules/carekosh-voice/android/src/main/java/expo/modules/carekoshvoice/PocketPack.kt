package expo.modules.carekoshvoice

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import org.json.JSONObject

/** Fixed data-only catalog, versioned with the APK. No arbitrary models or voices. */
internal class PocketPack(private val context: Context) {
    val root = File(context.noBackupFilesDir, "carekosh-pocket-alba-e0e68d4f")
    private data class Asset(val name: String, val url: String, val bytes: Long, val sha: String)
    private val assets by lazy {
        val data = context.assets.open("pocket-alba-manifest.json").bufferedReader().use { JSONObject(it.readText()) }
        val files = data.getJSONArray("assets")
        require(files.length() == 9)
        (0 until files.length()).map {
            val a = files.getJSONObject(it)
            Asset(a.getString("name"), a.getString("url"), a.getLong("bytes"), a.getString("sha256")).also { asset ->
                require(asset.name.matches(Regex("[a-zA-Z0-9_.-]+")) && !asset.name.contains(".."))
                require(asset.bytes in 1..180_000_000 && asset.sha.matches(Regex("[a-f0-9]{64}")))
                val url = URL(asset.url)
                require(url.protocol == "https" && url.host == "huggingface.co" && url.userInfo == null && url.port == -1)
                require(url.path.startsWith("/mlboydaisuke/Pocket-TTS-LiteRT/resolve/e0e68d4fb79feb529d7d0f8d0bbfad8d15a18a1e/") && !url.path.contains(".."))
            }
        }.also { require(it.map { a -> a.name }.distinct().size == 9 && it.sumOf { a -> a.bytes } < 250_000_000) }
    }
    val bytes get() = assets.sumOf { it.bytes }
    private var verified: List<Pair<Long, Long>>? = null
    private fun fingerprint() = assets.map { File(root, it.name).let { f -> f.length() to f.lastModified() } }
    private fun valid(file: File, asset: Asset, check: () -> Unit): Boolean {
        if (!file.isFile || file.length() != asset.bytes) return false
        val hash = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(65536)
            while (true) {
                check()
                val n = input.read(buffer)
                if (n < 0) break
                hash.update(buffer, 0, n)
            }
        }
        val actual = hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
        return actual == asset.sha
    }
    fun ready(check: () -> Unit = {}): Boolean {
        check()
        val state = fingerprint()
        if (verified == state) return true // app-private immutable files, verified once per process
        val result = assets.all { valid(File(root, it.name), it, check) }
        verified = if (result) state else null
        return result
    }
    private fun connect(initial: String, check: () -> Unit): HttpURLConnection {
        var next = URL(initial)
        repeat(6) {
            check()
            require(next.protocol == "https" && next.userInfo == null && next.port == -1 && next.host in setOf(
                "huggingface.co", "cas-bridge.xethub.hf.co", "cdn-lfs.huggingface.co", "cdn-lfs-us-1.hf.co", "us.aws.cdn.hf.co"
            )) { "Untrusted voice download redirect" }
            val connection = (next.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15000; readTimeout = 15000; instanceFollowRedirects = false
                setRequestProperty("Accept-Encoding", "identity")
            }
            try {
                when (connection.responseCode) {
                    200 -> return connection
                    301, 302, 303, 307, 308 -> next = URL(next, requireNotNull(connection.getHeaderField("Location")))
                    else -> error("Alba download unavailable. Please retry later")
                }
            } catch (error: Exception) { connection.disconnect(); throw error }
            connection.disconnect()
        }
        error("Too many voice download redirects")
    }
    fun install(check: () -> Unit, progress: (Long, Long) -> Unit) {
        require(root.isDirectory || root.mkdirs()) { "Could not prepare voice storage" }
        require(root.usableSpace > bytes + 64_000_000) { "Not enough free storage for Alba" }
        verified = null
        val deadline = System.nanoTime() + 900_000_000_000L
        val boundedCheck = { check(); kotlin.check(System.nanoTime() < deadline) { "Alba download timed out. Please retry" } }
        var done = 0L
        for (asset in assets) {
            boundedCheck()
            val target = File(root, asset.name)
            if (valid(target, asset, boundedCheck)) { done += asset.bytes; progress(done, bytes); continue }
            val partial = File(root, asset.name + ".part")
            try {
                val connection = connect(asset.url, boundedCheck)
                try {
                    connection.inputStream.buffered().use { input ->
                        partial.outputStream().buffered().use { output ->
                            var received = 0L
                            val buffer = ByteArray(65536)
                            while (true) {
                                boundedCheck()
                                val n = input.read(buffer)
                                if (n < 0) break
                                received += n
                                require(received <= asset.bytes) { "Invalid Alba file size" }
                                output.write(buffer, 0, n); progress(done + received, bytes)
                            }
                        }
                    }
                } finally { connection.disconnect() }
                require(valid(partial, asset, boundedCheck)) { "Alba integrity check failed. Please retry" }
                require(partial.renameTo(target)) { "Could not install Alba file" }
                done += asset.bytes
            } finally { partial.delete() }
        }
        require(ready(boundedCheck)) { "Alba pack is incomplete" }
        progress(bytes, bytes)
    }
    fun remove() {
        verified = null
        if (root.exists()) check(root.deleteRecursively()) { "Could not remove Alba" }
    }
}
