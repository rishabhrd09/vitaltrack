import { createAudioPlayer, setAudioModeAsync, type AudioStatus } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { assertSession, type Session } from '@/services/assistantSession';
import { speak, type SarvamKeySource } from '@/services/assistant';
import { rememberAudio, discardAudio } from './audioFiles';

let sequence = 0;

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Speech cancelled.'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Speech cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function encodeClip(blob: Blob, signal: AbortSignal): Promise<string> {
  if (!blob.size || blob.size > 4_000_000) return Promise.reject(new Error('Sarvam returned an empty or oversized audio clip.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { reader.abort(); cleanup(); reject(new Error('Speech cancelled.')); };
    reader.onload = () => { cleanup(); const encoded = String(reader.result).split(',')[1]; if (encoded) resolve(encoded); else reject(new Error('Speech audio could not be decoded.')); };
    reader.onerror = () => { cleanup(); reject(new Error('Speech audio could not be read.')); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    reader.readAsDataURL(blob);
  });
}

/** One player per reply prevents late completion events from affecting the next question. */
export async function playSpeechClip(uri: string, signal: AbortSignal, assertCurrent: () => void, onStatus: (text: string) => void, onPlaybackStarted?: () => void) {
  assertCurrent();
  if (signal.aborted) throw new Error('Speech cancelled.');
  const player = createAudioPlayer(null, { updateInterval: 100 });
  try {
    player.volume = 1; player.muted = false; player.loop = false;
    await new Promise<void>((resolve, reject) => {
      let started = false;
      let heard = false;
      let finished = false;
      let subscription: { remove(): void } | undefined;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true; clearTimeout(startTimer); clearTimeout(endTimer);
        signal.removeEventListener('abort', abort); subscription?.remove();
        if (error) reject(error); else resolve();
      };
      const abort = () => finish(new Error('Speech cancelled.'));
      const startTimer = setTimeout(() => finish(new Error('Audio playback did not start. Check media volume and your audio output.')), 15_000);
      const endTimer = setTimeout(() => finish(new Error('Audio playback did not finish. Please retry or select device voice.')), 95_000);
      subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        try {
          assertCurrent();
          if (signal.aborted) { abort(); return; }
          // Android may report progress with an error/paused state before a sampled `playing`
          // event. Once any frames advanced, an offline fallback must not repeat the answer.
          if (!heard && (status.playing || started && status.currentTime > 0)) {
            heard = true; onPlaybackStarted?.();
          }
          if (status.playbackState === 'error' || status.playbackState === 'failed') throw new Error('Android could not play this speech audio.');
          if (started && status.didJustFinish) { finish(); return; }
          if (!started && status.isLoaded && status.duration > 0) { started = true; player.play(); }
          if (status.playing) { clearTimeout(startTimer); onStatus('Reading aloud with Sarvam…'); }
        } catch (error) { finish(error instanceof Error ? error : new Error('Speech playback failed.')); }
      });
      if (finished) { subscription.remove(); return; }
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      try { assertCurrent(); player.replace({ uri }); } catch (error) { finish(error instanceof Error ? error : new Error('Audio could not be loaded.')); }
    });
  } finally {
    try { player.pause(); } catch { /* Already released by the platform. */ }
    try { player.remove(); } catch { /* Cleanup must not hide the playback result. */ }
  }
}

/** Answer text only. Key, model and English speaker are owned by the backend. */
export async function playSarvamSpeech(session: Session, text: string, pace: number, signal: AbortSignal, onStatus: (text: string) => void, credentialSource: SarvamKeySource = 'application', onPlaybackStarted?: () => void) {
  const request = new AbortController();
  const abort = () => request.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) request.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; request.abort(); }, 35_000);
  let uri: string | null = null;
  const assertCurrent = () => { if (signal.aborted || request.signal.aborted) throw new Error('Speech cancelled.'); assertSession(session); };
  try {
    assertCurrent(); onStatus('Preparing Sarvam English voice…');
    const blob = await abortable(speak(session, text, request.signal, 'sarvam', pace, credentialSource), request.signal);
    assertCurrent();
    const encoded = await encodeClip(blob, request.signal);
    assertCurrent();
    if (!FileSystem.cacheDirectory) throw new Error('Temporary audio storage is unavailable.');
    uri = `${FileSystem.cacheDirectory}carekosh-sarvam-${Date.now()}-${++sequence}.wav`;
    await rememberAudio(uri);
    assertCurrent();
    await FileSystem.writeAsStringAsync(uri, encoded, { encoding: FileSystem.EncodingType.Base64 });
    assertCurrent();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix', shouldRouteThroughEarpiece: false });
    assertCurrent(); clearTimeout(timer);
    onStatus('Loading speech audio…');
    await playSpeechClip(uri, request.signal, assertCurrent, onStatus, onPlaybackStarted);
    assertCurrent();
  } catch (error) {
    if (timedOut) throw new Error('Sarvam speech timed out. Retry or select device voice.');
    throw error;
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', abort);
    await discardAudio(uri).catch(() => {});
  }
}
