// Adapted from john-rocky/LiteRT-Models, MIT (Copyright 2026 Daisuke Majima).
// Short chunks leave headroom for a slower voice within the fixed decoder window.
package expo.modules.carekoshvoice

internal class PocketText(private val tokenizer: PocketTokenizer) {
    private val endTokens = tokenizer.encode(".!...?").drop(1).toSet()
    private val fallbackTokens = tokenizer.encode(",;:").drop(1).toSet()
    companion object { const val MAX_TOKENS_PER_CHUNK = 32 }
    // ---- text preparation (ports of pocket_tts.models.tts_model) ----------

    /** prepare_text_prompt: normalize whitespace/case/punctuation; guess EOS tail. */
    fun prepare(raw: String): Pair<String, Int> {
        var text = raw.trim()
        require(text.isNotEmpty()) { "Text prompt cannot be empty" }
        text = text.replace('\n', ' ').replace('\r', ' ').replace("  ", " ")
        val words = text.trim().split(Regex("\\s+")).size
        val guess = if (words <= 4) 3 else 1
        if (!text[0].isUpperCase()) text = text[0].uppercaseChar() + text.substring(1)
        if (text.last().isLetterOrDigit()) text += "."
        return text to guess
    }

    /** Sentence segments packed within the shared token limit without losing words. */
    fun chunks(raw: String): List<String> {
        val (prepared, _) = prepare(raw)
        val tokens = tokenizer.encode(prepared.trim()).toList()

        fun boundaries(list: List<Int>, marks: Set<Int>): List<Int> {
            val idx = ArrayList<Int>()
            idx.add(0)
            var prevWasBoundary = false
            for ((i, tok) in list.withIndex()) {
                if (tok in marks) prevWasBoundary = true
                else {
                    if (prevWasBoundary) idx.add(i)
                    prevWasBoundary = false
                }
            }
            idx.add(list.size)
            return idx
        }

        fun segments(list: List<Int>, idx: List<Int>): List<Pair<Int, String>> =
            (0 until idx.size - 1).map { i ->
                val part = list.subList(idx[i], idx[i + 1])
                part.size to tokenizer.decode(part)
            }

        val sentences = segments(tokens, boundaries(tokens, endTokens))
        val refined = ArrayList<Pair<Int, String>>()
        for ((n, textSeg) in sentences) {
            if (n <= MAX_TOKENS_PER_CHUNK) { refined.add(n to textSeg); continue }
            val sub = tokenizer.encode(textSeg.trim()).toList()
            val subSegs = segments(sub, boundaries(sub, fallbackTokens))
            if (subSegs.size > 1) refined.addAll(subSegs) else refined.add(n to textSeg)
        }

        val chunks = ArrayList<String>()
        var current = ""
        var count = 0
        for ((n, sentence) in refined) {
            when {
                current.isEmpty() -> { current = sentence; count = n }
                count + n > MAX_TOKENS_PER_CHUNK -> {
                    chunks.add(current.trim()); current = sentence; count = n
                }
                else -> { current += " $sentence"; count += n }
            }
        }
        if (current.isNotEmpty()) chunks.add(current.trim())
        val bounded = ArrayList<String>()
        for (chunk in chunks) {
            var part = ""
            for (word in chunk.trim().split(Regex("\\s+"))) {
                val candidate = if (part.isEmpty()) word else "$part $word"
                if (tokenizer.encode(prepare(candidate).first).size > MAX_TOKENS_PER_CHUNK) {
                    require(part.isNotEmpty()) { "A word is too long to speak" }
                    bounded.add(part)
                    part = word
                    require(tokenizer.encode(prepare(part).first).size <= MAX_TOKENS_PER_CHUNK)
                } else part = candidate
            }
            if (part.isNotEmpty()) bounded.add(part)
        }
        require(bounded.size in 1..24) { "Too many sentences to speak" }
        return bounded
    }

}
