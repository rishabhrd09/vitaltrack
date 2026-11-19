// Host-only stand-in for the Android LiteRT 2.1.6 Kotlin API surface used by CareKosh.
// Each call is forwarded to server.py (real LiteRT 2.1.6 on macOS). Not shipped.
package com.google.ai.edge.litert

import java.io.DataInputStream
import java.io.DataOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

enum class Accelerator { NONE, CPU, GPU, NPU }

object Server {
    private val process = ProcessBuilder(System.getenv("SHIM_PY"), System.getenv("SHIM_SERVER")).redirectError(ProcessBuilder.Redirect.DISCARD).start()
    val input = DataInputStream(process.inputStream.buffered(1 shl 20))
    val output = DataOutputStream(process.outputStream.buffered(1 shl 20))
    val failGpuFor: Set<String> = (System.getenv("SHIM_FAIL_GPU") ?: "").split(',').filter { it.isNotEmpty() }.toSet()
    val calls = ArrayList<String>()
    fun line(): String = buildString { while (true) { val c = input.read(); if (c < 0 || c == '\n'.code) break; append(c.toChar()) } }
}

class LiteRtException(message: String) : Exception(message)

class TensorBuffer(val size: Int) : AutoCloseable {
    var data = FloatArray(size)
    fun writeFloat(values: FloatArray) { require(values.size <= size) { "shim: buffer overflow" }; System.arraycopy(values, 0, data, 0, values.size) }
    fun readFloat(): FloatArray = data.copyOf()
    override fun close() {}
}

class CompiledModel private constructor(private val handle: Int, private val inSizes: List<Int>, private val outSizes: List<Int>) : AutoCloseable {
    class CpuOptions(val numThreads: Int? = null, val xnnPackFlags: Int? = null, val xnnPackWeightCachePath: String? = null)
    class GpuOptions(val precision: Precision? = null) { enum class Precision { DEFAULT, FP16, FP32 } }
    class Options(vararg val accelerators: Accelerator) { var cpuOptions: CpuOptions? = null; var gpuOptions: GpuOptions? = null }
    fun createInputBuffers() = inSizes.map { TensorBuffer(it) }
    fun createOutputBuffers() = outSizes.map { TensorBuffer(it) }
    fun run(inputs: List<TensorBuffer>, outputs: List<TensorBuffer>) = synchronized(Server) {
        Server.output.writeBytes("R $handle\n")
        val bb = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN)
        for (b in inputs) {
            Server.output.write(bb.clear().putInt(b.size).array())
            val bytes = ByteBuffer.allocate(4 * b.size).order(ByteOrder.LITTLE_ENDIAN); bytes.asFloatBuffer().put(b.data)
            Server.output.write(bytes.array())
        }
        Server.output.flush()
        val status = Server.line(); if (status != "OK") throw LiteRtException("shim run: $status")
        for (b in outputs) {
            val n = ByteBuffer.wrap(ByteArray(4).also { Server.input.readFully(it) }).order(ByteOrder.LITTLE_ENDIAN).int
            val bytes = ByteArray(4 * n).also { Server.input.readFully(it) }
            ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(b.data, 0, n)
        }
    }
    override fun close() {}
    companion object {
        fun create(path: String, options: Options, environment: Any?): CompiledModel = synchronized(Server) {
            val accel = options.accelerators.first()
            val name = path.substringAfterLast('/')
            Server.calls.add("$name:$accel")
            val precision = options.gpuOptions?.precision?.name ?: "DEFAULT"
            val fail = if (accel == Accelerator.GPU && name in Server.failGpuFor) 1 else 0
            Server.output.writeBytes("C $path $accel $precision $fail ${options.cpuOptions?.numThreads ?: 4}\n"); Server.output.flush()
            val reply = Server.line().split(' ')
            if (reply[0] != "OK") throw LiteRtException("shim create: ${reply.joinToString(" ")}")
            CompiledModel(reply[1].toInt(), reply[2].split(',').map(String::toInt), reply[3].split(',').map(String::toInt))
        }
    }
}
