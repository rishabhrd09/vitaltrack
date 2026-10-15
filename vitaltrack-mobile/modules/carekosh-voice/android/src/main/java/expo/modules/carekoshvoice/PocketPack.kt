package expo.modules.carekoshvoice

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import org.json.JSONObject

/**
 * Fixed data-only catalog, versioned with the APK: the shared Pocket TTS graphs plus a short list of
 * commercial-use preset voices from the same pinned revision. A voice may instead name a pinned Kyutai
 * voice state that is packed on the phone ([packPocketVoiceState]); the source and the packed file are
 * both SHA-256-checked. No arbitrary models or voices. Metadata and publication are synchronized
 * across the download worker and the offline voice worker; network reads hold no pack lock.
 */
internal class PocketPack(private val context: Context) {
    val root = File(context.noBackupFilesDir, "carekosh-pocket-alba-e0e68d4f")
    /** [state]: the pinned .safetensors voice state to download and pack into this file instead of [url]. */
    private data class Asset(val name: String, val url: String, val bytes: Long, val sha: String, val state: Asset? = null) {
        val downloadBytes: Long get() = state?.bytes ?: bytes
    }
    data class Voice(val id: String, val label: String)
    private class Catalog(val shared: List<Asset>, val voices: LinkedHashMap<String, Asset>, val labels: Map<String, String>)

    private val catalog by lazy {
        val data = context.assets.open("pocket-alba-manifest.json").bufferedReader().use { JSONObject(it.readText()) }
        fun checked(asset: Asset, prefix: String, maxBytes: Long) = asset.also {
            require(asset.name.matches(Regex("[a-zA-Z0-9_.-]+")) && !asset.name.contains("..")) { "Invalid Alba catalog" }
            require(asset.bytes in 1..maxBytes && asset.sha.matches(Regex("[a-f0-9]{64}"))) { "Invalid Alba catalog" }
            val url = URL(asset.url)
            require(url.protocol == "https" && url.host == "huggingface.co" && url.userInfo == null && url.port == -1) { "Invalid Alba catalog" }
            require(url.path.startsWith(prefix) && !url.path.contains("..")) { "Invalid Alba catalog" }
        }
        fun asset(a: JSONObject) = checked(Asset(a.getString("name"), a.getString("url"), a.getLong("bytes"), a.getString("sha256")),
            "/mlboydaisuke/Pocket-TTS-LiteRT/resolve/e0e68d4fb79feb529d7d0f8d0bbfad8d15a18a1e/", 180_000_000)
        /** Kyutai's 27 Sep voice states for the english_2026-04 model the graphs were exported from. */
        fun packed(a: JSONObject): Asset {
            val s = a.getJSONObject("voiceState")
            val state = checked(Asset(a.getString("name") + ".safetensors", s.getString("url"), s.getLong("bytes"), s.getString("sha256")),
                "/kyutai/pocket-tts-without-voice-cloning/resolve/069025daa1d6a8a9640bd52581e2a2252f8bede4/languages/english_2026-04/embeddings/", 16_000_000)
            require(state.url.endsWith(".safetensors")) { "Invalid Alba catalog" }
            return Asset(a.getString("name"), "", a.getLong("bytes"), a.getString("sha256"), state).also {
                require(it.name.matches(Regex("pt_voice_[a-z]+\\.bin")) && it.bytes in 1..8_000_000 && it.sha.matches(Regex("[a-f0-9]{64}"))) { "Invalid Alba catalog" }
            }
        }
        val files = data.getJSONArray("assets")
        require(files.length() == 8) { "Invalid Alba catalog" }
        val shared = (0 until files.length()).map { asset(files.getJSONObject(it)) }
        val list = data.getJSONArray("voices")
        require(list.length() in 1..12) { "Invalid Alba catalog" }
        val voices = LinkedHashMap<String, Asset>()
        val labels = HashMap<String, String>()
        for (i in 0 until list.length()) {
            val entry = list.getJSONObject(i)
            val id = entry.getString("id")
            require(id.matches(Regex("[a-z]{2,16}")) && id !in voices) { "Invalid Alba catalog" }
            val voice = if (entry.has("voiceState")) packed(entry) else asset(entry)
            require(voice.name == "pt_voice_$id.bin") { "Invalid Alba catalog" }
            voices[id] = voice
            labels[id] = entry.getString("label").take(40)
        }
        require("alba" in voices && voices.getValue("alba").state == null) { "Invalid Alba catalog" }
        val all = shared + voices.values
        require(all.map { it.name }.distinct().size == all.size && all.sumOf { it.downloadBytes } < 260_000_000) { "Invalid Alba catalog" }
        Catalog(shared, voices, labels)
    }

    val voices: List<Voice> get() = catalog.voices.keys.map { Voice(it, catalog.labels.getValue(it)) }
    private fun voiceAsset(id: String) = catalog.voices[id] ?: throw IllegalArgumentException("Unknown Alba voice")
    fun voiceFile(id: String): String = voiceAsset(id).name
    private fun assetsFor(voice: String) = catalog.shared + voiceAsset(voice)
    /** Bytes to download for [voice] with the shared graphs. */
    fun bytes(voice: String = "alba"): Long = assetsFor(voice).sumOf { it.downloadBytes }

    /** App-private immutable files: each is hashed once per process unless its size or time changes. */
    private val verified = HashMap<String, Pair<Long, Long>>()
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
    @Synchronized private fun installed(asset: Asset, check: () -> Unit): Boolean {
        val file = File(root, asset.name)
        val stamp = file.length() to file.lastModified()
        if (file.isFile && verified[asset.name] == stamp) return true
        return valid(file, asset, check).also { ok -> if (ok) verified[asset.name] = stamp else verified.remove(asset.name) }
    }
    @Synchronized fun ready(voice: String = "alba", check: () -> Unit = {}): Boolean {
        check()
        return assetsFor(voice).all { installed(it, check) }
    }
    /** Voices that can speak now: the shared graphs plus that voice's state are installed and verified. */
    @Synchronized fun readyVoices(check: () -> Unit = {}): List<String> =
        if (catalog.shared.all { installed(it, check) }) catalog.voices.filterValues { installed(it, check) }.keys.toList() else emptyList()

    /** Hugging Face serves pinned files from its CDN hosts; SHA-256 remains the integrity check. */
    private fun trustedHost(host: String) = host == "huggingface.co" || host.endsWith(".huggingface.co") || host.endsWith(".hf.co")

    private fun connect(initial: String, rangeStart: Long, check: () -> Unit): HttpURLConnection {
        var next = URL(initial)
        repeat(6) {
            check()
            require(next.protocol == "https" && next.userInfo == null && next.port == -1 && trustedHost(next.host)) { "Untrusted voice download redirect" }
            val connection = (next.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15000; readTimeout = 15000; instanceFollowRedirects = false
                setRequestProperty("Accept-Encoding", "identity")
                if (rangeStart > 0) setRequestProperty("Range", "bytes=$rangeStart-")
            }
            try {
                when (connection.responseCode) {
                    200, 206 -> return connection
                    301, 302, 303, 307, 308 -> next = URL(next, requireNotNull(connection.getHeaderField("Location")) { "Alba download unavailable. Please retry later" })
                    else -> throw VoiceDownloadFailed("Alba download unavailable. Please retry later")
                }
            } catch (error: Exception) { connection.disconnect(); throw error }
            connection.disconnect()
        }
        throw VoiceDownloadFailed("Too many voice download redirects")
    }

    /** Folders from earlier catalog revisions and their leftover partial files. */
    private fun removeOrphans() {
        context.noBackupFilesDir.listFiles()
            ?.filter { it.isDirectory && it.name.startsWith("carekosh-pocket-alba-") && it.name != root.name }
            ?.forEach { it.deleteRecursively() }
    }

    /** Installs the shared graphs and [voice]; resumes partial files kept from an interrupted download. */
    fun install(voice: String, check: () -> Unit, progress: (Long, Long) -> Unit) {
        synchronized(this) {
            check()
            removeOrphans()
            require(root.isDirectory || root.mkdirs()) { "Could not prepare voice storage" }
        }
        val assets = assetsFor(voice)
        val total = assets.sumOf { it.downloadBytes }
        val deadline = System.nanoTime() + 900_000_000_000L
        val boundedCheck = { check(); if (System.nanoTime() >= deadline) throw VoiceDownloadFailed("Alba download timed out. Please retry; finished parts are kept") }
        val missing = assets.filterNot { installed(it, boundedCheck) }
        val downloads = missing.map { it.state ?: it }
        // A packed voice also needs room for the packed file next to its downloaded state.
        val needed = missingBytes(downloads.map { it.bytes to File(root, it.name + ".part").let { part -> if (part.isFile) part.length() else 0L } }) +
            missing.sumOf { if (it.state != null) it.bytes else 0L }
        if (root.usableSpace <= needed + 64_000_000) throw VoiceDownloadFailed("Not enough free storage for Alba")
        var done = total - missing.sumOf { it.downloadBytes }
        progress(done, total)
        for (asset in missing) {
            boundedCheck()
            val source = asset.state ?: asset
            val partial = File(root, source.name + ".part")
            downloadResumable(partial, source.bytes, boundedCheck, { start -> connect(source.url, start, boundedCheck) }) { received -> progress(done + received, total) }
            boundedCheck()
            if (!valid(partial, source, boundedCheck)) { partial.delete(); throw VoiceDownloadFailed("Alba integrity check failed. Please retry") }
            val finished = if (asset.state == null) partial else File(root, asset.name + ".part").also { packed ->
                boundedCheck()
                val ok = try { packed.writeBytes(packPocketVoiceState(partial.readBytes())); valid(packed, asset, boundedCheck) }
                    catch (e: IllegalArgumentException) { false }
                partial.delete()
                if (!ok) { packed.delete(); throw VoiceDownloadFailed("This Alba voice could not be prepared on this phone") }
            }
            synchronized(this) {
                boundedCheck()
                val target = File(root, asset.name)
                target.delete()
                if (!finished.renameTo(target)) throw VoiceDownloadFailed("Could not install Alba file")
                verified.remove(asset.name)
            }
            done += asset.downloadBytes
        }
        if (!ready(voice, boundedCheck)) throw VoiceDownloadFailed("Alba pack is incomplete")
        progress(total, total)
    }

    @Synchronized fun remove() {
        verified.clear()
        removeOrphans()
        if (root.exists()) check(root.deleteRecursively()) { "Could not remove Alba" }
    }
}
