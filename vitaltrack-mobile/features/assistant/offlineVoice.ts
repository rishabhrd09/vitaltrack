import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type ModelStatus = { ready: boolean; bytes: number; model?: string };
type DeviceVoice = { ready: boolean; name: string };
export type PocketVoiceStatus = { ready: boolean; supported: boolean; bytes: number; name: string };
export type PocketAudioReport = { output: string; volumePercent: number; audioSeconds: number; frames: number };
type NativeVoice = {
  modelStatus(): Promise<ModelStatus>;
  downloadModel(): Promise<ModelStatus>;
  removeModel(): Promise<void>;
  transcribe(uri: string): Promise<{ transcript: string }>;
  deviceVoiceStatus(): Promise<DeviceVoice>;
  speakOffline(text: string): Promise<void>;
  pocketVoiceStatus?(): Promise<PocketVoiceStatus>;
  downloadPocketVoice?(): Promise<PocketVoiceStatus>;
  removePocketVoice?(): Promise<void>;
  speakPocket?(text: string, pace: number): Promise<PocketAudioReport | void>;
  speakPocketWithProgress?(text: string, pace: number, id: string): Promise<PocketAudioReport | void>;
  speakPocketDiagnostic?(text: string, pace: number, id: string, play: boolean, placement: string): Promise<PocketAudioReport>;
  checkPocketAudioOutput?(): Promise<PocketAudioReport>;
  pocketAudioDiagnostic?(): Promise<string>;
  pocketLicenceArchive?(): Promise<string>;
  cancel(): void;
  prepareCapture?(id: string, preview: boolean): Promise<{ uri: string }>;
  startCapture?(id: string): Promise<boolean>;
  finishCapture?(id: string): Promise<{ uri: string }>;
  addListener<Event>(name: string, listener: (event: Event) => void): { remove(): void };
};
const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeVoice>('CareKoshVoice') : null;
export const offlineSupported = !!native;
export const liveCaptureSupported = !!native?.prepareCapture && !!native?.startCapture && !!native?.finishCapture;
export const pocketVoiceSupported = !!native?.pocketVoiceStatus && !!native?.downloadPocketVoice && !!native?.removePocketVoice && !!native?.speakPocket;
export const pocketOutputCheckSupported = !!native?.checkPocketAudioOutput;
export type LiveWords = { id: string; transcript?: string; finished?: boolean; error?: string; previewError?: boolean };
let nextTake = 0;
let nextSpeech = 0;
export const pocketSpeechStages = {
  verifying: 'Checking Alba voice pack…', loading: 'Loading Alba on this phone (the first reply takes longer)…',
  generating: 'Preparing Alba speech…', prompting: 'Preparing Alba speech…',
  decoding: 'Converting Alba speech to audio…',
  playing: 'Playing Alba · check media volume and audio output',
} as const;
/** Native work is bounded at 180 s; this backstop also settles the call if the native side never answers. */
export const POCKET_BACKSTOP_MS = 195_000;
export type PocketPlacementName = 'default' | 'lm_gpu' | 'vocoder_fp32';

/**
 * Settles a native call even if it never answers. An aborted turn stops waiting at once and leaves
 * native work alone (the turn's own cancel already stopped it), so a late backstop can never cancel
 * a later question's recording; only an expired, still-current call cancels native work.
 */
export function withBackstop<T>(operation: Promise<T>, ms = POCKET_BACKSTOP_MS, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const backstop = new Promise<never>((_, reject) => {
    if (signal?.aborted) { reject(new Error('Speech cancelled.')); return; }
    onAbort = () => reject(new Error('Speech cancelled.'));
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { native?.cancel(); reject(new Error('Alba did not respond in time. Your answer is still on screen.')); }, ms);
  });
  return Promise.race([operation, backstop]).finally(() => {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  });
}

/** Adapter preserves MicrophoneCapture's single-owner and cleanup contract. */
export function createLiveRecorder() {
  let id = '';
  let uri: string | null = null;
  let recording = false;
  let preview = false;
  return {
    get uri() { return uri; }, get isRecording() { return recording; },
    configure(live: boolean) { preview = live; },
    subscribe(listener: (event: LiveWords) => void) {
      return engine().addListener<LiveWords>('liveTranscript', event => {
        if (event.id !== id) return;
        // Keep isRecording true until finish() so cleanup always closes native capture.
        listener(event);
      });
    },
    async prepareToRecordAsync() {
      id = `take-${Date.now()}-${++nextTake}`;
      uri = (await engine().prepareCapture!(id, preview)).uri;
    },
    async record(_options: { forDuration: number }) {
      recording = await engine().startCapture!(id);
    },
    async stop() {
      try { uri = (await engine().finishCapture!(id)).uri; }
      finally { recording = false; id = ''; }
    },
  };
}
function engine(): NativeVoice {
  if (!native) throw new Error('Offline voice needs the new Android APK; it is not available in Expo Go, web or iOS. You can still type.');
  return native;
}
export const offlineVoice = {
  status: () => engine().modelStatus(),
  download: () => engine().downloadModel(),
  remove: () => engine().removeModel(),
  transcribe: (uri: string) => engine().transcribe(uri),
  deviceStatus: () => engine().deviceVoiceStatus(),
  speak: (text: string) => engine().speakOffline(text),
  cancel: () => native?.cancel(),
  progress: (listener: (event: { downloaded: number; total: number }) => void) => native?.addListener('modelDownloadProgress', listener),
};

function pocketEngine() {
  if (!pocketVoiceSupported) throw new Error('Alba needs the new Android APK. Update the app to download this voice.');
  return engine();
}
export const pocketVoice = {
  status: () => pocketEngine().pocketVoiceStatus!(),
  download: () => pocketEngine().downloadPocketVoice!(),
  remove: () => pocketEngine().removePocketVoice!(),
  async speak(text: string, pace = 1, progress?: (message: string) => void, signal?: AbortSignal) {
    const voice = pocketEngine();
    if (!voice.speakPocketWithProgress) return withBackstop(voice.speakPocket!(text, pace), POCKET_BACKSTOP_MS, signal);
    const id = `speech-${Date.now()}-${++nextSpeech}`;
    const sub = voice.addListener<{ id: string; stage: string; frames?: number }>('pocketSpeechProgress', event => {
      if (event.id !== id || !Object.prototype.hasOwnProperty.call(pocketSpeechStages, event.stage)) return;
      const frames = event.frames;
      const detail = event.stage === 'generating' &&
        typeof frames === 'number' && Number.isInteger(frames) && frames >= 0 && frames <= 256
        ? ` · ${(frames / 12.5).toFixed(1)}s generated` : '';
      progress?.(pocketSpeechStages[event.stage as keyof typeof pocketSpeechStages] + detail);
    });
    try { return await withBackstop(voice.speakPocketWithProgress(text, pace, id), POCKET_BACKSTOP_MS, signal); }
    finally { sub.remove(); }
  },
  /** Diagnostics builds only: synthesis-only or playback runs with a named placement experiment. */
  speakDiagnostic(text: string, play: boolean, placement: PocketPlacementName, signal?: AbortSignal, pace = 1) {
    const voice = pocketEngine();
    if (!voice.speakPocketDiagnostic) throw new Error('Alba diagnostics need the latest test APK.');
    return withBackstop(voice.speakPocketDiagnostic(text, pace, `diagnostic-${Date.now()}-${++nextSpeech}`, play, placement), POCKET_BACKSTOP_MS, signal);
  },
  checkOutput: (signal?: AbortSignal) => {
    if (!native?.checkPocketAudioOutput) throw new Error('Audio output check needs the latest Android APK.');
    return withBackstop(native.checkPocketAudioOutput(), 20_000, signal);
  },
  diagnostics: async () => native?.pocketAudioDiagnostic ? await native.pocketAudioDiagnostic() : '',
  licences: () => pocketEngine().pocketLicenceArchive!(),
  progress: (listener: (event: { downloaded: number; total: number }) => void) => pocketVoiceSupported ? native?.addListener('pocketDownloadProgress', listener) : undefined,
};
