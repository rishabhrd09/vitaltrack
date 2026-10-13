import type { Capabilities, SarvamKeySource } from '@/services/assistant';

/** An unavailable personal key never selects the operator's shared account. */
export function sarvamSourceAvailable(caps: Capabilities, source: SarvamKeySource = 'application'): boolean {
  if (!caps.speech_providers.includes('sarvam')) return false;
  if (source === 'personal') return caps.sarvam_personal_key?.usable === true;
  // Older shared-key servers did not expose this optional metadata.
  return caps.sarvam_application_available ?? true;
}
