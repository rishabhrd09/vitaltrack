/**
 * Release policy: cloud voice (Groq, Sarvam, Kokoro, Alba) is switched off in
 * this release. Listening, understanding and speech run on the phone, and the
 * only server call the assistant makes is the read-only inventory refresh.
 *
 * Turning it on is a separate decision: server AI flags, provider data review,
 * and accepting the consent/usage metadata that cloud requests write.
 */
export const CLOUD_VOICE_ENABLED = false;
