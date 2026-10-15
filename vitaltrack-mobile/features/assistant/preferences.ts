import AsyncStorage from '@react-native-async-storage/async-storage';
import { ALBA_SELECTION_ENABLED, CLOUD_TEXT_ENABLED, CLOUD_TRANSCRIPTION_ENABLED, CLOUD_VOICE_ENABLED, KOKORO_SELECTION_ENABLED, SARVAM_SPEECH_ENABLED } from './policy';

export type InputProvider = 'offline' | 'groq' | 'sarvam';
/** 'kokoro' is the retired hosted service (always migrates to the device voice); 'kokoro_offline' is the on-phone test voice. */
export type SpeechProvider = 'device' | 'pocket' | 'kokoro' | 'kokoro_offline' | 'sarvam';
export type OfflineFallbackVoice = 'device' | 'pocket';
/**
 * Commercial-use Pocket TTS presets from the pinned catalog (never cosette or jean, which are non-commercial).
 * albapause: Kyutai's Alba state that ends on a short pause (pocket-tts #334), packed on the phone.
 */
export const ALBA_VOICES = ['alba', 'albapause', 'charles', 'eve', 'mary', 'javert', 'marius'] as const;
export type AlbaVoice = typeof ALBA_VOICES[number];
/** Kokoro test voices in the pinned catalog: Heart and Bella (US), Emma (UK). */
export const KOKORO_VOICES = ['af_heart', 'af_bella', 'bf_emma'] as const;
export type KokoroVoice = typeof KOKORO_VOICES[number];
export type Preferences = { enabled: boolean; cloud: boolean; microphone: boolean; spokenReplies: boolean; audioOptIn: boolean; inputProvider: InputProvider; speechProvider: SpeechProvider; speechPace?: number; sarvamSpeechOptIn?: boolean; sarvamKeySource?: 'application' | 'personal';
  /** Offline voice used only when online speech fails; absent = off. Set after a successful preview. */
  speechFallback?: OfflineFallbackVoice;
  /** Pocket TTS preset for Alba-family speech; absent = the original Alba voice. */
  albaVoice?: AlbaVoice;
  /** Kokoro test voice; absent = Heart. */
  kokoroVoice?: KokoroVoice };
export const defaults: Preferences = { enabled: false, cloud: false, microphone: false, spokenReplies: false, audioOptIn: false, inputProvider: 'offline', speechProvider: 'device' };
// New consent contract: never carry a broad old cloud opt-in into new providers.
const key = (owner: string) => `carekosh-voice-settings-v2:${owner}`;
/** Migrate disabled voice choices locally, without enabling any online service. */
export function permittedSpeechProvider(provider: SpeechProvider, sarvamOptIn = false): SpeechProvider {
  if (provider === 'device') return 'device';
  if (provider === 'pocket') return ALBA_SELECTION_ENABLED ? 'pocket' : 'device';
  if (provider === 'kokoro_offline') return KOKORO_SELECTION_ENABLED ? 'kokoro_offline' : 'device';
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
      speechProvider: ['device', 'pocket', 'kokoro', 'kokoro_offline', 'sarvam'].includes(value.speechProvider) ? value.speechProvider : 'device',
      ...(value.sarvamSpeechOptIn === true ? { sarvamSpeechOptIn: true } : {}),
      ...(value.sarvamKeySource === 'personal' ? { sarvamKeySource: 'personal' as const } : {}),
      ...(typeof value.speechPace === 'number' && [0.9, 1, 1.1].includes(value.speechPace) ? { speechPace: value.speechPace } : {}),
      ...((ALBA_VOICES as readonly string[]).includes(value.albaVoice) ? { albaVoice: value.albaVoice as AlbaVoice } : {}),
      ...((KOKORO_VOICES as readonly string[]).includes(value.kokoroVoice) ? { kokoroVoice: value.kokoroVoice as KokoroVoice } : {}),
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
