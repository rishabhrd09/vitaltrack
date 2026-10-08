import { useSyncExternalStore } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { assertSession, captureSession, type Session } from '@/services/assistantSession';
import { isLowStock, isOutOfStock, type Item, type SavedOrder } from '@/types';
import type { CreateOrderRequest } from '@/services/orders';
import { generateId } from '@/utils/helpers';
import { Clarification, resolveItem } from './queries';
import { validateSpecification, type Specification } from './contracts';

export type CartItem = { item: Item; quantity: number; source: 'spoken' | 'suggested' | 'manual' };
export type LocalDraft = { session: Session; rows: CartItem[]; revision: number; initialized: boolean; origin: 'manual' | 'voice';
  attempt?: { request: CreateOrderRequest; saved?: SavedOrder }; };
let draft: LocalDraft | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.isAuthenticated !== previous.isAuthenticated || state.isLoggingOut && !previous.isLoggingOut) { draft = null; emit(); }
});
export function getDraft(session: Session): LocalDraft | null {
  assertSession(session);
  if (draft && (draft.session.owner !== session.owner || draft.session.epoch !== session.epoch)) { draft = null; emit(); }
  return draft;
}
export function useOrderDraft() {
  return useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, () => draft, () => null);
}
export function writeDraft(session: Session, rows: CartItem[], initialized = true, origin: 'manual' | 'voice' = 'manual') {
  const current = getDraft(session);
  if (current?.attempt) throw new Error('This submission may already be saved. Retry the same submission or review Recent Orders before starting another.');
  draft = { session: { ...session }, rows: rows.map(r => ({ ...r, item: { ...r.item } })), revision: (current?.revision || 0) + 1, initialized, origin };
  emit(); return draft;
}
export function changeDraft(update: (rows: CartItem[]) => CartItem[]) {
  const session = captureSession(); const current = getDraft(session);
  writeDraft(session, update(current?.rows || []));
}
export function suggestedQuantity(item: Item): number | null {
  return Number.isFinite(item.minimumStock) && item.minimumStock > 0 && Number.isFinite(item.quantity)
    ? Math.max(Math.ceil(item.minimumStock - item.quantity), 1) : null;
}
const unitKey = (value: string) => value.trim().toLowerCase().replace(/s$/, '').replace(/^boxe$/, 'box');
export function prepareDraft(s: Specification, items: Item[], existing: CartItem[], selected: Record<string,string> = {}): CartItem[] {
  validateSpecification(s);
  if (s.intent !== 'draft_order') throw new Error('Only a local draft specification is allowed.');
  const active = items.filter(i => i.isActive);
  const rows = new Map(existing.map(r => [r.item.id, { ...r, item: { ...r.item } }]));
  const quantities = new Map<string, number>();
  const operations = new Map<string, string>();
  const removed = new Set<string>();
  for (const line of s.lines) {
    const item = resolveItem(line.item_query, active, selected[line.item_query]);
    if (Array.isArray(item)) throw new Clarification(`Choose the item meant by “${line.item_query}”. No draft changes were made.`, line.item_query, item);
    const prior = operations.get(item.id);
    if (prior && (prior !== line.operation || line.operation === 'add')) throw new Clarification(`Conflicting draft operations for ${item.name}. Say one final quantity.`);
    operations.set(item.id, line.operation);
    if (line.operation === 'remove') { rows.delete(item.id); removed.add(item.id); continue; }
    if (line.quantity === null) throw new Clarification(`Say the order quantity for ${item.name}, in ${item.unit}.`);
    if (line.unit && unitKey(line.unit) !== unitKey(item.unit)) throw new Clarification(`${item.name} is recorded in ${item.unit}. You said ${line.unit}; no conversion was made. Please specify the quantity in ${item.unit}.`);
    if (quantities.has(item.id)) {
      if (quantities.get(item.id) !== line.quantity || line.operation === 'add') throw new Clarification(`Conflicting or repeated quantities for ${item.name}. Say one final quantity.`);
      continue;
    }
    quantities.set(item.id, line.quantity);
    const quantity = line.operation === 'add' ? (rows.get(item.id)?.quantity || 0) + line.quantity : line.quantity;
    if (!Number.isInteger(quantity) || quantity > 999_999) throw new Clarification('Use an order quantity between 1 and 999,999.');
    rows.set(item.id, { item, quantity, source: 'spoken' });
  }
  for (const item of active.filter(i => s.include_low && isLowStock(i) || s.include_out && isOutOfStock(i))) {
    if (rows.has(item.id) || removed.has(item.id)) continue; // explicit quantities and existing reviewed lines win
    const quantity = suggestedQuantity(item);
    if (quantity === null) throw new Clarification(`No meaningful minimum stock is recorded for ${item.name}. Say its order quantity explicitly.`);
    rows.set(item.id, { item, quantity, source: 'suggested' });
  }
  if (rows.size > 1000) throw new Clarification('An order supports at most 1,000 lines. Narrow this draft.');
  return [...rows.values()];
}
export function mergeDrafts(original: CartItem[], proposed: CartItem[]): CartItem[] {
  const rows = new Map(original.map(r => [r.item.id, r]));
  for (const row of proposed) {
    const old = rows.get(row.item.id);
    if (old && old.quantity !== row.quantity) throw new Clarification(`Different quantities for ${row.item.name}. Review the existing draft or explicitly replace it; quantities were not combined.`);
    rows.set(row.item.id, row);
  }
  return [...rows.values()];
}
export function recheckDraft(rows: CartItem[], items: Item[]): { rows: CartItem[]; changes: string[] } {
  const changes: string[] = [];
  const checked = rows.map(row => {
    const item = items.find(i => i.id === row.item.id && i.isActive);
    if (!item) throw new Error(`${row.item.name} is no longer available. Remove it or choose an active item.`);
    if (!Number.isInteger(item.quantity) || item.quantity < 0 || !Number.isInteger(item.minimumStock) || item.minimumStock < 0) throw new Error(`${item.name} has stock values that cannot be used in a new order. Review inventory first.`);
    if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 999_999) throw new Error(`Enter a valid quantity for ${item.name}.`);
    if (item.unit !== row.item.unit) throw new Error(`${item.name}'s recorded unit changed. Remove and re-add this line before confirming.`);
    if (item.version !== row.item.version || item.quantity !== row.item.quantity || item.name !== row.item.name || item.minimumStock !== row.item.minimumStock) changes.push(`${item.name}: now ${item.quantity} ${item.unit}; order quantity remains ${row.quantity}.`);
    return { ...row, item: { ...item } };
  });
  if (!checked.length || checked.length > 1000) throw new Error('An order needs 1–1,000 items.');
  return { rows: checked, changes };
}
/** Invoked only from the review screen's touch handler, never the assistant. */
export function beginSubmission(session: Session, rows: CartItem[]): CreateOrderRequest {
  const current = getDraft(session);
  if (!current) throw new Error('The draft is no longer available.');
  if (current.attempt) return current.attempt.request;
  const request: CreateOrderRequest = { localId: generateId(), items: rows.map(({item,quantity}) => ({ itemId: item.id, name: item.name, quantity, expectedVersion: item.version, unit: item.unit, currentStock: item.quantity, minimumStock: item.minimumStock, brand: item.brand, supplierName: item.supplierName, imageUri: item.imageUri, purchaseLink: item.purchaseLink })) };
  draft = { ...current, attempt: { request } }; emit(); return request;
}
export function markSaved(session: Session, order: SavedOrder) {
  const current = getDraft(session);
  if (!current?.attempt) throw new Error('Submission context changed.');
  draft = { ...current, attempt: { ...current.attempt, saved: order } }; emit();
}
export function clearSavedDraft(session: Session) {
  if (getDraft(session)?.attempt?.saved) { draft = null; emit(); }
}

export function releaseRejectedSubmission(session: Session) {
  const current = getDraft(session);
  if (current?.attempt && !current.attempt.saved) { draft = { ...current, attempt: undefined }; emit(); }
}
