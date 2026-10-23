package expo.modules.carekoshvoice

import org.json.JSONObject

/** Strict bounded result validation, independent of model inference so it can run on the JVM. */
internal fun parseWhistleTranscript(result: String): String {
    require(result.length in 1..16384) { "Invalid Whistle result" }
    val json = JSONObject(result)
    require(json.opt("language") is String && json.getString("language") == "en") { "Whistle could not recognise English speech" }
    require(json.opt("text") is String) { "Invalid Whistle transcript" }
    val text = json.getString("text").trim()
    require(text.length in 1..600 && text.any { it.isLetterOrDigit() } && text.none { it == '\u0000' }) { "Speech was unclear. Please try again or type" }
    return text
}
