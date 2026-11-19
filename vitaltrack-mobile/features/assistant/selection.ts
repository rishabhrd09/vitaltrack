import { isCriticalEquipment, isLowStock, isOutOfStock, type Category, type Item } from '@/types';
import { normalize, suggestItems, type Answer } from './core';
import { emptyCondition, type Comparison, type Condition, type Selection, type SortOrder } from './contracts';

/**
 * Deterministic execution of a validated selection plan over one owned inventory snapshot.
 * Nothing here writes: it filters, explains and sorts copies of rows the app already holds.
 */
export const stockLabel = (item: Item) => isOutOfStock(item) ? 'Out of stock' : isLowStock(item) ? 'Low stock' : 'In stock';
const singular = (s: string) => normalize(s).split(' ').map(w => w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w).join(' ');
/** Recorded names compare without case, hyphens or slashes: “wound-care” is the category “Wound care”. */
export const looseName = (s: string) => normalize(s).replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
export function resolveItem(query: string, items: Item[], chosen?: string): Item | Item[] {
  const exact = items.filter(i => normalize(i.name) === normalize(query));
  const candidates = exact.length ? exact : items.filter(i => (` ${singular(i.name)} `).includes(` ${singular(query)} `));
  if (!candidates.length) {
    const suggestions = suggestItems(query, items);
    if (chosen && suggestions.some(i => i.id === chosen)) return suggestions.find(i => i.id === chosen)!;
    return suggestions; // Even one near-spelling candidate needs touch clarification.
  }
  if (chosen && candidates.some(i => i.id === chosen)) return candidates.find(i => i.id === chosen)!;
  return candidates.length === 1 ? candidates[0] : candidates;
}
export type ChoiceOption = { id: string; label: string };
/** A question back to the person. `query` keys the answer in the selections map; nothing runs until they choose. */
export class Clarification extends Error {
  constructor(message: string, public query = '', public choices: Item[] = [], public options: ChoiceOption[] = []) { super(message); }
}

export type Evaluation = { rows: Item[]; reasons: Record<string, string[]>; excluded: { item: Item; reason: string }[]; notes: string[] };
export type EvaluationContext = {
  categories: Category[];
  /** False when categories could not be read; a critical-versus-category ambiguity then cannot be checked. */
  categoriesKnown?: boolean;
  /** Rows of the previous result, in their shown order. Fresh values are always taken from `source`. */
  previous?: Item[];
  selected?: Record<string, string>;
};

const OPS: Record<Comparison['op'], [string, (a: number, b: number) => boolean]> = {
  lt: ['less than', (a, b) => a < b], lte: ['at most', (a, b) => a <= b], eq: ['exactly', (a, b) => a === b],
  gte: ['at least', (a, b) => a >= b], gt: ['more than', (a, b) => a > b],
};
const SYMBOL: Record<Comparison['op'], string> = { lt: '<', lte: '≤', eq: '=', gte: '≥', gt: '>' };
const STATE_LABEL = { low: 'low stock', out: 'out of stock', in_stock: 'in stock (not low or out)', below_minimum: 'below its recorded minimum' } as const;
const units = (item: Item) => item.unit || 'units';

/** Why one row has its stock state, using the same rules as the dashboard and Create Order. */
export function stockReason(item: Item): string {
  if (isOutOfStock(item)) return 'Out of stock';
  if (item.quantity < item.minimumStock) return `Low stock · ${item.quantity} of minimum ${item.minimumStock} ${units(item)}`;
  if (isLowStock(item)) return isCriticalEquipment(item) ? 'Low stock · critical equipment with 1 left' : `Low stock · only 1 ${units(item)} left`;
  return 'In stock';
}
export const criticalReason = (item: Item) => item.isCritical ? 'Marked critical equipment' : 'Critical equipment by name rule';
const stateMatches = (item: Item, state: Condition['stock'][number]) =>
  state === 'low' ? isLowStock(item) : state === 'out' ? isOutOfStock(item) : state === 'below_minimum' ? item.quantity < item.minimumStock : !isLowStock(item) && !isOutOfStock(item);

type Matcher = { test: (item: Item) => boolean; reasons: (item: Item) => string[] };

function recordedName(kind: 'supplier' | 'brand', term: string, active: Item[], selected: Record<string, string>, notes: string[]): string | null {
  const key = `${kind}:${term}`;
  const recorded = [...new Set(active.map(i => (kind === 'supplier' ? i.supplierName : i.brand)?.trim()).filter((n): n is string => !!n))];
  if (selected[key] && recorded.includes(selected[key])) return selected[key];
  const exact = recorded.filter(n => looseName(n) === looseName(term));
  if (exact.length) return exact[0];
  // Only a recorded name that contains every spoken word is offered; extra spoken words are never dropped.
  const near = recorded.filter(n => ` ${looseName(n)} `.includes(` ${looseName(term)} `));
  if (near.length) throw new Clarification(`No ${kind} is recorded exactly as “${term}”. Choose the ${kind} you meant. Nothing was dropped.`, key, [], near.slice(0, 20).map(n => ({ id: n, label: `${kind === 'supplier' ? 'Supplier' : 'Brand'} · ${n}` })));
  notes.push(`No active item records ${kind} “${term}”.`);
  return null;
}

function categoryId(term: string, ctx: EvaluationContext): string {
  const key = `category:${term}`;
  const chosen = ctx.selected?.[key];
  if (chosen && ctx.categories.some(c => c.id === chosen)) return chosen;
  const exact = ctx.categories.filter(c => looseName(c.name) === looseName(term));
  if (exact.length === 1) return exact[0].id;
  const near = exact.length ? exact : ctx.categories.filter(c => ` ${looseName(c.name)} `.includes(` ${looseName(term)} `));
  if (near.length) throw new Clarification(`Choose the category meant by “${term}”. Nothing was dropped.`, key, [], near.slice(0, 20).map(c => ({ id: c.id, label: `Category · ${c.name}` })));
  throw new Clarification('Use one exact recorded category name.');
}

/** “Critical” means the critical-equipment rule unless the person chooses a category whose name says critical. */
function criticalMeaning(ctx: EvaluationContext): { category: string } | 'equipment' {
  const chosen = ctx.selected?.__critical__;
  const named = ctx.categories.filter(c => /\bcritical\b/.test(looseName(c.name)));
  if (chosen?.startsWith('category:') && named.some(c => `category:${c.id}` === chosen)) return { category: chosen.slice(9) };
  if (chosen === 'equipment' || !named.length) return 'equipment';
  throw new Clarification('“Critical” could mean critical equipment or one of your categories. Choose which you meant.', '__critical__', [],
    [{ id: 'equipment', label: 'Critical equipment · marked ★ or named like a ventilator' }, ...named.map(c => ({ id: `category:${c.id}`, label: `Category · ${c.name}` }))]);
}

function compile(c: Condition, active: Item[], ctx: EvaluationContext, mode: 'include' | 'exclude', notes: string[]): Matcher {
  const selected = ctx.selected || {};
  const tests: ((item: Item) => boolean)[] = [];
  const reasons: ((item: Item) => string | null)[] = [];
  if (c.item_queries.length) {
    const ids = new Map<string, string>();
    for (const name of c.item_queries) {
      if (mode === 'include') {
        const resolved = resolveItem(name, active, selected[name]);
        if (Array.isArray(resolved)) throw new Clarification(`Choose the item meant by “${name}”, or rephrase using its full name. Nothing was omitted.`, name, resolved);
        ids.set(resolved.id, 'Named in your request');
      } else {
        // An exclusion removes every item whose name contains the words, and the answer lists each one removed.
        const key = `exclude:${name}`;
        const words = ` ${singular(name)} `;
        const matched = active.filter(i => normalize(i.name) === normalize(name) || ` ${singular(i.name)} `.includes(words));
        const chosen = active.find(i => i.id === selected[key]);
        if (chosen) matched.push(chosen);
        if (!matched.length) {
          const near = suggestItems(name, active);
          throw new Clarification(near.length ? `Choose the item to exclude for “${name}”. Nothing was excluded yet.` : `No item name contains “${name}”, so nothing could be excluded. Rephrase using the item's name.`, key, near);
        }
        for (const item of matched) ids.set(item.id, `name matches “${name}”`);
      }
    }
    tests.push(item => ids.has(item.id)); reasons.push(item => ids.get(item.id) || null);
  }
  if (c.stock.length) {
    tests.push(item => c.stock.some(state => stateMatches(item, state)));
    reasons.push(item => c.stock.includes('below_minimum') && item.quantity < item.minimumStock && !isLowStock(item) && !isOutOfStock(item)
      ? `Below minimum · ${item.quantity} of ${item.minimumStock} ${units(item)}` : stockReason(item));
  }
  for (const comparison of c.quantity) {
    const [words, compare] = OPS[comparison.op];
    tests.push(item => compare(item.quantity, comparison.value));
    reasons.push(item => `Quantity ${item.quantity} is ${words} ${comparison.value}`);
  }
  if (c.critical !== null) {
    const meaning = criticalMeaning(ctx);
    if (meaning === 'equipment') {
      tests.push(item => isCriticalEquipment(item) === c.critical);
      reasons.push(item => c.critical ? criticalReason(item) : 'Not critical equipment');
    } else {
      const name = ctx.categories.find(x => x.id === meaning.category)?.name || 'chosen category';
      tests.push(item => (item.categoryId === meaning.category) === c.critical);
      reasons.push(() => c.critical ? `Category: ${name}` : `Not in category ${name}`);
    }
  }
  if (c.category !== null) {
    const id = categoryId(c.category, ctx);
    const name = ctx.categories.find(x => x.id === id)?.name || c.category;
    tests.push(item => item.categoryId === id); reasons.push(() => `Category: ${name}`);
  }
  for (const kind of ['supplier', 'brand'] as const) {
    const term = c[kind];
    if (term === null) continue;
    const name = recordedName(kind, term, active, selected, notes);
    tests.push(item => name !== null && looseName((kind === 'supplier' ? item.supplierName : item.brand) || '') === looseName(name));
    reasons.push(() => `${kind === 'supplier' ? 'Supplier' : 'Brand'}: ${name}`);
  }
  if (c.missing_supplier) { tests.push(item => !item.supplierName?.trim()); reasons.push(() => 'No supplier recorded'); }
  return { test: item => tests.every(t => t(item)), reasons: item => reasons.map(r => r(item)).filter((r): r is string => !!r) };
}

const rank = (i: Item) => isOutOfStock(i) ? 0 : isLowStock(i) ? 1 : 2;
const shortfall = (i: Item) => Math.max(i.minimumStock - i.quantity, 0);
const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);
export function sortRows(rows: Item[], sort: SortOrder): Item[] {
  const compare: Record<SortOrder, ((a: Item, b: Item) => number) | null> = {
    none: null, name: byName,
    quantity_asc: (a, b) => a.quantity - b.quantity || byName(a, b),
    quantity_desc: (a, b) => b.quantity - a.quantity || byName(a, b),
    shortfall: (a, b) => shortfall(b) - shortfall(a) || byName(a, b),
    // Order-now priority: out of stock, then low; critical equipment first; then the largest share of the minimum missing.
    priority: (a, b) => rank(a) - rank(b) || Number(isCriticalEquipment(b)) - Number(isCriticalEquipment(a)) ||
      (b.minimumStock > 0 ? shortfall(b) / b.minimumStock : 0) - (a.minimumStock > 0 ? shortfall(a) / a.minimumStock : 0) || shortfall(b) - shortfall(a) || byName(a, b),
  };
  return compare[sort] ? [...rows].sort(compare[sort]!) : rows;
}

/** (any_of[0] ∪ any_of[1] ∪ …) minus exclusions, unique by item ID, then sorted. */
export function evaluateSelection(sel: Selection, source: Item[], ctx: EvaluationContext): Evaluation {
  const active = source.filter(i => i.isActive);
  if (active.some(i => !Number.isFinite(i.quantity) || !Number.isFinite(i.minimumStock))) throw new Error('Incomplete stock values. Refresh inventory first.');
  const notes: string[] = [];
  let base = active;
  if (sel.scope === 'previous') {
    if (!ctx.previous) throw new Clarification('Ask for an inventory list before using a follow-up such as “only the critical ones”.');
    const fresh = new Map(active.map(i => [i.id, i]));
    base = ctx.previous.map(i => fresh.get(i.id)).filter((i): i is Item => !!i);
    if (base.length < ctx.previous.length) notes.push(`${ctx.previous.length - base.length} item(s) from the previous list are no longer active.`);
  }
  const reasons: Record<string, string[]> = {};
  const seen = new Set<string>();
  const matchers = sel.any_of.map(c => compile(c, active, ctx, 'include', notes));
  for (const item of base) {
    for (const [index, matcher] of matchers.entries()) {
      if (!matcher.test(item)) continue;
      seen.add(item.id);
      const why = matcher.reasons(item);
      reasons[item.id] = [...new Set([...(reasons[item.id] || []), ...(emptyCondition(sel.any_of[index]) ? [stockReason(item)] : why)])];
    }
  }
  const excluders = sel.exclude.map(c => compile(c, active, ctx, 'exclude', notes));
  const excluded: Evaluation['excluded'] = [];
  const rows = base.filter(item => {
    if (!seen.has(item.id)) return false;
    const hit = excluders.find(m => m.test(item));
    if (hit) excluded.push({ item, reason: `Excluded: ${hit.reasons(item).join(' and ') || 'matches your exclusion'}` });
    return !hit;
  });
  return { rows: sortRows(rows, sel.sort), reasons, excluded, notes };
}

function describeCondition(c: Condition): string {
  if (emptyCondition(c)) return 'all items';
  const parts = [
    c.item_queries.length && `named ${c.item_queries.map(n => `“${n}”`).join(', ')}`,
    c.critical !== null && (c.critical ? 'critical equipment' : 'not critical equipment'),
    c.stock.length && c.stock.map(s => STATE_LABEL[s]).join(' or '),
    ...c.quantity.map(q => `quantity ${SYMBOL[q.op]} ${q.value}`),
    c.category && `category “${c.category}”`, c.supplier && `supplier “${c.supplier}”`, c.brand && `brand “${c.brand}”`,
    c.missing_supplier && 'no supplier recorded',
  ].filter(Boolean);
  return parts.join(' and ');
}
const SORT_LABEL: Record<SortOrder, string> = { none: '', name: 'sorted A–Z', quantity_asc: 'lowest quantity first', quantity_desc: 'highest quantity first',
  shortfall: 'largest shortfall first', priority: 'order priority: out of stock first, then critical equipment, then largest shortfall' };
/** The filters exactly as they were applied, so the person can check what was understood. */
export function describeSelection(sel: Selection): string {
  const groups = sel.any_of.map(describeCondition);
  return [sel.scope === 'previous' && 'within the previous results', groups.length > 1 ? groups.map(g => `(${g})`).join(' or ') : groups[0],
    sel.exclude.length && `excluding ${sel.exclude.map(describeCondition).join(', ')}`, SORT_LABEL[sel.sort]].filter(Boolean).join(' · ');
}

/** A compact answer: the count, the applied filters, the first rows for narration, and the full table below. */
export function selectionAnswer(result: Evaluation, sel: Selection, timestamp: number, stale: boolean): Answer {
  const { rows } = result;
  const low = rows.filter(isLowStock).length, out = rows.filter(isOutOfStock).length;
  const filters = describeSelection(sel);
  const sample = rows.slice(0, 3).map(i => `${i.name}, ${i.quantity} ${units(i)}, ${stockLabel(i).toLowerCase()}`).join('; ');
  const excluded = result.excluded.length ? ` Excluded by your request: ${result.excluded.slice(0, 3).map(e => e.item.name).join(', ')}${result.excluded.length > 3 ? ` and ${result.excluded.length - 3} more` : ''}.` : '';
  const text = rows.length
    ? `${rows.length} ${rows.length === 1 ? 'item matches' : 'items match'}. ${sample}${rows.length > 3 ? `; and ${rows.length - 3} more in the table` : ''}.${excluded}`
    : `No active items match these filters.${excluded} Try removing a filter.`;
  return { title: sel.sort === 'priority' ? 'Consider ordering now' : 'Inventory results', text: [text, ...result.notes].join(' '), items: rows, choices: [], timestamp, stale,
    filters, reasons: result.reasons, excluded: result.excluded.map(e => ({ name: e.item.name, reason: e.reason })), notes: result.notes, kind: 'list',
    statistics: [
      { label: 'Items in view', value: rows.length, tone: 'neutral' },
      { label: 'Low stock', value: low, tone: 'low' },
      { label: 'Out of stock', value: out, tone: 'out' },
    ] };
}
