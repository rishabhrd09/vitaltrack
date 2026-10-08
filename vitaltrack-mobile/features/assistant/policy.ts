/**
 * Optional Groq TEXT interpretation is available after server configuration
 * and explicit per-account consent. Familiar commands remain local.
 * Groq listening is separately opt-in; text consent never authorizes audio upload.
 * Cloud speech stays disabled; replies use the phone's voice.
 * Cloud text requests write consent/usage metadata, never inventory.
 */
export const CLOUD_TEXT_ENABLED = true;
export const CLOUD_TRANSCRIPTION_ENABLED = true;
export const CLOUD_VOICE_ENABLED = false;
