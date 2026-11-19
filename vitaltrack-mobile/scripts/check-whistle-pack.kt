package expo.modules.carekoshvoice

import android.content.ContextWrapper
import java.io.ByteArrayInputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLConnection
import java.net.URLStreamHandler
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Offline checks of actual Whistle pack and result-validation code; no engine or model is needed. */
fun main() {
    check(parseWhistleTranscript("""{"text":"  Show Ambu Bag 2.5 units  ","language":"en"}""") == "Show Ambu Bag 2.5 units")
    check(parseWhistleTranscript("""{"text":"5","language":"en"}""") == "5")
    for (result in listOf("{}", "{", """{"text":"","language":""}""", """{"text":"...","language":"en"}""", """{"text":5,"language":"en"}""", """{"text":"hello","language":"hi"}""", """{"text":"hello\u0000world","language":"en"}""", """{"text":"${"x".repeat(601)}","language":"en"}""")) {
        check(runCatching { parseWhistleTranscript(result) }.isFailure) { "Accepted invalid result" }
    }
    println("PASS Whistle result parsing: bounded text/language, numeric follow-up and malformed/silent rejection")

    val folder = java.nio.file.Files.createTempDirectory("carekosh-whistle-pack-check-").toFile()
    val context = object : ContextWrapper(null) { override fun getNoBackupFilesDir() = folder }
    val pack = WhistlePack(context)
    check(pack.bytes == 16_919_407L && pack.model.name == "whistle.cact")
    check(pack.root.name == "carekosh-whistle-741118687e1f008f06d1351a402a731274789790")
    check(!pack.ready())
    // A 4-byte synthetic model replaces the file spec ONLY in this disposable JVM.
    val payload = byteArrayOf(1, 2, 3, 4)
    WhistlePack::class.java.getDeclaredField("bytes").also { it.isAccessible = true }.setLong(pack, payload.size.toLong())
    val digest = MessageDigest.getInstance("SHA-256").digest(payload).joinToString("") { "%02x".format(it.toInt() and 255) }
    WhistlePack::class.java.getDeclaredField("checksum").also { it.isAccessible = true }.set(pack, digest)
    pack.root.mkdirs()
    pack.model.writeBytes(payload)
    check(pack.ready())
    val stamp = pack.model.lastModified()
    pack.model.writeBytes(byteArrayOf(9, 8, 7, 6))
    check(pack.model.setLastModified(stamp))
    check(pack.ready()) // inexpensive metadata cache is allowed for status
    check(!pack.ready(refresh = true)) // recognition must always re-hash
    pack.remove()
    println("PASS Whistle model integrity: same-size/time corruption rejected before engine use")

    val started = CountDownLatch(1)
    val release = CountDownLatch(1)
    URL.setURLStreamHandlerFactory { protocol ->
        if (protocol != "https") null else object : URLStreamHandler() {
            override fun openConnection(url: URL): URLConnection = object : HttpURLConnection(url) {
                override fun connect() {}
                override fun disconnect() {}
                override fun usingProxy() = false
                override fun getResponseCode() = 200
                override fun getInputStream() = object : ByteArrayInputStream(payload) {
                    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                        started.countDown()
                        check(release.await(10, TimeUnit.SECONDS))
                        return super.read(buffer, offset, length)
                    }
                }
            }
        }
    }
    val generation = AtomicInteger(0)
    val download = VoiceWorkLane("whistle-check-download")
    val capture = VoiceWorkLane("whistle-check-capture")
    try {
        val expected = generation.get()
        val pending = download.executor.submit { pack.install({ if (generation.get() != expected) throw VoiceCancelled() }) { _, _ -> } }
        check(started.await(5, TimeUnit.SECONDS))
        check(!capture.executor.submit<Boolean> { pack.ready(refresh = true) }.get(5, TimeUnit.SECONDS))
        println("PASS blocked Whistle download does not own the capture worker")
        generation.incrementAndGet()
        pack.remove()
        release.countDown()
        try { pending.get(5, TimeUnit.SECONDS); error("Cancelled Whistle download completed") }
        catch (error: ExecutionException) { check(error.cause is VoiceCancelled) }
        check(!pack.model.exists())
        println("PASS cancelled/removed Whistle pack cannot be published late")
    } finally {
        release.countDown()
        download.executor.shutdownNow()
        capture.executor.shutdownNow()
        folder.deleteRecursively()
    }
}
