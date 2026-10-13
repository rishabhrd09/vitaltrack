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

/**
 * Version 3: a bounded selection plan, negotiated separately so version 2 keeps its meaning.
 * Rows = (any_of[0] ∪ any_of[1] ∪ …) minus every row matching an exclude condition, then sorted.
 * Each condition is the AND of its fields; a list inside one field (stock, item_queries) is an OR.
 * scope=previous starts from the previous result instead of all active items. Rows are unique by item ID.
 */
export type StockState = 'low' | 'out' | 'in_stock' | 'below_minimum';
export type Comparison = { op: 'lt' | 'lte' | 'eq' | 'gte' | 'gt'; value: number };
export type Condition = {
  item_queries: string[]; stock: StockState[]; quantity: Comparison[]; critical: boolean | null;
  category: string | null; supplier: string | null; brand: string | null; missing_supplier: boolean;
};
export type SortOrder = 'none' | 'name' | 'quantity_asc' | 'quantity_desc' | 'shortfall' | 'priority';
export type Selection = { scope: 'inventory' | 'previous'; any_of: Condition[]; exclude: Condition[]; sort: SortOrder };
/** target=previous names no item: it means the single item in focus (the draft line or result just shown). */
export type PlanLine = { operation: 'set' | 'add' | 'remove'; target: 'named' | 'previous'; item_query: string | null; quantity: number | null; unit: string | null };
export type DraftPlan = { mode: 'new' | 'edit'; lines: PlanLine[]; include_selection: boolean };
export type ClarifyReason = 'ambiguous' | 'unsupported_condition' | 'conflict' | 'missing_context';
export type Plan = {
  version: 3;
  intent: Specification['intent'];
  selection: Selection | null; draft: DraftPlan | null; clarify_reason: ClarifyReason | null;
};
export const PLAN_LIMITS = { conditions: 6, exclusions: 6, names: 100, lines: 100, quantity: 999_999 } as const;
export const anyCondition: Readonly<Condition> = Object.freeze({ item_queries: Object.freeze([]) as unknown as string[], stock: Object.freeze([]) as unknown as StockState[],
  quantity: Object.freeze([]) as unknown as Comparison[], critical: null, category: null, supplier: null, brand: null, missing_supplier: false });
/** A fresh condition; its lists are never shared with another condition. */
export const condition = (patch: Partial<Condition> = {}): Condition => ({ ...anyCondition, item_queries: [], stock: [], quantity: [], ...patch });
export function selection(any_of: Condition[] = [condition()], patch: Partial<Omit<Selection, 'any_of'>> = {}): Selection {
  return { scope: 'inventory', any_of, exclude: [], sort: 'none', ...patch };
}
export function plan(intent: Plan['intent'], patch: Partial<Plan> = {}): Plan {
  return { version: 3, intent, selection: null, draft: null, clarify_reason: null, ...patch };
}
const STOCK_STATES = ['low', 'out', 'in_stock', 'below_minimum'];
const SORTS = ['none', 'name', 'quantity_asc', 'quantity_desc', 'shortfall', 'priority'];
const INTENTS = ['inventory_query', 'draft_order', 'review_draft', 'inventory_export', 'clarify', 'unsupported_action'];
const LOWER = ['gt', 'gte'], UPPER = ['lt', 'lte'];
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** True when a condition constrains nothing (it then means "every row in scope"). */
export function emptyCondition(c: Condition): boolean {
  return !c.item_queries.length && !c.stock.length && !c.quantity.length && c.critical === null && c.category === null &&
    c.supplier === null && c.brand === null && !c.missing_supplier;
}
function validateCondition(c: unknown): Condition {
  if (!isObject(c) || !keys(c, ['item_queries', 'stock', 'quantity', 'critical', 'category', 'supplier', 'brand', 'missing_supplier'])) throw new Error('Invalid condition.');
  const v = c as Condition;
  if (!Array.isArray(v.item_queries) || v.item_queries.length > PLAN_LIMITS.names || v.item_queries.some(n => !phrase(n)) ||
      !Array.isArray(v.stock) || v.stock.length > 4 || new Set(v.stock).size !== v.stock.length || v.stock.some(s => !STOCK_STATES.includes(s)) ||
      (v.critical !== null && typeof v.critical !== 'boolean') || typeof v.missing_supplier !== 'boolean' ||
      [v.category, v.supplier, v.brand].some(n => n !== null && !phrase(n)) || !Array.isArray(v.quantity) || v.quantity.length > 2) throw new Error('Invalid condition.');
  for (const q of v.quantity) {
    if (!isObject(q) || !keys(q, ['op', 'value']) || ![...LOWER, ...UPPER, 'eq'].includes(q.op as string) ||
        !Number.isInteger(q.value) || (q.value as number) < 0 || (q.value as number) > PLAN_LIMITS.quantity) throw new Error('Invalid quantity comparison.');
  }
  // Two comparisons must form one range: a lower and an upper bound. Equality stands alone.
  if (v.quantity.length === 2 && !(v.quantity.some(q => LOWER.includes(q.op)) && v.quantity.some(q => UPPER.includes(q.op)))) throw new Error('Invalid quantity range.');
  return v;
}
function validateSelection(s: unknown): Selection {
  if (!isObject(s) || !keys(s, ['scope', 'any_of', 'exclude', 'sort']) || !['inventory', 'previous'].includes(s.scope as string) || !SORTS.includes(s.sort as string) ||
      !Array.isArray(s.any_of) || !s.any_of.length || s.any_of.length > PLAN_LIMITS.conditions ||
      !Array.isArray(s.exclude) || s.exclude.length > PLAN_LIMITS.exclusions) throw new Error('Invalid selection.');
  const v = s as Selection;
  v.any_of.forEach(validateCondition);
  // An empty exclusion would remove every row; it is never a meaningful request.
  if (v.exclude.map(validateCondition).some(emptyCondition)) throw new Error('Invalid exclusion.');
  return v;
}
export function validatePlan(value: unknown): Plan {
  if (!isObject(value) || !keys(value, ['version', 'intent', 'selection', 'draft', 'clarify_reason']) || value.version !== 3 ||
      !INTENTS.includes(value.intent as string)) throw new Error('Invalid assistant plan.');
  const p = value as Plan;
  if (p.clarify_reason !== null && (p.intent !== 'clarify' || !['ambiguous', 'unsupported_condition', 'conflict', 'missing_context'].includes(p.clarify_reason))) throw new Error('Invalid clarification.');
  if (p.selection !== null) validateSelection(p.selection);
  if (p.draft !== null) {
    const d = p.draft;
    if (!isObject(d) || !keys(d, ['mode', 'lines', 'include_selection']) || !['new', 'edit'].includes(d.mode) || typeof d.include_selection !== 'boolean' ||
        !Array.isArray(d.lines) || d.lines.length > PLAN_LIMITS.lines) throw new Error('Invalid draft plan.');
    for (const l of d.lines) {
      if (!isObject(l) || !keys(l, ['operation', 'target', 'item_query', 'quantity', 'unit']) || !['set', 'add', 'remove'].includes(l.operation as string) ||
          !['named', 'previous'].includes(l.target as string) || (l.target === 'named' ? !phrase(l.item_query) : l.item_query !== null) ||
          (l.unit !== null && !phrase(l.unit)) || (l.quantity !== null && (!Number.isInteger(l.quantity) || (l.quantity as number) < 1 || (l.quantity as number) > PLAN_LIMITS.quantity)) ||
          (l.operation === 'remove' && (l.quantity !== null || l.unit !== null))) throw new Error('Invalid draft line.');
    }
  }
  if (p.intent === 'inventory_query' ? !p.selection || p.draft : p.intent !== 'draft_order' && (p.selection || p.draft)) throw new Error('Unexpected plan parameters.');
  if (p.intent === 'draft_order' && (!p.draft || !!p.selection !== p.draft.include_selection || (!p.draft.lines.length && !p.draft.include_selection))) throw new Error('Invalid draft plan.');
  return p;
}
const STATUS_STATES: Record<InventoryQuery['status'], StockState[]> = { any: [], low: ['low'], out: ['out'], attention: ['low', 'out'], below_minimum: ['below_minimum'] };
/** Version 2 queries keep their filters; a follow-up now narrows the previous rows instead of replacing their filters. */
export function upgradeQuery(q: InventoryQuery): Selection {
  return selection([condition({ item_queries: q.item_queries, stock: STATUS_STATES[q.status], category: q.category, supplier: q.supplier, brand: q.brand, missing_supplier: q.missing_supplier })],
    { scope: q.previous ? 'previous' : 'inventory', sort: q.sort === 'stock' ? 'quantity_asc' : q.sort });
}
export function upgradeSpecification(s: Specification): Plan {
  validateSpecification(s);
  if (s.intent === 'inventory_query') return validatePlan(plan('inventory_query', { selection: upgradeQuery(s.query!) }));
  if (s.intent !== 'draft_order') return validatePlan(plan(s.intent));
  const stock: StockState[] = [...(s.include_low ? ['low' as const] : []), ...(s.include_out ? ['out' as const] : [])];
  return validatePlan(plan('draft_order', {
    selection: stock.length ? selection([condition({ stock })]) : null,
    draft: { mode: s.draft_mode!, include_selection: stock.length > 0, lines: s.lines.map(l => ({ ...l, target: 'named' as const })) },
  }));
}
export const toPlan = (value: Specification | Plan): Plan => value.version === 3 ? validatePlan(value) : upgradeSpecification(value);
