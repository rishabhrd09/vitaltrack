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

/**
 * Synthetic, offline regression checks against the real ModelPack implementation.
 * No model or network is used: HTTPS is intercepted only in this short-lived test JVM.
 *
 * Compile ModelPack.kt, PackDownload.kt, VoiceErrors.kt and this script against android-all
 * and moonshine-voice classes, then run expo.modules.carekoshvoice.Check_model_packKt.
 * Set -Djava.io.tmpdir to scratch when running from a read-only checkout.
 */
fun main() {
    val root = java.nio.file.Files.createTempDirectory("carekosh-model-pack-check-").toFile()
    try { checkModelPack(root) } finally { root.deleteRecursively() }
}

private fun checkModelPack(root: File) {
    val context = object : ContextWrapper(null) {
        override fun getNoBackupFilesDir() = root
    }
    val payload = byteArrayOf(1, 2, 3, 4)
    val checksum = java.util.Base64.getEncoder().encodeToString(
        MessageDigest.getInstance("SHA-256").digest(payload),
    )
    val pack = ModelPack(context)
    // Replace the embedded SDK catalog without invoking its JNI catalog or downloading any models.
    val catalog = ModelPack::class.java.getDeclaredField("assets\$delegate").also { it.isAccessible = true }
    catalog.set(pack, lazyOf(listOf(ModelPack.Asset(
        "test.bin", "https://download.moonshine.ai/model/small-streaming-en/quantized_test",
        payload.size.toLong(), checksum, "sha256",
    ))))

    check(pack.root.mkdirs())
    val file = File(pack.root, "test.bin").also { it.writeBytes(payload) }
    check(pack.ready())
    val timestamp = file.lastModified()
    file.writeBytes(byteArrayOf(9, 8, 7, 6))
    check(file.setLastModified(timestamp))
    check(pack.ready()) // Status can still use its inexpensive metadata cache.
    check(!pack.ready(refresh = true)) // Both fresh engine-load paths require this verification.
    println("PASS engine-load verification rejects changed same-size/time bytes")
    pack.remove()

    val readStarted = CountDownLatch(1)
    val releaseRead = CountDownLatch(1)
    URL.setURLStreamHandlerFactory { protocol ->
        if (protocol != "https") null else object : URLStreamHandler() {
            override fun openConnection(url: URL): URLConnection = object : HttpURLConnection(url) {
                override fun connect() {}
                override fun disconnect() {}
                override fun usingProxy() = false
                override fun getResponseCode() = 200
                override fun getInputStream() = object : ByteArrayInputStream(payload) {
                    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                        readStarted.countDown()
                        check(releaseRead.await(10, TimeUnit.SECONDS))
                        return super.read(buffer, offset, length)
                    }
                }
            }
        }
    }

    val download = VoiceWorkLane("model-pack-check-download")
    val capture = VoiceWorkLane("model-pack-check-capture")
    val generation = AtomicInteger(0)
    val expected = generation.get()
    try {
        val pending = download.executor.submit {
            pack.install({ if (generation.get() != expected) throw VoiceCancelled() }) { _, _ -> }
        }
        check(readStarted.await(5, TimeUnit.SECONDS))
        check(!capture.executor.submit<Boolean> { pack.ready(refresh = true) }.get(5, TimeUnit.SECONDS))
        println("PASS capture readiness finishes while actual ModelPack HTTP read is blocked")

        generation.incrementAndGet()
        pack.remove()
        releaseRead.countDown()
        try {
            pending.get(5, TimeUnit.SECONDS)
            error("A cancelled installation completed")
        } catch (error: ExecutionException) {
            check(error.cause is VoiceCancelled)
        }
        check(!pack.root.exists())
        println("PASS removal plus cancellation cannot be followed by late pack publication")
    } finally {
        releaseRead.countDown()
        download.executor.shutdownNow()
        capture.executor.shutdownNow()
        check(download.executor.awaitTermination(5, TimeUnit.SECONDS))
        check(capture.executor.awaitTermination(5, TimeUnit.SECONDS))
    }
}
