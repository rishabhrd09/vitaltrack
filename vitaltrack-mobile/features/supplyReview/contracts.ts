/** Version-one server facts. These guards never calculate stock or approve a write. */
export type SupplyCapabilities = { enabled: boolean; contract_version: 1; ttl_seconds: number; max_items: number; has_history?: boolean };
export type SupplyLine = { item_id: string; item_version: number; name: string; unit: string; supplier_name: string | null;
  on_hand: number; minimum_stock: number; known_inbound: number; target_quantity: number; order_quantity: number; reasons: string[] };
export type SupplyQuestion = { item_id: string; name: string; unit: string; code: string; message: string };
export type SupplyProposal = { id: string; version: number; expires_at: string; lines: SupplyLine[] };
export type SupplyRun = { id: string; version: number; status: 'needs_input' | 'awaiting_review' | 'completed' | 'cancelled' | 'expired' | 'stale';
  created_at: string; expires_at: string; snapshot_at: string; supply_revision: number; proposal: SupplyProposal | null;
  questions: SupplyQuestion[]; excluded: { item_id: string; name: string; reason: string }[]; order_id: string | null };
export type SupplyRunSummary = Pick<SupplyRun, 'id' | 'version' | 'status' | 'created_at' | 'expires_at' | 'order_id'>;
export type SupplyAnswer = { item_id: string; target_quantity?: number; exclude?: boolean };
const invalid = (): never => { throw new Error('The supply review response could not be verified. Refresh or use the normal inventory screens.'); };
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : invalid();
const text = (v: unknown, max = 500): string => typeof v === 'string' && v.length > 0 && v.length <= max ? v : invalid();
const optionalText = (v: unknown, max: number): string => typeof v === 'string' && v.length <= max ? v : invalid();
const integer = (v: unknown, min = 0, max = 2_147_483_647): number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : invalid();
const date = (v: unknown): string => { const s = text(v, 50); return Number.isFinite(Date.parse(s)) ? s : invalid(); };
const array = <T>(v: unknown, read: (row: unknown) => T, max = 500): T[] => Array.isArray(v) && v.length <= max ? v.map(read) : invalid();
export const reviewId = (v: unknown): string => { const s = text(v, 36); return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s) ? s : invalid(); };
const unique = <T extends { item_id: string }>(rows: T[]): T[] => new Set(rows.map(r => r.item_id)).size === rows.length ? rows : invalid();
export function readCapabilities(value: unknown): SupplyCapabilities {
  const v = object(value);
  if (typeof v.enabled !== 'boolean' || v.contract_version !== 1) invalid();
  if (v.has_history !== undefined && typeof v.has_history !== 'boolean') invalid();
  return { enabled: v.enabled as boolean, contract_version: 1, ttl_seconds: integer(v.ttl_seconds, 1, 86400), max_items: integer(v.max_items, 1, 500), ...(v.has_history === undefined ? {} : { has_history: v.has_history as boolean }) };
}
function readLine(value: unknown): SupplyLine {
  const v = object(value);
  return { item_id: reviewId(v.item_id), item_version: integer(v.item_version, 1), name: text(v.name, 255), unit: text(v.unit, 50),
    supplier_name: v.supplier_name === null ? null : optionalText(v.supplier_name, 255), on_hand: integer(v.on_hand), minimum_stock: integer(v.minimum_stock),
    known_inbound: integer(v.known_inbound), target_quantity: integer(v.target_quantity), order_quantity: integer(v.order_quantity, 1, 999999),
    reasons: array(v.reasons, x => text(x, 1000), 12) };
}
export function readRun(value: unknown): SupplyRun {
  const v = object(value), states = ['needs_input', 'awaiting_review', 'completed', 'cancelled', 'expired', 'stale'];
  if (!states.includes(String(v.status))) invalid();
  let proposal: SupplyProposal | null = null;
  if (v.proposal !== null) {
    const p = object(v.proposal);
    proposal = { id: reviewId(p.id), version: integer(p.version, 1), expires_at: date(p.expires_at), lines: unique(array(p.lines, readLine)) };
  }
  const questions = unique(array(v.questions, x => { const q = object(x); return { item_id: reviewId(q.item_id), name: text(q.name, 255), unit: optionalText(q.unit, 50), code: text(q.code, 80), message: text(q.message, 1500) }; }));
  const excluded = unique(array(v.excluded, x => { const e = object(x); return { item_id: reviewId(e.item_id), name: text(e.name, 255), reason: text(e.reason, 1500) }; }));
  const status = v.status as SupplyRun['status'];
  if (status === 'awaiting_review' && (!proposal || questions.length) || status === 'completed' && !v.order_id) invalid();
  return { id: reviewId(v.id), version: integer(v.version, 1), status, created_at: date(v.created_at), expires_at: date(v.expires_at),
    snapshot_at: date(v.snapshot_at), supply_revision: integer(v.supply_revision), proposal, questions, excluded,
    order_id: v.order_id === null ? null : text(v.order_id, 80) };
}
export function readRuns(value: unknown): SupplyRunSummary[] {
  const runs = array(object(value).runs, x => {
    const v = object(x), states = ['needs_input', 'awaiting_review', 'completed', 'cancelled', 'expired', 'stale'];
    if (!states.includes(String(v.status))) invalid();
    return { id: reviewId(v.id), version: integer(v.version, 1), status: v.status as SupplyRun['status'], created_at: date(v.created_at),
      expires_at: date(v.expires_at), order_id: v.order_id === null ? null : text(v.order_id, 80) };
  }, 20);
  return new Set(runs.map(r => r.id)).size === runs.length ? runs : invalid();
}

export function canConfirm(run: SupplyRun, now = Date.now()): boolean {
  return run.status === 'awaiting_review' && !!run.proposal?.lines.length && !run.questions.length
    && Date.parse(run.expires_at) > now && Date.parse(run.proposal.expires_at) > now;
}
