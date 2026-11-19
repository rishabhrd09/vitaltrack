package expo.modules.carekoshvoice

import android.content.Context
import java.io.File

/** A single immutable model DATA file. Runtime CODE is linked into the diagnostic APK at build time. */
internal class WhistlePack(context: Context) {
    val root = File(context.noBackupFilesDir, "carekosh-whistle-741118687e1f008f06d1351a402a731274789790")
    val model get() = File(root, "whistle.cact")
    val bytes = 16_919_407L
    private val checksum = "b6e02f048568ac5d01a2042556c658061e699acbc0aa2a1439f52f3d461dffeb"
    private val url = "https://huggingface.co/Cactus-Compute/whistle/resolve/741118687e1f008f06d1351a402a731274789790/whistle.cact"
    @Volatile private var verified: Pair<Long, Long>? = null

    private fun valid(file: File, check: () -> Unit) =
        file.isFile && file.length() == bytes && sha256Of(file, check) == checksum

    @Synchronized fun ready(check: () -> Unit = {}, refresh: Boolean = false): Boolean {
        check()
        val state = model.length() to model.lastModified()
        if (!refresh && verified == state) return true
        val ready = valid(model, check)
        verified = if (ready) state else null
        return ready
    }

    fun install(check: () -> Unit, progress: (Long, Long) -> Unit) {
        synchronized(this) { check(); root.mkdirs() }
        val deadline = System.nanoTime() + 600_000_000_000L
        val boundedCheck = { check(); if (System.nanoTime() >= deadline) throw VoiceDownloadFailed("Whistle download timed out. Finished parts are kept for retry") }
        if (ready(boundedCheck, refresh = true)) { progress(bytes, bytes); return }
        val partial = File(root, "whistle.cact.part")
        if (root.usableSpace <= missingBytes(listOf(bytes to partial.length())) + 64_000_000L) {
            throw VoiceDownloadFailed("Not enough storage for Whistle")
        }
        downloadResumable(partial, bytes, boundedCheck, { start ->
            openPinned(url, start, boundedCheck, ::huggingFaceHost, "Whistle download unavailable. Please retry")
        }) { received -> progress(received, bytes) }
        if (!valid(partial, boundedCheck)) {
            partial.delete()
            throw VoiceDownloadFailed("Whistle integrity check failed. Please retry")
        }
        synchronized(this) {
            boundedCheck() // Removal changes downloadGeneration before taking this publication lock.
            if (model.exists() && !model.delete()) throw VoiceDownloadFailed("Could not replace Whistle model")
            if (!partial.renameTo(model)) throw VoiceDownloadFailed("Could not install Whistle model")
            verified = null
        }
    }

    @Synchronized fun remove() {
        verified = null
        if (root.exists()) check(root.deleteRecursively()) { "Could not remove Whistle model" }
    }
}
