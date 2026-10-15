package expo.modules.carekoshvoice

import java.nio.ByteBuffer
import java.nio.ByteOrder

private const val BAD_STATE = "Unsupported Alba voice file"
private const val LAYERS = 6
private const val HEADS = 16
private const val HEAD_DIM = 64
private const val MAX_FRAMES = 200

/**
 * Packs a pinned pocket-tts voice state (.safetensors: per layer a float32 KV `cache` [2, 1, T, 16, 64],
 * an int64 `offset` and, in newer files, an int64 `pad` that must be 0) into the pt_voice_<id>.bin
 * layout [PocketSynthesizer] loads: int32 frame count, then K and V as fp16 [96][frames][64], with each
 * K head's dimensions de-interleaved (even dims first) to match the exported graphs.
 * Same bytes as scripts/pocket-host-check/pack_voice.py and `pack_voice` in john-rocky/LiteRT-Models
 * build_pockettts.py (MIT). Callers verify the source and the packed file against pinned SHA-256s.
 */
internal fun packPocketVoiceState(file: ByteArray): ByteArray {
    require(file.size >= 8) { BAD_STATE }
    val input = ByteBuffer.wrap(file).order(ByteOrder.LITTLE_ENDIAN)
    val headerSize = input.getLong(0)
    require(headerSize in 2..100_000 && 8 + headerSize <= file.size) { BAD_STATE }
    val entries = SafetensorsHeader(String(file, 8, headerSize.toInt(), Charsets.UTF_8)).read()
    val dataStart = 8 + headerSize.toInt()
    val names = (0 until LAYERS).flatMap { l -> listOf("cache", "offset", "pad").map { "transformer.layers.$l.self_attn/$it" } }
    require(names.containsAll(entries.keys)) { BAD_STATE }

    fun tensor(name: String, dtype: String, bytesPerValue: Int): SafetensorsEntry {
        val entry = requireNotNull(entries[name]) { BAD_STATE }
        val count = entry.shape.fold(1L) { n, d -> n * d }
        require(entry.dtype == dtype && entry.start in 0..entry.end && dataStart + entry.end <= file.size &&
            entry.end - entry.start == count * bytesPerValue) { BAD_STATE }
        return entry
    }
    fun scalar(name: String): Long = tensor(name, "I64", 8).let {
        require(it.shape == listOf(1L)) { BAD_STATE }
        input.getLong(dataStart + it.start.toInt())
    }

    var frames = -1
    val caches = ArrayList<Pair<Int, Int>>() // data offset, capacity
    for (layer in 0 until LAYERS) {
        val prefix = "transformer.layers.$layer.self_attn/"
        if ("${prefix}pad" in entries) require(scalar("${prefix}pad") == 0L) { BAD_STATE }
        val offset = scalar("${prefix}offset")
        val cache = tensor("${prefix}cache", "F32", 4)
        require(cache.shape.size == 5 && cache.shape[0] == 2L && cache.shape[1] == 1L && cache.shape[3] == HEADS.toLong() &&
            cache.shape[4] == HEAD_DIM.toLong() && cache.shape[2] in 1L..1024L) { BAD_STATE }
        require(offset in 1L..minOf(cache.shape[2], MAX_FRAMES.toLong()) && (frames < 0 || offset == frames.toLong())) { BAD_STATE }
        frames = offset.toInt()
        caches.add(dataStart + cache.start.toInt() to cache.shape[2].toInt())
    }

    val output = ByteBuffer.allocate(4 + 2 * LAYERS * HEADS * frames * HEAD_DIM * 2).order(ByteOrder.LITTLE_ENDIAN)
    output.putInt(frames)
    for (kv in 0..1) for ((base, capacity) in caches) for (head in 0 until HEADS) for (t in 0 until frames) {
        for (d in 0 until HEAD_DIM) {
            // K: even dims then odd dims of each head (the exporter's RoPE de-interleave); V unchanged.
            val source = if (kv == 0) (if (d < HEAD_DIM / 2) 2 * d else 2 * (d - HEAD_DIM / 2) + 1) else d
            val value = input.getFloat(base + 4 * (((kv * capacity + t) * HEADS + head) * HEAD_DIM + source))
            val half = pocketHalf(value)
            require(value.isFinite() && (half.toInt() and 0x7c00) != 0x7c00) { BAD_STATE }
            output.putShort(half)
        }
    }
    return output.array()
}

/**
 * float32 -> IEEE half bits, rounding to nearest even: a port of numpy's npy_floatbits_to_halfbits
 * (`astype(float16)`). Finite inputs only; values beyond the half range give infinity.
 */
internal fun pocketHalf(value: Float): Short {
    val f = java.lang.Float.floatToRawIntBits(value)
    val sign = (f ushr 16) and 0x8000
    val exp = f and 0x7f800000
    if (exp >= 0x47800000) return (sign or 0x7c00).toShort()
    if (exp <= 0x38000000) {
        if (exp < 0x33000000) return sign.toShort() // underflows to signed zero
        var sig = (0x00800000 + (f and 0x007fffff)) ushr (113 - (exp ushr 23))
        if ((sig and 0x3fff) != 0x1000 || (f and 0x7ff) != 0) sig += 0x1000
        return (sign + (sig ushr 13)).toShort()
    }
    var sig = f and 0x007fffff
    if ((sig and 0x3fff) != 0x1000) sig += 0x1000
    return (sign + ((exp - 0x38000000) ushr 13) + (sig ushr 13)).toShort()
}

internal data class SafetensorsEntry(val dtype: String, val shape: List<Long>, val start: Long, val end: Long)

/** Strict reader for a safetensors JSON header: tensor entries plus an optional string-only `__metadata__`. */
private class SafetensorsHeader(private val text: String) {
    private var i = 0
    private fun peek(): Char { while (i < text.length && text[i].isWhitespace()) i++; require(i < text.length) { BAD_STATE }; return text[i] }
    private fun expect(c: Char) { require(peek() == c) { BAD_STATE }; i++ }
    private fun string(): String {
        expect('"')
        val end = text.indexOf('"', i)
        require(end >= i && text.substring(i, end).none { it == '\\' || it < ' ' }) { BAD_STATE }
        return text.substring(i, end).also { i = end + 1 }
    }
    private fun number(): Long {
        peek()
        val start = i
        while (i < text.length && text[i].isDigit()) i++
        require(i - start in 1..15) { BAD_STATE }
        return text.substring(start, i).toLong()
    }
    private fun <T> list(item: () -> T): List<T> {
        expect('[')
        val out = ArrayList<T>()
        if (peek() == ']') { i++; return out }
        while (true) { out.add(item()); if (peek() == ',') i++ else { expect(']'); return out } }
    }
    private fun fields(value: (String) -> Unit) {
        expect('{')
        val seen = HashSet<String>()
        if (peek() == '}') { i++; return }
        while (true) {
            val key = string()
            require(seen.add(key)) { BAD_STATE }
            expect(':')
            value(key)
            if (peek() == ',') i++ else { expect('}'); return }
        }
    }
    private fun entry(): SafetensorsEntry {
        var dtype: String? = null
        var shape: List<Long>? = null
        var offsets: List<Long>? = null
        fields { field ->
            when (field) {
                "dtype" -> dtype = string()
                "shape" -> shape = list { number() }
                "data_offsets" -> offsets = list { number() }
                else -> throw IllegalArgumentException(BAD_STATE)
            }
        }
        val range = requireNotNull(offsets) { BAD_STATE }
        require(range.size == 2) { BAD_STATE }
        return SafetensorsEntry(requireNotNull(dtype) { BAD_STATE }, requireNotNull(shape) { BAD_STATE }, range[0], range[1])
    }
    fun read(): Map<String, SafetensorsEntry> {
        val entries = LinkedHashMap<String, SafetensorsEntry>()
        fields { name -> if (name == "__metadata__") fields { string() } else entries[name] = entry() }
        while (i < text.length && text[i].isWhitespace()) i++
        require(i == text.length) { BAD_STATE }
        return entries
    }
}
