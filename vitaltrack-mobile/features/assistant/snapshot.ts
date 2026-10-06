import { queryClient } from '@/providers/QueryProvider';
import { itemService } from '@/services/items';
import { assertSession, ownsSnapshot, type Session } from '@/services/assistantSession';
import type { Item } from '@/types';
import { onlineManager } from '@tanstack/react-query';

function withDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); };
    const fail = (error: unknown) => { cleanup(); reject(error); };
    const cancel = () => fail(new Error('Question cancelled.'));
    const timer = setTimeout(() => fail(new Error('Inventory refresh timed out. Please try again.')), 22_000);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    work.then(value => { cleanup(); resolve(value); }, fail);
  });
}

export async function inventorySnapshot(session: Session, signal: AbortSignal, force = false) {
  const assertReady = () => {
    assertSession(session);
    if (signal.aborted) throw new Error('Question cancelled.');
    if (queryClient.isMutating()) throw new Error('Stock changes are still saving. Please ask again when saving finishes.');
  };
  assertReady();
  const state = queryClient.getQueryState<Item[]>(['items']);
  const owned = state?.data && ownsSnapshot(state.data, session);
  if (!onlineManager.isOnline()) {
    if (!force && owned && !state.isInvalidated) return { items: state.data!, timestamp: state.dataUpdatedAt, stale: true };
    if (force && owned && !state.isInvalidated) throw new Error('Offline: a new refresh needs internet. Ask again without Refresh to see last-known stock.');
    throw new Error('Offline: sync inventory in this signed-in session before asking about stock. Unverified or changed data cannot be used.');
  }
  if (!force && owned && !state.isInvalidated && Date.now() - state.dataUpdatedAt < 30_000) {
    return { items: state.data!, timestamp: state.dataUpdatedAt, stale: false };
  }
  try {
    // Exact existing query key: concurrent consumers share one fetch, no global clear.
    const items = await withDeadline(queryClient.fetchQuery({
      queryKey: ['items'], staleTime: 0, retry: false, networkMode: 'always', structuralSharing: false,
      queryFn: async ({ signal: querySignal }) => {
        const controller = new AbortController();
        const cancel = () => controller.abort();
        querySignal.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(cancel, 20_000);
        try { return (await itemService.getAll({ limit: 999 }, controller.signal)).items; }
        finally { clearTimeout(timer); querySignal.removeEventListener('abort', cancel); }
      },
    }), signal);
    assertReady();
    if (!ownsSnapshot(items, session)) throw new Error('Inventory ownership could not be verified.');
    return { items, timestamp: queryClient.getQueryState(['items'])!.dataUpdatedAt, stale: false };
  } catch (error) {
    assertReady();
    // Never fall back to invalidated data after a write or an unowned restored cache.
    if (owned && !state.isInvalidated && !queryClient.getQueryState(['items'])?.isInvalidated) return { items: state.data!, timestamp: state.dataUpdatedAt, stale: true };
    throw error;
  }
}
