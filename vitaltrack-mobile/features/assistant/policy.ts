/**
 * Optional Groq TEXT interpretation is available after server configuration
 * and explicit per-account consent. Familiar commands remain local.
 * Groq listening is separately opt-in; text consent never authorizes audio upload.
 * Sarvam English narration has separate consent. Other cloud speech stays hidden.
 * Alba is retained for investigation but cannot be selected or downloaded.
 * Cloud text requests write consent/usage metadata, never inventory.
 */
export const CLOUD_TEXT_ENABLED = true;
export const CLOUD_TRANSCRIPTION_ENABLED = true;
export const CLOUD_VOICE_ENABLED = false;
export const SARVAM_SPEECH_ENABLED = true;
/**
 * Set only by the `preview-voice-diagnostics` EAS profile (EXPO_PUBLIC_VOICE_DIAGNOSTICS=1, inlined
 * at build time). Normal preview and production builds leave it unset: no diagnostics panel, and
 * Alba stays paused until it passes the device release criteria.
 */
const voiceDiagnosticsFlag = typeof process === 'undefined' ? undefined : process.env.EXPO_PUBLIC_VOICE_DIAGNOSTICS;
export const VOICE_DIAGNOSTICS_ENABLED = voiceDiagnosticsFlag === '1';
export const ALBA_SELECTION_ENABLED = VOICE_DIAGNOSTICS_ENABLED;
