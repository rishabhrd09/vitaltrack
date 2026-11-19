import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiClientError } from '@/services/api';
import { assertSession, type Session } from '@/services/assistantSession';
import type { SavedOrder } from '@/types';
import { reviewId } from './contracts';
type Pointer = { local_id: string; created_at: string };
const key = (owner: string) => `carekosh-pending-order-v1:${owner}`;
const lanes = new Map<string, Promise<unknown>>();
function serialize<T>(session: Session, work: () => Promise<T>): Promise<T> {
  const pending = (lanes.get(session.owner) || Promise.resolve()).catch(() => {}).then(async () => { assertSession(session); return work(); });
  lanes.set(session.owner, pending);
  void pending.finally(() => { if (lanes.get(session.owner) === pending) lanes.delete(session.owner); }).catch(() => {});
  return pending;
}
/** A recovery pointer only: no order body, stock, approval or automatic write replay. */
export function pendingSubmission(session: Session): Promise<Pointer | null> {
  return serialize(session, async () => {
    const raw = await AsyncStorage.getItem(key(session.owner)); assertSession(session);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      const id = reviewId(value.local_id);
      if (typeof value.created_at !== 'string' || !Number.isFinite(Date.parse(value.created_at))) throw new Error();
      return { local_id: id, created_at: value.created_at };
    } catch { throw new Error('The pending order reference could not be read. Check Recent Orders before creating another order.'); }
  });
}
export function rememberSubmission(session: Session, id: string): Promise<void> {
  reviewId(id);
  return serialize(session, async () => {
    const raw = await AsyncStorage.getItem(key(session.owner)); assertSession(session);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored.local_id !== id) throw new Error('Another order submission needs reconciliation first.');
    }
    await AsyncStorage.setItem(key(session.owner), JSON.stringify({ local_id: id, created_at: new Date().toISOString() }));
    assertSession(session);
  });
}
export function forgetSubmission(session: Session, id: string): Promise<void> {
  return serialize(session, async () => {
    const raw = await AsyncStorage.getItem(key(session.owner)); assertSession(session);
    if (raw && JSON.parse(raw).local_id === id) await AsyncStorage.removeItem(key(session.owner));
  });
}
export async function findSubmission(session: Session, id: string, signal: AbortSignal): Promise<SavedOrder | null> {
  try {
    return await api.assistantRequest<SavedOrder>('/orders/submission/' + reviewId(id), { method: 'GET', signal }, () => assertSession(session));
  } catch (error) {
    assertSession(session);
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}
/** Explicit touch action: the server fences the ID against delayed old saves. */
export async function resolveSubmission(session: Session, id: string, signal: AbortSignal): Promise<{ state: 'saved'; order: SavedOrder } | { state: 'closed'; order: null }> {
  const value = await api.assistantRequest<unknown>('/orders/submission/' + reviewId(id) + '/resolve', { method: 'POST', signal }, () => assertSession(session));
  assertSession(session);
  if (!value || typeof value !== 'object') throw new Error('The order resolution could not be verified. Keep the original reference and check again.');
  const result = value as { state?: unknown; order?: unknown };
  if (result.state === 'closed' && result.order === null) return { state: 'closed', order: null };
  if (result.state === 'saved' && result.order && typeof result.order === 'object') {
    const order = result.order as SavedOrder;
    if (typeof order.id === 'string' && order.id && typeof order.orderId === 'string' && order.orderId && Array.isArray(order.items)) return { state: 'saved', order };
  }
  throw new Error('The order resolution could not be verified. Keep the original reference and check again.');
}
