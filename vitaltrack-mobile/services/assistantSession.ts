import { useAuthStore } from '@/store/useAuthStore';
import type { Item } from '@/types';

let epoch = 0;
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.isAuthenticated !== previous.isAuthenticated) epoch++;
});
export type Session = { owner: string; epoch: number };
export function captureSession(): Session {
  const state = useAuthStore.getState();
  if (!state.isAuthenticated || !state.user?.id || state.isLoggingOut) throw new Error('Please sign in again.');
  return { owner: state.user.id, epoch };
}
export function assertSession(session: Session) {
  const current = captureSession();
  if (current.owner !== session.owner || current.epoch !== session.epoch) throw new Error('Session changed. Ask again.');
}
// Deliberately not persisted. Restored/optimistically modified arrays must be refreshed
// before the assistant can certify ownership/completeness. Server remains authoritative.
const ownedSnapshots = new WeakMap<Item[], Session>();
export function stampSnapshot(items: Item[], session: Session) { assertSession(session); ownedSnapshots.set(items, session); }
export function ownsSnapshot(items: Item[], session: Session) {
  const stamp = ownedSnapshots.get(items);
  return stamp?.owner === session.owner && stamp?.epoch === session.epoch;
}
