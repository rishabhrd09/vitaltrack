/**
 * Online narration with an explicitly chosen offline fallback.
 *
 * - Fallback is off unless the user chose a voice after a successful preview.
 * - It never retries or re-sends the online request, never changes consent or the Sarvam key
 *   source (no shared-key fallback), and never downloads anything.
 * - The same short answer is read at most once: no fallback after any online audio was heard,
 *   after Stop/another question/session change, or once the turn is no longer current.
 * - A provider request that was already sent may still be charged; cancelling does not reverse it.
 */
export type OfflineFallbackVoice = 'device' | 'pocket';
export type NarrationOutcome = { voice: 'online' | OfflineFallbackVoice; onlineError?: string };

export const fallbackVoiceLabel = (voice: OfflineFallbackVoice) => voice === 'pocket' ? 'Alba (offline)' : 'Device voice (offline)';

function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  return 'Online speech was unavailable.';
}
const cancelled = (error: unknown) => /^Speech cancelled\.?$/.test(messageOf(error));

export async function narrateWithFallback(options: {
  /** Performs the online attempt; calls `onPlaybackStarted` once online audio actually starts. */
  speakOnline: (onPlaybackStarted: () => void) => Promise<void>;
  speakOffline: (voice: OfflineFallbackVoice) => Promise<void>;
  fallback: OfflineFallbackVoice | null | undefined;
  fallbackReady: (voice: OfflineFallbackVoice) => boolean;
  /** Turn, abort signal and account session are all still current. */
  stillCurrent: () => boolean;
  onFallback?: (voice: OfflineFallbackVoice, onlineError: string) => void;
}): Promise<NarrationOutcome> {
  let heard = false;
  try {
    await options.speakOnline(() => { heard = true; });
    return { voice: 'online' };
  } catch (error) {
    if (!options.stillCurrent() || cancelled(error) || !options.fallback || heard) throw error;
    const reason = messageOf(error);
    if (!options.fallbackReady(options.fallback)) {
      throw new Error(`${reason} The chosen offline fallback (${fallbackVoiceLabel(options.fallback)}) is not ready on this phone, so nothing was read aloud.`);
    }
    options.onFallback?.(options.fallback, reason);
    if (!options.stillCurrent()) throw error;
    await options.speakOffline(options.fallback);
    return { voice: options.fallback, onlineError: reason };
  }
}
