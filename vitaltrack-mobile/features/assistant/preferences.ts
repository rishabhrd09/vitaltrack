import AsyncStorage from '@react-native-async-storage/async-storage';
import { CLOUD_VOICE_ENABLED } from './policy';

export type InputProvider = 'offline' | 'groq' | 'sarvam';
export type SpeechProvider = 'device' | 'kokoro' | 'sarvam';
export type Preferences = { enabled: boolean; cloud: boolean; microphone: boolean; spokenReplies: boolean; inputProvider: InputProvider; speechProvider: SpeechProvider };
export const defaults: Preferences = { enabled: false, cloud: false, microphone: false, spokenReplies: false, inputProvider: 'offline', speechProvider: 'device' };
// New consent contract: never carry a broad old cloud opt-in into new providers.
const key = (owner: string) => `carekosh-voice-settings-v2:${owner}`;
export async function loadPreferences(owner: string): Promise<Preferences> {
  try {
    const value = JSON.parse(await AsyncStorage.getItem(key(owner)) || '{}');
    const stored: Preferences = { enabled: value.enabled === true, cloud: value.cloud === true, microphone: value.microphone === true, spokenReplies: value.spokenReplies === true,
      inputProvider: ['offline', 'groq', 'sarvam'].includes(value.inputProvider) ? value.inputProvider : 'offline',
      speechProvider: ['device', 'kokoro', 'sarvam'].includes(value.speechProvider) ? value.speechProvider : 'device' };
    // Cloud voice is off in this release: settings saved by an earlier build
    // must not route anything to a cloud provider.
    return CLOUD_VOICE_ENABLED ? stored : { ...stored, cloud: false, inputProvider: 'offline', speechProvider: 'device' };
  } catch { return { ...defaults }; }
}
export async function savePreferences(owner: string, preferences: Preferences) {
  await AsyncStorage.setItem(key(owner), JSON.stringify(preferences));
}
