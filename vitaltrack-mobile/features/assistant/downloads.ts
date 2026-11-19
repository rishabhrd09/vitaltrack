/** Pack operations belong to the app, so closing a screen cannot hide a download or race a removal. */
export type DownloadKind = 'speech' | 'alba' | 'kokoro' | 'whistle';
export type VoiceDownload = { id: number; kind: DownloadKind; percent: number; removing: boolean };
let nextId = 0;
let current: VoiceDownload | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
export const downloadSnapshot = () => current;
export function subscribeDownloads(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export async function downloadPack<T>(kind: DownloadKind, operation: () => Promise<T>,
  progress: (listener: (event: { downloaded: number; total: number }) => void) => { remove(): void } | undefined): Promise<T> {
  return runPackOperation(kind, operation, progress, false);
}
export async function removePack<T>(kind: DownloadKind, operation: () => Promise<T>): Promise<T> {
  return runPackOperation(kind, operation, () => undefined, true);
}
async function runPackOperation<T>(kind: DownloadKind, operation: () => Promise<T>,
  progress: (listener: (event: { downloaded: number; total: number }) => void) => { remove(): void } | undefined, removing: boolean): Promise<T> {
  if (current) throw new Error('A voice pack operation is already running. Wait for it to finish or cancel its download.');
  const id = ++nextId;
  current = { id, kind, percent: 0, removing }; emit();
  let subscription: { remove(): void } | undefined;
  try {
    subscription = progress(event => {
      if (current?.id !== id || !Number.isFinite(event.downloaded) || !Number.isFinite(event.total) || event.total <= 0) return;
      current = { id, kind, percent: Math.max(0, Math.min(100, Math.round(100 * event.downloaded / event.total))), removing }; emit();
    });
    return await operation();
  } finally {
    subscription?.remove();
    if (current?.id === id) { current = null; emit(); }
  }
}
