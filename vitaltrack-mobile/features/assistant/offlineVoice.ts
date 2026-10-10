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
  verifying: 'Checking Alba voice pack…', loading: 'Loading Alba on this phone…',
  generating: 'Preparing Alba speech…', cpu_retry: 'Retrying Alba with the CPU…',
  prompting: 'Preparing Alba speech…', prompting_cpu: 'Preparing Alba speech with the CPU…',
  decoding: 'Converting Alba speech to audio…', decoding_cpu: 'Converting Alba speech to audio with the CPU…',
  loading_cpu: 'Loading Alba with the CPU…', generating_cpu: 'Preparing Alba speech with the CPU…',
  playing: 'Playing Alba · check media volume and audio output',
} as const;

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
  async speak(text: string, pace = 1, progress?: (message: string) => void) {
    const voice = pocketEngine();
    if (!voice.speakPocketWithProgress) return voice.speakPocket!(text, pace);
    const id = `speech-${Date.now()}-${++nextSpeech}`;
    const sub = voice.addListener<{ id: string; stage: string; frames?: number }>('pocketSpeechProgress', event => {
      if (event.id !== id || !Object.prototype.hasOwnProperty.call(pocketSpeechStages, event.stage)) return;
      const frames = event.frames;
      const detail = (event.stage === 'generating' || event.stage === 'generating_cpu') &&
        typeof frames === 'number' && Number.isInteger(frames) && frames >= 0 && frames <= 256
        ? ` · ${(frames / 12.5).toFixed(1)}s generated` : '';
      progress?.(pocketSpeechStages[event.stage as keyof typeof pocketSpeechStages] + detail);
    });
    try { return await voice.speakPocketWithProgress(text, pace, id); }
    finally { sub.remove(); }
  },
  checkOutput: () => {
    if (!native?.checkPocketAudioOutput) throw new Error('Audio output check needs the latest Android APK.');
    return native.checkPocketAudioOutput();
  },
  diagnostics: async () => native?.pocketAudioDiagnostic ? await native.pocketAudioDiagnostic() : '',
  licences: () => pocketEngine().pocketLicenceArchive!(),
  progress: (listener: (event: { downloaded: number; total: number }) => void) => pocketVoiceSupported ? native?.addListener('pocketDownloadProgress', listener) : undefined,
};
