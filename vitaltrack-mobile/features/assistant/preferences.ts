import AsyncStorage from '@react-native-async-storage/async-storage';
import { CLOUD_TEXT_ENABLED, CLOUD_TRANSCRIPTION_ENABLED, CLOUD_VOICE_ENABLED } from './policy';

export type InputProvider = 'offline' | 'groq' | 'sarvam';
export type SpeechProvider = 'device' | 'kokoro' | 'sarvam';
export type Preferences = { enabled: boolean; cloud: boolean; microphone: boolean; spokenReplies: boolean; audioOptIn: boolean; inputProvider: InputProvider; speechProvider: SpeechProvider };
export const defaults: Preferences = { enabled: false, cloud: false, microphone: false, spokenReplies: false, audioOptIn: false, inputProvider: 'offline', speechProvider: 'device' };
// New consent contract: never carry a broad old cloud opt-in into new providers.
const key = (owner: string) => `carekosh-voice-settings-v2:${owner}`;
export async function loadPreferences(owner: string): Promise<Preferences> {
  try {
    const value = JSON.parse(await AsyncStorage.getItem(key(owner)) || '{}');
    const stored: Preferences = { enabled: value.enabled === true, cloud: value.cloud === true, microphone: value.microphone === true, spokenReplies: value.spokenReplies === true, audioOptIn: value.audioOptIn === true,
      inputProvider: ['offline', 'groq', 'sarvam'].includes(value.inputProvider) ? value.inputProvider : 'offline',
      speechProvider: ['device', 'kokoro', 'sarvam'].includes(value.speechProvider) ? value.speechProvider : 'device' };
    // Text opt-in never enables audio upload or cloud speech, including old settings.
    return { ...stored, cloud: !!(CLOUD_TEXT_ENABLED || CLOUD_VOICE_ENABLED) && stored.cloud,
      inputProvider: CLOUD_TRANSCRIPTION_ENABLED && stored.audioOptIn && stored.inputProvider === 'groq' ? 'groq' : 'offline',
      speechProvider: CLOUD_VOICE_ENABLED ? stored.speechProvider : 'device' };
  } catch { return { ...defaults }; }
}
export async function savePreferences(owner: string, preferences: Preferences) {
  await AsyncStorage.setItem(key(owner), JSON.stringify(preferences));
}
