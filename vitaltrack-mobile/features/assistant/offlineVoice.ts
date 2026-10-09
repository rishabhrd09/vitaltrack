import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type ModelStatus = { ready: boolean; bytes: number; model?: string };
type DeviceVoice = { ready: boolean; name: string };
type NativeVoice = {
  modelStatus(): Promise<ModelStatus>;
  downloadModel(): Promise<ModelStatus>;
  removeModel(): Promise<void>;
  transcribe(uri: string): Promise<{ transcript: string }>;
  deviceVoiceStatus(): Promise<DeviceVoice>;
  speakOffline(text: string): Promise<void>;
  cancel(): void;
  prepareCapture?(id: string, preview: boolean): Promise<{ uri: string }>;
  startCapture?(id: string): Promise<boolean>;
  finishCapture?(id: string): Promise<{ uri: string }>;
  addListener<Event>(name: string, listener: (event: Event) => void): { remove(): void };
};
const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeVoice>('CareKoshVoice') : null;
export const offlineSupported = !!native;
export const liveCaptureSupported = !!native?.prepareCapture && !!native?.startCapture && !!native?.finishCapture;
export type LiveWords = { id: string; transcript?: string; finished?: boolean; error?: string; previewError?: boolean };
let nextTake = 0;

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
