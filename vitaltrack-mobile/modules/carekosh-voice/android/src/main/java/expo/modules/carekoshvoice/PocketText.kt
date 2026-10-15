// Adapted from john-rocky/LiteRT-Models, MIT (Copyright 2026 Daisuke Majima).
package expo.modules.carekoshvoice

/** pocket-tts PR #296: soft endings become a period; other unfinished endings get one after any closer. */
private val TERMINAL = setOf('.', '!', '?', '…')
private val SOFT_ENDINGS = setOf(',', ';', ':', '-', '–', '—')
private val CLOSERS = setOf('"', '\'', ')', ']', '}', '”', '’', '»')

internal fun pocketTerminalPunctuation(text: String): String {
    val trimmed = text.trimEnd()
    var end = trimmed.length
    while (end > 0 && trimmed[end - 1] in CLOSERS) end--
    if (end == 0) return trimmed
    val core = trimmed.substring(0, end)
    val closers = trimmed.substring(end)
    return when (core.last()) {
        in TERMINAL -> trimmed
        in SOFT_ENDINGS -> core.dropLast(1).trimEnd() + "." + closers
        else -> "$trimmed."
    }
}

internal class PocketText(private val tokenizer: PocketTokenizer) {
    private val endTokens = tokenizer.encode(".!...?").drop(1).toSet()
    private val fallbackTokens = tokenizer.encode(",;:").drop(1).toSet()
    companion object {
        /** pocket-tts uses 50 tokens per chunk: fewer state resets and no pauses mid-list. */
        const val MAX_TOKENS_PER_CHUNK = 50
        /** Sentences packed into the first chunk stay short, so speech starts sooner. */
        const val FIRST_CHUNK_TOKENS = 32
        /** Room for the capital letter and closing period that [prepare] may add. */
        private const val PREPARE_MARGIN = 2
    }
    fun encode(text: String): IntArray = tokenizer.encode(text)

    /** pocket-tts PR #217: "0.9" or "1.5" is a number, not a sentence end. */
    private fun decimalPoint(list: List<Int>, i: Int): Boolean {
        if (i == 0 || i + 1 >= list.size || tokenizer.piece(list[i]) != ".") return false
        val before = tokenizer.piece(list[i - 1])
        val after = tokenizer.piece(list[i + 1])
        return before.lastOrNull()?.isDigit() == true && after.firstOrNull()?.isDigit() == true
    }
    // ---- text preparation (ports of pocket_tts.models.tts_model) ----------

    /** prepare_text_prompt: normalize whitespace and case, finish the sentence; guess the EOS tail. */
    fun prepare(raw: String): Pair<String, Int> {
        var text = raw.trim()
        require(text.isNotEmpty()) { "Text prompt cannot be empty" }
        text = text.replace('\n', ' ').replace('\r', ' ').replace(Regex(" {2,}"), " ")
        val words = text.trim().split(Regex("\\s+")).size
        val guess = if (words <= 4) 3 else 1
        if (!text[0].isUpperCase()) text = text[0].uppercaseChar() + text.substring(1)
        return pocketTerminalPunctuation(text) to guess
    }

    private fun tokens(text: String): Int = tokenizer.encode(prepare(text).first).size

    /**
     * Sentences packed up to the chunk limit. A sentence longer than the limit splits at commas; only
     * a single clause that is still too long splits between words. Every chunk fits the model after
     * [prepare] adds its capital letter and period.
     */
    fun chunks(raw: String): List<String> {
        val (prepared, _) = prepare(raw)
        val tokens = tokenizer.encode(prepared.trim()).toList()
        val limit = MAX_TOKENS_PER_CHUNK - PREPARE_MARGIN

        fun boundaries(list: List<Int>, marks: Set<Int>): List<Int> {
            val idx = ArrayList<Int>()
            idx.add(0)
            var prevWasBoundary = false
            for ((i, tok) in list.withIndex()) {
                if (tok in marks && !decimalPoint(list, i)) prevWasBoundary = true
                else {
                    if (prevWasBoundary) idx.add(i)
                    prevWasBoundary = false
                }
            }
            idx.add(list.size)
            return idx
        }

        fun segments(list: List<Int>, idx: List<Int>): List<String> =
            (0 until idx.size - 1).map { i -> tokenizer.decode(list.subList(idx[i], idx[i + 1])).trim() }.filter { it.isNotEmpty() }

        fun byWords(clause: String, cap: Int = MAX_TOKENS_PER_CHUNK): List<String> {
            val parts = ArrayList<String>()
            var part = ""
            for (word in clause.split(Regex("\\s+"))) {
                val candidate = if (part.isEmpty()) word else "$part $word"
                if (tokens(candidate) > cap) {
                    require(part.isNotEmpty()) { "A word is too long to speak" }
                    parts.add(part)
                    part = word
                    require(tokens(part) <= cap) { "A word is too long to speak" }
                } else part = candidate
            }
            if (part.isNotEmpty()) parts.add(part)
            return parts
        }

        val pieces = ArrayList<String>()
        for (sentence in segments(tokens, boundaries(tokens, endTokens))) {
            if (tokens(sentence) <= MAX_TOKENS_PER_CHUNK) { pieces.add(sentence); continue }
            val sub = tokenizer.encode(sentence).toList()
            for (clause in segments(sub, boundaries(sub, fallbackTokens))) {
                if (tokens(clause) <= MAX_TOKENS_PER_CHUNK) pieces.add(clause) else pieces.addAll(byWords(clause))
            }
        }

        val chunks = ArrayList<String>()
        var current = ""
        // A long first clause must obey the low-latency cap too, rather than bypassing the
        // sentence-packing cap simply because `current` is still empty.
        val firstPieces = if (tokens(pieces.first()) > FIRST_CHUNK_TOKENS)
            byWords(pieces.first(), FIRST_CHUNK_TOKENS) + pieces.drop(1) else pieces
        for (piece in firstPieces) {
            val candidate = if (current.isEmpty()) piece else "$current $piece"
            val cap = if (chunks.isEmpty()) FIRST_CHUNK_TOKENS - PREPARE_MARGIN else limit
            if (current.isNotEmpty() && tokenizer.encode(candidate).size > cap) { chunks.add(current); current = piece }
            else current = candidate
        }
        if (current.isNotEmpty()) chunks.add(current)
        require(chunks.size in 1..24) { "Too many sentences to speak" }
        return chunks
    }
}
