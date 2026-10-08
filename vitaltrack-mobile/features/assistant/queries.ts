import { isLowStock, isOutOfStock, type Item, type Category } from '@/types';
import { normalize, parseLocal, command, suggestItems, type Intent, type Answer } from './core';
import { queryDefaults, specification, validateSpecification, type Specification, type InventoryQuery } from './contracts';

export const stockLabel = (item: Item) => isOutOfStock(item) ? 'Out of stock' : isLowStock(item) ? 'Low stock' : 'In stock';
const singular = (s: string) => normalize(s).split(' ').map(w => w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w).join(' ');
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
export class Clarification extends Error {
  constructor(message: string, public query = '', public choices: Item[] = []) { super(message); }
}
export function queryInventory(query: InventoryQuery, source: Item[], categories: Category[], previous?: InventoryQuery, selected: Record<string,string> = {}): Item[] {
  const q = query.previous ? { ...previous, ...Object.fromEntries(Object.entries(query).filter(([k,v]) => k !== 'previous' && (v !== null && v !== false && v !== 'any' && v !== 'none' && (!Array.isArray(v) || v.length)))) } as InventoryQuery : query;
  if (query.previous && !previous) throw new Clarification('Ask for an inventory list before using a follow-up.');
  let items = source.filter(i => i.isActive);
  if (items.some(i => !Number.isFinite(i.quantity) || !Number.isFinite(i.minimumStock))) throw new Error('Incomplete stock values. Refresh inventory first.');
  if (q.item_queries.length) {
    const wanted = new Set(q.item_queries.map(name => {
      const resolved = resolveItem(name, items, selected[name]);
      if (Array.isArray(resolved)) throw new Clarification(`Choose the item meant by “${name}”, or rephrase using its full name. Nothing was omitted.`, name, resolved);
      return resolved.id;
    }));
    items = items.filter(i => wanted.has(i.id));
  }
  if (q.category) {
    const matches = categories.filter(c => normalize(c.name) === normalize(q.category!));
    if (matches.length !== 1) throw new Clarification('Use one exact recorded category name.');
    items = items.filter(i => i.categoryId === matches[0].id);
  }
  return items.filter(i => (!q.supplier || normalize(i.supplierName || '') === normalize(q.supplier)) &&
    (!q.brand || normalize(i.brand || '') === normalize(q.brand)) && (!q.missing_supplier || !i.supplierName?.trim()) &&
    (q.status === 'any' || q.status === 'low' && isLowStock(i) || q.status === 'out' && isOutOfStock(i) ||
      q.status === 'attention' && (isLowStock(i) || isOutOfStock(i)) || q.status === 'below_minimum' && i.quantity < i.minimumStock))
    .sort((a,b) => q.sort === 'name' ? a.name.localeCompare(b.name) : q.sort === 'stock' ? a.quantity - b.quantity : 0);
}
export function inventoryAnswer(items: Item[], timestamp: number, stale: boolean): Answer {
  return { title: 'Inventory overview', text: `${items.length} active inventory ${items.length === 1 ? 'entry' : 'entries'} in this view. ${items.filter(isLowStock).length} low stock; ${items.filter(isOutOfStock).length} out of stock. See the complete table below.`,
    items, choices: [], timestamp, stale, statistics: [
      { label: 'Items in view', value: items.length, tone: 'neutral' },
      { label: 'Low stock', value: items.filter(isLowStock).length, tone: 'low' },
      { label: 'Out of stock', value: items.filter(isOutOfStock).length, tone: 'out' },
    ] };
}
export function describeQuery(q: InventoryQuery): string {
  const labels = { any:'all stock states', low:'low stock', out:'out of stock', attention:'low or out of stock', below_minimum:'below the recorded minimum' };
  return [labels[q.status], q.item_queries.length && `items: ${q.item_queries.join(', ')}`, q.category && `category: ${q.category}`,
    q.supplier && `supplier: ${q.supplier}`, q.brand && `brand: ${q.brand}`, q.missing_supplier && 'supplier not recorded',
    q.sort !== 'none' && `sorted by ${q.sort === 'name' ? 'name' : 'stock quantity'}`].filter(Boolean).join(' · ');
}
const numbers: Record<string, number> = { one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90 };
export function spokenNumbers(text: string): string {
  return text.replace(/\b(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g, value => String(value.split(/[ -]/).reduce((n,w) => n + numbers[w],0)));
}
/** Only fully understood local requests bypass the LLM. Legacy refusals are not a language model. */
export function routeLocally(text: string, names: readonly string[], hasDraft = false): Intent | Specification | null {
  const legacy = parseLocal(text, names);
  if (legacy?.intent === 'read_item' && legacy.reference === 'named' && names.some(n => normalize(n) === normalize(legacy.item_query!))) return legacy;
  const q = normalize(text);
  // Draft editing is local-only; stock edits and commitment are never routed to an action.
  const draft = /\b(?:draft|order)\b/.test(q);
  if (/\b(?:delete|erase|apply|mark .{0,30}received|receive order|send .{0,50}(?:supplier|order)|save .{0,30}order|confirm .{0,30}order|export .{0,30}order)\b/.test(q) ||
      /\b(?:update|change|increase|decrease|set)\b.{0,50}\b(?:stock|inventory)\b/.test(q) ||
      !draft && /^(?:(?:please|can you|could you) )*(?:set|add|remove|update|change|increase|decrease)\b/.test(q) ||
      /^(?:yes|confirm|save (?:the |my )?order|export (?:the |my )?order)(?: now)?$/.test(q)) return command('unsupported_action');
  const expanded = parseExpanded(text, hasDraft);
  if (expanded && !['unsupported_action','clarify'].includes(expanded.intent)) return expanded;
  if (legacy && !['unsupported_action','clarify'].includes(legacy.intent) && (legacy.intent !== 'read_item' || legacy.reference === 'previous')) return legacy;
  // Unfamiliar purchase/draft phrasing, filters and courteous requests need interpretation.
  // The cloud specification still has no save/update/send operation; offline mode asks to rephrase.
  return null;
}
/** Conservative local expansion; unfamiliar language can use the opt-in strict cloud contract. */
export function parseExpanded(text: string, hasDraft = false): Specification | null {
  let q = normalize(text).replace(/[.!?]+$/, '').replace(/^(?:please |can you |could you )/, '').replace(/ please$/, '');
  if (!q || q.length > 600) return null;
  if (/\b(?:apply|received|receive|send|supplier order|purchase|delete|inventory update|change stock|stock to|stock by|prescribe|dosage|yesterday|history)\b/.test(q)) return specification('unsupported_action');
  if (/\b(?:not|never|don't|except|instead)\b/.test(q)) return specification('clarify');
  if (/^(?:yes|confirm|save (?:the |my )?order|export (?:the |my )?order)(?: now)?$/.test(q)) return specification('unsupported_action');
  if (/^(?:show|review) (?:my |the )?(?:draft|draft order|order draft)$/.test(q)) return specification('review_draft');
  if (/^(?:export|generate|download) (?:this |the |my )?(?:inventory (?:list|report)|inventory|list)(?: as)?(?: a)? pdf$/.test(q)) return specification('inventory_export');
  const draft = /^(?:(?:prepare|create|make)(?: an?| my| the)?(?: unsaved)?(?: order)? draft(?: order)?(?: for)?|(?:prepare|create|make)(?: an?| my| the)? order(?: for)?|order) (.+)$/.exec(q);
  const editing = /^(?:add|remove|set)\b/.test(q) && /\b(?:draft|order)\b/.test(q) || hasDraft && /^include\b/.test(q);
  if (draft || editing) {
    q = spokenNumbers(draft ? draft[1] : q.replace(/^include /, ''));
    const include_low = /\b(?:other |all |the )?low[- ]stock items\b/.test(q);
    const include_out = /\b(?:everything|all items|items|everything that is|all) (?:that (?:is|are) )?out of stock\b/.test(q) || /out[- ]of[- ]stock items/.test(q);
    q = q.replace(/(?:and )?(?:include |add )?(?:the )?(?:all |other )?low[- ]stock items/g, '').replace(/(?:and )?(?:include )?(?:everything|all items|items|everything that is|all) (?:that (?:is|are) )?out of stock/g,'').replace(/(?:and )?(?:all |the )?out[- ]of[- ]stock items/g,'').replace(/^(?:for )/, '').trim();
    const parts = q ? q.split(/\s+and\s+|,\s*/).filter(Boolean) : [];
    const lines = parts.map(part => {
      part = part.replace(/ (?:to|from|in) (?:this |my |the )?(?:order )?draft(?: order)?$/, '');
      let m = /^remove (.+)$/.exec(part);
      if (m) return { operation: 'remove' as const, item_query: m[1], quantity: null, unit: null };
      m = /^set (?:the order quantity for |the quantity for )?(.+?) to (\d+)(?: (.+))?$/.exec(part);
      if (m) return { operation: 'set' as const, item_query: m[1], quantity: Number(m[2]), unit: m[3] || null };
      m = /^(?:add )?(\d+) (?:more )?(?:(pairs?|boxes?|bottles?|pieces?|units?|packs?) (?:of )?)?(.+)$/.exec(part);
      if (!m) return null;
      return { operation: editing && part.startsWith('add ') ? 'add' as const : 'set' as const, item_query: m[3], quantity: Number(m[1]), unit: m[2] || null };
    });
    if (lines.some(l => !l)) return null;
    try { return validateSpecification(specification('draft_order', { draft_mode: editing ? 'edit' : 'new', lines: lines as Specification['lines'], include_low, include_out })); } catch { return specification('clarify'); }
  }
  if (/(?:and|then|also) (?:create|order|prepare|set|add|remove|update|change|increase|decrease)\b/.test(q)) return specification('unsupported_action');
  const detail = /^(?:what brand (?:are|is)|who supplies) (?:the )?(.+?)(?:,? and who supplies (?:them|it))?$/.exec(q);
  if (detail) return specification('inventory_query', { query: { ...queryDefaults, item_queries: [detail[1]] } });
  const query = { ...queryDefaults, item_queries: [] as string[] };
  if (/^(?:sort alphabetically|sort by name|only show (?:the )?low[- ]stock (?:ones|items)|only show (?:the )?out[- ]of[- ]stock (?:ones|items))$/.test(q)) {
    query.previous = true;
    if (q.startsWith('sort')) query.sort = 'name'; else query.status = q.includes('low') ? 'low' : 'out';
    return specification('inventory_query', { query });
  }
  if (/^(?:show|list|which|what|how many|give me|what brand|who supplies|quantities)/.test(q)) {
    // The simple suffix grammar cannot express multiple filters or sorting in
    // one sentence. Send the whole request to Groq rather than consume a tail
    // as one category/supplier name or silently drop a condition.
    const filters = q.match(/\b(?:in (?:the )?(?:category )?|category |supplied by |from supplier |with brand |of brand )/g) || [];
    if (filters.length > 1 || /\b(?:sort|sorted|ascending|descending|under|over|above|less than|more than|at least|at most|excluding)\b/.test(q)) return null;
    if (/\blow(?:[- ]stock)?\b/.test(q) && /out[- ]of[- ]stock|out of stock/.test(q)) query.status = 'attention';
    else if (/low[- ]stock/.test(q)) query.status = 'low';
    else if (/out[- ]of[- ]stock|out of stock/.test(q)) query.status = 'out';
    else if (/below (?:their |the )?minimum stock/.test(q)) query.status = 'below_minimum';
    query.missing_supplier = /no supplier|without (?:a )?supplier|missing supplier/.test(q);
    const category = /(?:in (?:the )?(?:category )?|category )(.+?)(?: category)?$/.exec(q);
    const supplier = /(?:supplied by|from supplier) (.+)$/.exec(q);
    const brand = /(?:with brand|of brand) (.+)$/.exec(q);
    if (category) query.category = category[1];
    if (supplier) query.supplier = supplier[1];
    if (brand) query.brand = brand[1];
    const multi = /^(?:show )?(?:quantities|quantity|stock) (?:for|of) (.+ and .+)$/.exec(q);
    if (multi) query.item_queries = multi[1].split(/ and /);
    const remainder = multi ? '' : q.replace(/(?:in (?:the )?(?:category )?|category |supplied by |from supplier |with brand |of brand ).+$/, '').replace(/[-]/g, ' ');
    const grammar = new Set('show list which what how many give me items item inventory our my the all everything complete quantities quantity and or status stock are is that we have with no supplier recorded missing without a below their minimum low out of'.split(' '));
    if (remainder.split(' ').some(word => word && !grammar.has(word))) return null;
    if (query.status !== 'any' || query.category || query.supplier || query.brand || query.missing_supplier || query.item_queries.length || /^(?:show|list) (?:all|our|my|the|everything|complete) (?:inventory|items|stock)/.test(q)) return specification('inventory_query', { query });
  }
  return null;
}
