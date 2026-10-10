// Standalone JVM checks against real SentencePiece reference vectors.
// Compile together with PocketTokenizer.kt and PocketText.kt; no Android or models needed.
package expo.modules.carekoshvoice

import java.io.File
import java.util.Base64

fun main(args: Array<String>) {
    require(args.size == 2) { "Usage: <verified pt_tokenizer.tsv> <pocket-tokenizer-cases.tsv>" }
    val tokenizer = PocketTokenizer(File(args[0]))
    var cases = 0
    File(args[1]).forEachLine { row ->
        if (!row.startsWith("#")) {
            val cols = row.split('\t')
            val text = String(Base64.getDecoder().decode(cols[0]), Charsets.UTF_8)
            val expected = cols[1].split(',').filter { it.isNotEmpty() }.map { it.toInt() }.toIntArray()
            check(tokenizer.encode(text).contentEquals(expected)) { "Reference tokenizer mismatch at case ${cases + 1}" }
            check(tokenizer.decode(expected.toList()) == text) { "Tokenizer round-trip failed at case ${cases + 1}" }
            cases++
        }
    }
    val prompts = listOf(
        "Hello. I am your CareKosh stock assistant.",
        "${"hand gloves and sterile masks ".repeat(18)} are in stock",
        "First item, twenty pairs; second item, five boxes: not recorded. ".repeat(7),
        "Stock includes Café gloves and BP Monitor 50ml. Low stock: 1 pair; out of stock: 0 boxes.",
    )
    val chunker = PocketText(tokenizer)
    for (prompt in prompts) {
        val chunks = chunker.chunks(prompt)
        check(chunks.isNotEmpty())
        for (chunk in chunks) check(tokenizer.encode(chunker.prepare(chunk).first).size in 1..50)
        fun words(s: String) = s.lowercase().split(Regex("[^\\p{L}\\p{N}]+" )).filter { it.isNotEmpty() }
        check(words(chunks.joinToString(" ")) == words(prompt)) { "Chunking lost or duplicated words" }
    }
    check(runCatching { chunker.chunks("x".repeat(640)) }.isFailure)
    check(runCatching { chunker.chunks("") }.isFailure)
    check(runCatching { tokenizer.encode("x".repeat(701)) }.isFailure)
    check(runCatching { tokenizer.decode(listOf(-1)) }.isFailure)
    println("$cases SentencePiece parity/round-trip cases; ${prompts.size} bounded, lossless chunk cases; 4 invalid-input checks passed")
}
