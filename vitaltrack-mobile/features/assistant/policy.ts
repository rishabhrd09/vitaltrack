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
/** Alba selection and native diagnostics stay paused in this reviewed release. */
export const VOICE_DIAGNOSTICS_ENABLED = false;
export const ALBA_SELECTION_ENABLED = false;
