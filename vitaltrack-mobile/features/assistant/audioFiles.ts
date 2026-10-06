import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const key = 'carekosh-temporary-voice-files-v1';
let queue: Promise<void> = Promise.resolve();
const local = (uri: string) => !!FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory) &&
  !uri.includes('..') && /\.(wav|m4a)$/.test(uri);

function serialize(operation: () => Promise<void>) {
  queue = queue.catch(() => {}).then(operation);
  return queue;
}
async function paths(): Promise<string[]> {
  try {
    const data = JSON.parse(await AsyncStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data.filter((p): p is string => typeof p === 'string' && local(p)) : [];
  } catch { return []; }
}
/** Register before recording/playback so crash leftovers are removed on next launch. */
export function rememberAudio(uri: string) {
  if (!local(uri)) return Promise.reject(new Error('Audio must use temporary app storage.'));
  return serialize(async () => { await AsyncStorage.setItem(key, JSON.stringify([...new Set([...(await paths()), uri])])); });
}
export function discardAudio(uri: string | null) {
  if (!uri || !local(uri)) return Promise.resolve();
  return serialize(async () => {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await AsyncStorage.setItem(key, JSON.stringify((await paths()).filter(p => p !== uri)));
  });
}
export function cleanupAudioArtifacts() {
  return serialize(async () => {
    const retained: string[] = [];
    for (const uri of await paths()) {
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { retained.push(uri); }
    }
    await AsyncStorage.setItem(key, JSON.stringify(retained));
  });
}
