import AsyncStorage from '@react-native-async-storage/async-storage';
import { ALBA_SELECTION_ENABLED, CLOUD_TEXT_ENABLED, CLOUD_TRANSCRIPTION_ENABLED, CLOUD_VOICE_ENABLED, SARVAM_SPEECH_ENABLED } from './policy';

export type InputProvider = 'offline' | 'groq' | 'sarvam';
export type SpeechProvider = 'device' | 'pocket' | 'kokoro' | 'sarvam';
export type OfflineFallbackVoice = 'device' | 'pocket';
export type Preferences = { enabled: boolean; cloud: boolean; microphone: boolean; spokenReplies: boolean; audioOptIn: boolean; inputProvider: InputProvider; speechProvider: SpeechProvider; speechPace?: number; sarvamSpeechOptIn?: boolean; sarvamKeySource?: 'application' | 'personal';
  /** Offline voice used only when online speech fails; absent = off. Set after a successful preview. */
  speechFallback?: OfflineFallbackVoice };
export const defaults: Preferences = { enabled: false, cloud: false, microphone: false, spokenReplies: false, audioOptIn: false, inputProvider: 'offline', speechProvider: 'device' };
// New consent contract: never carry a broad old cloud opt-in into new providers.
const key = (owner: string) => `carekosh-voice-settings-v2:${owner}`;
/** Migrate disabled voice choices locally, without enabling any online service. */
export function permittedSpeechProvider(provider: SpeechProvider, sarvamOptIn = false): SpeechProvider {
  if (provider === 'device') return 'device';
  if (provider === 'pocket') return ALBA_SELECTION_ENABLED ? 'pocket' : 'device';
  if (provider === 'sarvam') return SARVAM_SPEECH_ENABLED && sarvamOptIn ? 'sarvam' : 'device';
  return CLOUD_VOICE_ENABLED ? provider : 'device';
}
/** A paused or unknown fallback voice reads as "off"; it is never swapped for another voice. */
export function permittedFallback(voice: unknown): OfflineFallbackVoice | undefined {
  return voice === 'device' || (voice === 'pocket' && ALBA_SELECTION_ENABLED) ? voice : undefined;
}
function withFallback<T extends Preferences>(preferences: T): T {
  const { speechFallback, ...rest } = preferences;
  const permitted = permittedFallback(speechFallback);
  return (permitted ? { ...rest, speechFallback: permitted } : rest) as T;
}
export async function loadPreferences(owner: string): Promise<Preferences> {
  try {
    const value = JSON.parse(await AsyncStorage.getItem(key(owner)) || '{}');
    const stored: Preferences = { enabled: value.enabled === true, cloud: value.cloud === true, microphone: value.microphone === true, spokenReplies: value.spokenReplies === true, audioOptIn: value.audioOptIn === true,
      inputProvider: ['offline', 'groq', 'sarvam'].includes(value.inputProvider) ? value.inputProvider : 'offline',
      speechProvider: ['device', 'pocket', 'kokoro', 'sarvam'].includes(value.speechProvider) ? value.speechProvider : 'device',
      ...(value.sarvamSpeechOptIn === true ? { sarvamSpeechOptIn: true } : {}),
      ...(value.sarvamKeySource === 'personal' ? { sarvamKeySource: 'personal' as const } : {}),
      ...(typeof value.speechPace === 'number' && [0.9, 1, 1.1].includes(value.speechPace) ? { speechPace: value.speechPace } : {}),
      ...(permittedFallback(value.speechFallback) ? { speechFallback: permittedFallback(value.speechFallback) } : {}) };
    // Text opt-in never enables audio upload or cloud speech, including old settings.
    return { ...stored, cloud: !!(CLOUD_TEXT_ENABLED || CLOUD_VOICE_ENABLED) && stored.cloud,
      inputProvider: CLOUD_TRANSCRIPTION_ENABLED && stored.audioOptIn && stored.inputProvider === 'groq' ? 'groq' : 'offline',
      speechProvider: permittedSpeechProvider(stored.speechProvider, stored.sarvamSpeechOptIn) };
  } catch { return { ...defaults }; }
}
export async function savePreferences(owner: string, preferences: Preferences) {
  await AsyncStorage.setItem(key(owner), JSON.stringify(withFallback({ ...preferences, speechProvider: permittedSpeechProvider(preferences.speechProvider, preferences.sarvamSpeechOptIn) })));
}
