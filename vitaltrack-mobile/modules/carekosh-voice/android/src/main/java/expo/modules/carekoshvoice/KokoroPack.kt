package expo.modules.carekoshvoice

import android.content.Context
import java.io.File
import org.json.JSONObject

/**
 * Kokoro-82M test voice for moonshine-voice 0.1.5 (diagnostics builds only): exactly the files that
 * library's TextToSpeech loads through modelsFrom([root]) for en_us, from Moonshine's Hugging Face
 * asset mirror at a fixed commit, each size- and SHA-256-checked. Shared files plus one style file per
 * voice. The library is never asked to download anything. Metadata and publication are synchronized
 * across the download and offline voice workers; network reads hold no pack lock.
 */
internal class KokoroPack(private val context: Context) {
    companion object {
        const val REVISION = "0bf2f2e5aff22e6fbba4300b00a4e00bbc4f8aae"
        private const val BASE = "https://huggingface.co/moonshine-ai/moonshine-voice-assets/resolve/$REVISION/tts/"
        private val PATH = Regex("(kokoro|en_us)(/[a-z0-9_]+)*/[a-z0-9_-]+(\\.[a-z0-9_]+)+")
    }
    val root = File(context.noBackupFilesDir, "carekosh-kokoro-${REVISION.take(8)}")
    private data class Asset(val path: String, val bytes: Long, val sha: String)
    data class Voice(val id: String, val label: String)
    private class Catalog(val shared: List<Asset>, val voices: LinkedHashMap<String, Asset>, val labels: Map<String, String>)

    private val catalog by lazy {
        val data = context.assets.open("kokoro-manifest.json").bufferedReader().use { JSONObject(it.readText()) }
        require(data.getString("revision") == REVISION && data.getString("language") == "en_us") { "Invalid Kokoro catalog" }
        fun asset(a: JSONObject) = Asset(a.getString("path"), a.getLong("bytes"), a.getString("sha256")).also {
            require(it.path.matches(PATH) && !it.path.contains("..")) { "Invalid Kokoro catalog" }
            require(it.bytes in 1..120_000_000 && it.sha.matches(Regex("[a-f0-9]{64}"))) { "Invalid Kokoro catalog" }
        }
        val files = data.getJSONArray("assets")
        require(files.length() == 9) { "Invalid Kokoro catalog" }
        val shared = (0 until files.length()).map { asset(files.getJSONObject(it)) }
        val list = data.getJSONArray("voices")
        require(list.length() in 1..8) { "Invalid Kokoro catalog" }
        val voices = LinkedHashMap<String, Asset>()
        val labels = HashMap<String, String>()
        for (i in 0 until list.length()) {
            val entry = list.getJSONObject(i)
            val id = entry.getString("id")
            // US (a) or British (b) English, female or male: the voices the en_us G2P files serve.
            require(id.matches(Regex("[ab][fm]_[a-z]{2,16}")) && id !in voices) { "Invalid Kokoro catalog" }
            val voice = asset(entry)
            require(voice.path == "kokoro/voices/$id.kokorovoice" && voice.bytes <= 2_000_000) { "Invalid Kokoro catalog" }
            voices[id] = voice
            labels[id] = entry.getString("label").take(40)
        }
        val all = shared + voices.values
        require(all.map { it.path }.distinct().size == all.size && all.sumOf { it.bytes } < 150_000_000) { "Invalid Kokoro catalog" }
        Catalog(shared, voices, labels)
    }

    val voices: List<Voice> get() = catalog.voices.keys.map { Voice(it, catalog.labels.getValue(it)) }
    private fun voiceAsset(id: String) = catalog.voices[id] ?: throw IllegalArgumentException("Unknown Kokoro voice")
    /** Throws for a voice that is not in the pinned catalog. */
    fun requireVoice(id: String) { voiceAsset(id) }
    private fun assetsFor(voice: String) = catalog.shared + voiceAsset(voice)
    fun bytes(voice: String = "af_heart"): Long = assetsFor(voice).sumOf { it.bytes }

    /** App-private immutable files: each is hashed once per process unless its size or time changes. */
    private val verified = HashMap<String, Pair<Long, Long>>()
    private fun file(asset: Asset) = File(root, asset.path)
    @Synchronized private fun installed(asset: Asset, check: () -> Unit): Boolean {
        val target = file(asset)
        val stamp = target.length() to target.lastModified()
        if (target.isFile && verified[asset.path] == stamp) return true
        val ok = target.isFile && target.length() == asset.bytes && sha256Of(target, check) == asset.sha
        if (ok) verified[asset.path] = stamp else verified.remove(asset.path)
        return ok
    }
    @Synchronized fun ready(voice: String, check: () -> Unit = {}): Boolean {
        check()
        return assetsFor(voice).all { installed(it, check) }
    }
    /** Voices that can speak now: the shared files plus that voice's style are installed and verified. */
    @Synchronized fun readyVoices(check: () -> Unit = {}): List<String> =
        if (catalog.shared.all { installed(it, check) }) catalog.voices.filterValues { installed(it, check) }.keys.toList() else emptyList()

    /** Folders from earlier pinned revisions. */
    private fun removeOrphans() {
        context.noBackupFilesDir.listFiles()
            ?.filter { it.isDirectory && it.name.startsWith("carekosh-kokoro-") && it.name != root.name }
            ?.forEach { it.deleteRecursively() }
    }

    /** Installs the shared files and [voice]; resumes partial files kept from an interrupted download. */
    fun install(voice: String, check: () -> Unit, progress: (Long, Long) -> Unit) {
        synchronized(this) {
            check()
            removeOrphans()
            require(root.isDirectory || root.mkdirs()) { "Could not prepare voice storage" }
        }
        val assets = assetsFor(voice)
        val total = assets.sumOf { it.bytes }
        val deadline = System.nanoTime() + 900_000_000_000L
        val boundedCheck = { check(); if (System.nanoTime() >= deadline) throw VoiceDownloadFailed("Kokoro download timed out. Please retry; finished parts are kept") }
        val missing = assets.filterNot { installed(it, boundedCheck) }
        val needed = missingBytes(missing.map { it.bytes to File(root, it.path + ".part").let { part -> if (part.isFile) part.length() else 0L } })
        if (root.usableSpace <= needed + 64_000_000) throw VoiceDownloadFailed("Not enough free storage for Kokoro")
        var done = total - missing.sumOf { it.bytes }
        progress(done, total)
        for (asset in missing) {
            boundedCheck()
            val target = file(asset)
            require(target.parentFile?.let { it.isDirectory || it.mkdirs() } == true) { "Could not prepare voice storage" }
            val partial = File(root, asset.path + ".part")
            downloadResumable(partial, asset.bytes, boundedCheck, { start ->
                openPinned(BASE + asset.path, start, boundedCheck, ::huggingFaceHost, "Kokoro download unavailable. Please retry later")
            }) { received -> progress(done + received, total) }
            boundedCheck()
            if (partial.length() != asset.bytes || sha256Of(partial, boundedCheck) != asset.sha) {
                partial.delete(); throw VoiceDownloadFailed("Kokoro integrity check failed. Please retry")
            }
            synchronized(this) {
                boundedCheck()
                target.delete()
                if (!partial.renameTo(target)) throw VoiceDownloadFailed("Could not install Kokoro file")
                verified.remove(asset.path)
            }
            done += asset.bytes
        }
        if (!ready(voice, boundedCheck)) throw VoiceDownloadFailed("Kokoro pack is incomplete")
        progress(total, total)
    }

    @Synchronized fun remove() {
        verified.clear()
        removeOrphans()
        if (root.exists()) check(root.deleteRecursively()) { "Could not remove Kokoro" }
    }
}
