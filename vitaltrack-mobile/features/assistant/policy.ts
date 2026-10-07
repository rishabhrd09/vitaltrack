/**
 * Optional Groq TEXT interpretation is available after server configuration
 * and explicit per-account consent. Familiar commands remain local.
 * Cloud audio stays disabled: recordings and spoken replies stay on-device.
 * Cloud text requests write consent/usage metadata, never inventory.
 */
export const CLOUD_TEXT_ENABLED = true;
export const CLOUD_VOICE_ENABLED = false;
