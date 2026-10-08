/** Versioned interpretation data only. No server mutation operation exists here. */
export type InventoryQuery = {
  status: 'any' | 'low' | 'out' | 'attention' | 'below_minimum';
  category: string | null; supplier: string | null; brand: string | null;
  missing_supplier: boolean; item_queries: string[];
  sort: 'none' | 'name' | 'stock'; previous: boolean;
};
export type DraftLine = { operation: 'set' | 'add' | 'remove'; item_query: string; quantity: number | null; unit: string | null };
export type Specification = {
  version: 2;
  intent: 'inventory_query' | 'draft_order' | 'review_draft' | 'inventory_export' | 'clarify' | 'unsupported_action';
  draft_mode: 'new' | 'edit' | null;
  query: InventoryQuery | null; lines: DraftLine[]; include_low: boolean; include_out: boolean;
};
export const queryDefaults: InventoryQuery = { status: 'any', category: null, supplier: null, brand: null, missing_supplier: false, item_queries: [], sort: 'none', previous: false };
export function specification(intent: Specification['intent'], patch: Partial<Specification> = {}): Specification {
  return { version: 2, intent, draft_mode: null, query: null, lines: [], include_low: false, include_out: false, ...patch };
}
const keys = (v: object, allowed: string[]) => Object.keys(v).sort().join(',') === allowed.sort().join(',');
const phrase = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 160;
export function validateSpecification(value: unknown): Specification {
  if (!value || typeof value !== 'object') throw new Error('Invalid assistant specification.');
  const s = value as Specification;
  if (!keys(s, ['version', 'intent', 'draft_mode', 'query', 'lines', 'include_low', 'include_out']) || s.version !== 2 ||
      !['inventory_query', 'draft_order', 'review_draft', 'inventory_export', 'clarify', 'unsupported_action'].includes(s.intent) ||
      typeof s.include_low !== 'boolean' || typeof s.include_out !== 'boolean' || !Array.isArray(s.lines) || s.lines.length > 100) throw new Error('Invalid assistant specification.');
  if (s.query !== null) {
    const q = s.query;
    if (typeof q !== 'object' || !keys(q, ['status','category','supplier','brand','missing_supplier','item_queries','sort','previous']) ||
      !['any','low','out','attention','below_minimum'].includes(q.status) || !['none','name','stock'].includes(q.sort) ||
      typeof q.previous !== 'boolean' || typeof q.missing_supplier !== 'boolean' ||
      [q.category,q.supplier,q.brand].some(v => v !== null && !phrase(v)) || !Array.isArray(q.item_queries) || q.item_queries.length > 100 || q.item_queries.some(v => !phrase(v))) throw new Error('Invalid inventory query.');
  }
  for (const l of s.lines) {
    if (!l || !keys(l, ['operation','item_query','quantity','unit']) || !['set','add','remove'].includes(l.operation) || !phrase(l.item_query) ||
      (l.unit !== null && !phrase(l.unit)) || (l.quantity !== null && (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 999_999)) ||
      (l.operation === 'remove' && (l.quantity !== null || l.unit !== null))) throw new Error('Invalid draft line.');
  }
  if (s.intent === 'inventory_query' ? !s.query || s.lines.length || s.include_low || s.include_out : s.query !== null) throw new Error('Unexpected query parameters.');
  if (s.intent !== 'draft_order' && (s.lines.length || s.include_low || s.include_out)) throw new Error('Unexpected draft parameters.');
  if (s.intent === 'draft_order' ? !['new','edit'].includes(s.draft_mode || '') : s.draft_mode !== null) throw new Error('Invalid draft mode.');
  if (s.intent === 'draft_order' && !s.lines.length && !s.include_low && !s.include_out) throw new Error('No draft items requested.');
  return s;
}
