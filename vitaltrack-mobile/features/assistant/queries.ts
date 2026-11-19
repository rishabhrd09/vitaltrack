import { isLowStock, isOutOfStock, type Item, type Category } from '@/types';
import { normalize, parseLocal, command, type Intent, type Answer } from './core';
import { condition, plan, queryDefaults, selection, specification, upgradeQuery, validatePlan, validateSpecification,
  type Condition, type InventoryQuery, type Plan, type PlanLine, type SortOrder, type Specification, type StockState } from './contracts';
import { evaluateSelection, looseName } from './selection';
export { Clarification, resolveItem, stockLabel } from './selection';

/** Version 2 compatibility: the query is upgraded and runs through the same deterministic executor. */
export function queryInventory(query: InventoryQuery, source: Item[], categories: Category[], previous?: InventoryQuery, selected: Record<string,string> = {}): Item[] {
  const prior = query.previous && previous ? evaluateSelection(upgradeQuery({ ...previous, previous: false }), source, { categories, selected }).rows : undefined;
  return evaluateSelection(upgradeQuery(query), source, { categories, previous: prior, selected }).rows;
}
export function inventoryAnswer(items: Item[], timestamp: number, stale: boolean): Answer {
  return { title: 'Inventory overview', text: `${items.length} active inventory ${items.length === 1 ? 'entry' : 'entries'} in this view. ${items.filter(isLowStock).length} low stock; ${items.filter(isOutOfStock).length} out of stock. See the complete table below.`,
    items, choices: [], timestamp, stale, statistics: [
      { label: 'Items in view', value: items.length, tone: 'neutral' },
      { label: 'Low stock', value: items.filter(isLowStock).length, tone: 'low' },
      { label: 'Out of stock', value: items.filter(isOutOfStock).length, tone: 'out' },
    ] };
}
const numbers: Record<string, number> = { zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90 };
const numberWord = new RegExp(`\\b(?:${Object.keys(numbers).join('|')})\\b`);
export function spokenNumbers(text: string): string {
  return text.replace(/\b(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g, value => String(value.split(/[ -]/).reduce((n,w) => n + numbers[w],0)));
}
// Whole clauses only: a stock-group phrase with an extra supplier, exclusion or
// limit must go to interpretation/clarification rather than lose that condition.
const stockGroup = /^(?:(?:include|add) )?(?:(?:all|other|the|everything) )*(?:items? )?(?:(?:which|that) (?:are|is) )?(low(?:[- ]stock| in stock| on stock)?|out[- ]of[- ]stock)(?: (?:or|and) (low(?:[- ]stock| in stock| on stock)?|out[- ]of[- ]stock))?(?: items?)?$/;
const draftPrefix = '(?:(?:prepare|create|make)(?: an?| my| the)?(?: (?:unsaved|saved))?(?: order)? draft(?: order)?|(?:prepare|create|make)(?: an?| my| the)? order|order)';
const repeatedDraftRequest = /^(?:prepare|create|make)(?: an?| my| the)?(?: (?:unsaved|saved))?(?: order)? draft(?: order)?$/;
/** Only fully understood local requests bypass the LLM. Legacy refusals are not a language model. */
export function routeLocally(text: string, names: readonly string[], hasDraft = false, categoryNames: readonly string[] = []): Intent | Specification | Plan | null {
  const legacy = parseLocal(text, names);
  if (legacy?.intent === 'read_item' && legacy.reference === 'named' && names.some(n => normalize(n) === normalize(legacy.item_query!))) return legacy;
  // Name normalization treats hyphens as separators. Never let it turn a signed
  // or fractional amount into a different, positive whole-number request.
  if (unsupportedNumber(text, [...names, ...categoryNames])) return plan('clarify', { clarify_reason: 'unsupported_condition' });
  const q = normalize(text);
  // "Add five more" and "set the draft quantity to five" change the draft line in focus, never stock.
  const followUp = draftFollowUp(q, hasDraft);
  if (followUp) return followUp;
  // Draft editing is local-only; stock edits and commitment are never routed to an action.
  const draft = /\b(?:draft|order)\b/.test(q);
  if (draft && /\b(?:save|persist|commit|confirm)\b/.test(q) ||
      /\b(?:delete|erase|apply|mark .{0,30}received|receive order|send .{0,50}(?:supplier|order)|save .{0,30}order|confirm .{0,30}order|export .{0,30}order)\b/.test(q) ||
      /\b(?:update|change|increase|decrease|set)\b.{0,50}\b(?:stock|inventory)\b/.test(q) ||
      !draft && /^(?:(?:please|can you|could you) )*(?:set|add|remove|update|change|increase|decrease)\b/.test(q) ||
      /^(?:yes|confirm|save (?:the |my )?order|export (?:the |my )?order)(?: now)?$/.test(q)) return command('unsupported_action');
  const planned = parsePlan(text, { names, categories: categoryNames });
  const complexDraft = planned?.selection && (planned.selection.scope === 'previous' || planned.selection.exclude.length ||
    planned.selection.any_of.length > 1 || planned.selection.sort !== 'none' || planned.selection.any_of.some(c =>
      c.quantity.length || c.critical !== null || c.category !== null || c.supplier !== null || c.brand !== null || c.missing_supplier));
  const namedNumberDraft = planned?.draft?.lines.some(line => line.item_query && names.some(name =>
    looseName(name) === looseName(line.item_query!) && numberWord.test(looseName(name))));
  if (planned && (planned.intent !== 'draft_order' || complexDraft || namedNumberDraft)) return planned;
  // The v2 suffix parser cannot distinguish list unions from intersections.
  // Use it only after the complete v3 grammar has declined the utterance.
  const expanded = parseExpanded(text, hasDraft);
  if (expanded && !['unsupported_action','clarify'].includes(expanded.intent)) return expanded;
  if (planned) return planned;
  if (legacy && !['unsupported_action','clarify'].includes(legacy.intent) && (legacy.intent !== 'read_item' || legacy.reference === 'previous')) return legacy;
  // Unfamiliar purchase/draft phrasing, filters and courteous requests need interpretation.
  // The cloud specification still has no save/update/send operation; offline mode asks to rephrase.
  return null;
}
/** Conservative local expansion; unfamiliar language can use the opt-in strict cloud contract. */
export function parseExpanded(text: string, hasDraft = false): Specification | null {
  const clean = (value: string) => normalize(value).replace(/[.!?]+$/, '').replace(/^(?:please |can you |could you )/, '').replace(/ please$/, '');
  let q = clean(text);
  if (!q || q.length > 600) return null;
  if (/\b(?:apply|received|receive|send|supplier order|purchase|delete|inventory update|change stock|stock to|stock by|prescribe|dosage|yesterday|tomorrow|history|historical|last (?:week|month|year|time)|next (?:week|month|year)|used|usage|consumption|forecast|expir\w*|bought|sold)\b/.test(q)) return specification('unsupported_action');
  if (/\b(?:not|never|don't|except|instead)\b/.test(q)) return specification('clarify');
  if (/^(?:yes|confirm|save (?:the |my )?order|export (?:the |my )?order)(?: now)?$/.test(q)) return specification('unsupported_action');
  if (/^(?:show|review) (?:my |the )?(?:draft|draft order|order draft)$/.test(q)) return specification('review_draft');
  if (/^(?:export|generate|download) (?:this |the |my )?(?:inventory (?:list|report)|inventory|list)(?: as)?(?: a)? pdf$/.test(q)) return specification('inventory_export');
  // Keep dictated list boundaries before normalize removes comma punctuation.
  const draftText = clean(text.replace(/,\s+(?:and )?/gi, ' and '));
  const draft = new RegExp(`^${draftPrefix}(?: for)? (.+)$`).exec(draftText);
  const editing = /^(?:add|remove|set)\b/.test(q) && /\b(?:draft|order)\b/.test(q) || hasDraft && /^include\b/.test(q);
  if (draft || editing) {
    q = spokenNumbers(draft ? draft[1] : draftText.replace(/^include /, ''));
    q = q.replace(/^(?:the )?following items? /, '').replace(/^for /, '').trim();
    let include_low = false, include_out = false;
    const parts = q ? q.split(/\s+and\s+|,\s*(?:and )?/).map(part => part.trim()).filter(Boolean) : [];
    const itemParts: string[] = [];
    for (const [index, raw] of parts.entries()) {
      const part = raw.replace(/^(?:first|second|third|fourth|fifth)(?: item)? (?:is |are )?/, '');
      // A repeated request at the end of a dictated list is the same local
      // draft intent. An actual save/confirm clause is never removed here.
      if (draft && index === parts.length - 1 && repeatedDraftRequest.test(part)) continue;
      const group = stockGroup.exec(part);
      if (group) {
        const states = [group[1], group[2]].filter(Boolean);
        include_low ||= states.some(state => state.startsWith('low'));
        include_out ||= states.some(state => state.startsWith('out'));
      } else itemParts.push(part);
    }
    const lines = itemParts.map(part => {
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
    if (category && /^(?:stock|total|hand|(?:our |the )?inventory)$/.test(category[1])) return null;
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

const UNIT_WORDS = 'units?|pairs?|boxes?|bottles?|pieces?|packs?|packets?|tubes?|vials?|rolls?|strips?|bags?|cartons?|cases?|sachets?';
const unsupportedNumber = (text: string, names: readonly string[] = []) => {
  let amounts = text.toLowerCase();
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escaped) amounts = amounts.replace(new RegExp(`(^|\\W)${escaped}(?!\\w)`, 'g'), '$1recorded name');
  }
  // Normalize number words before checking their signs, while a valid compound
  // such as “twenty-three” becomes 23. Punctuation does not hide a signed value:
  // “(-two)” and “below:+3” must be rejected before looseName removes hyphens.
  const numeric = spokenNumbers(amounts);
  return /(?:^|[^\w])[+\-−]\s*\d|\d[.,]\d|\d\s*[/⁄]\s*\d/.test(numeric);
};
/** A quantity change for the one draft line in focus. Without an open draft, "add five more" stays a refusal. */
function draftFollowUp(text: string, hasDraft: boolean): Plan | null {
  const q = spokenNumbers(text).replace(/^(?:(?:please|ok|okay|and|now) )+/, '').replace(/ please$/, '');
  const edit = (operation: 'add' | 'set', quantity: string, unit?: string) => validatePlan(plan('draft_order', {
    draft: { mode: 'edit', include_selection: false, lines: [{ operation, target: 'previous', item_query: null, quantity: Number(quantity), unit: unit || null }] } }));
  let m = new RegExp(`^(?:add|include|put in) (\\d+) more(?: (${UNIT_WORDS}))?(?: (?:of (?:it|that|this|those|them)|to (?:it|that|the draft|this draft|my draft|the order|the draft order)))?$`).exec(q);
  if (m && hasDraft) return edit('add', m[1], m[2]);
  m = new RegExp(`^(?:set|change|make|update) (?:the |its |that |this )?(?:draft |order |draft order )?(?:quantity|amount)(?: (?:of|for) (?:it|that|this|this item|that item))?(?: in the draft)? to (\\d+)(?: (${UNIT_WORDS}))?$`).exec(q);
  if (m && /\b(?:draft|order)\b/.test(q)) return edit('set', m[1], m[2]);
  m = new RegExp(`^make (?:it|that) (\\d+)(?: (${UNIT_WORDS}))?$`).exec(q);
  if (m && hasDraft) return edit('set', m[1], m[2]);
  return null;
}

// A small reported filter-word vocabulary only. Recorded names are fenced off before correction.
const FILTER_TYPOS: Record<string, string> = { cheyck: 'check', imprtant: 'important', tha: 'that', atatntion: 'attention' };
const canonicalFilterWords = (value: string) => value.replace(/\b(?:cheyck|imprtant|tha|atatntion)\b/g, word => FILTER_TYPOS[word]);
// Any leftover word outside this grammar goes to interpretation or clarification, never omission.
const FILLER = new Set(('show list display find give get tell me us all the a an any every everything anything items item ones one products product stock stocks ' +
  'supplies inventory entries entry equipment which what that those these them they are is were be with have has having do does we i there of in on for our my ' +
  'currently now right how many much count number total quantity quantities qty level levels remaining left hand units unit status their its also please just whose ' +
  'other rest still').split(' '));
const HEAD = /\b(?:items?|ones|stocks?|products?|supplies|equipment|entries|everything|anything|inventory)\b/;
const REFERENCE = /^(?:(?:all )?(?:of )?(?:them|these|those|it)|(?:these|those|the) (?:items|results|rows)|(?:the|this|that) list|the above|everything (?:listed|above|shown))$/;
const DRAFT_DIRECTIVE = /^(?:(?:please|can you|could you|then|and|now|so) )*(?:prepare|create|make|build|put together|start|generate|draft)(?: me| us)?(?: (?:an?|the|my|one))?(?: (?:new|unsaved|saved|local))*(?: (?:purchase|reorder))?(?: (?:order|draft))+(?: list)?(?: (?:for|of|with|from|including|containing|covering|out of) (.+))?$/;
const ORDER_NOW = [
  /^help me (?:in )?(?:find|finding)(?: out)? (?:the )?(?:potential )?(?:stocks?|items?|products?|supplies) (?:which|that) (?:i|we) should (?:order|reorder|restock)(?: (?:now|today|immediately|urgently|first|right now))*$/,
  /^(?:which|what) (?:(?:stocks?|items?|products|supplies|things) )?(?:should|do|must|need to|ought to) (?:i|we) (?:consider |think about )?(?:order|ordering|reorder|reordering|restock|restocking)(?: (?:now|today|soon|first|next|right now))?$/,
  /^what (?:needs|need) (?:to be )?(?:ordering|ordered|reordering|reordered|restocking|restocked)(?: (?:now|today|soon|first))?$/,
  /^(?:what|which items?) (?:is|are) (?:most )?urgent(?: to (?:order|reorder|restock))?$/,
  /^(?:show|list|give)(?: me)? (?:what|the items?|items|everything) (?:i|we) (?:should|need to|must) (?:order|reorder|restock)(?: (?:now|today|soon|first))?$/,
];
const SORT_RULES: [RegExp, SortOrder][] = [
  [/^(?:(?:sort|sorted|order|ordered|arrange|arranged|list|listed|show)(?: (?:them|it|these|those|the list|the results))? (?:alphabetically|by name|by item name|in alphabetical order|from a to z|a to z)|alphabetically|in alphabetical order|alphabetical order|a to z|from a to z|by name)$/, 'name'],
  [/^(?:(?:sort|sorted|order|ordered)(?: (?:them|it|these|those))? by (?:quantity|stock|stock level|count)(?: (?:ascending|lowest first|low to high|smallest first))?|lowest (?:quantity |stock )?first|least (?:quantity |stock )?first)$/, 'quantity_asc'],
  [/^(?:(?:sort|sorted|order|ordered)(?: (?:them|it|these|those))? by (?:quantity|stock|stock level|count) (?:descending|highest first|high to low|largest first|most first)|highest (?:quantity |stock )?first|most (?:quantity |stock )?first)$/, 'quantity_desc'],
  [/^(?:(?:sort|sorted|order|ordered)(?: (?:them|it|these|those))? by (?:shortfall|how much is missing|biggest shortfall|largest shortfall)|(?:largest|biggest) shortfall first)$/, 'shortfall'],
  [/^(?:(?:sort|sorted|order|ordered|rank|ranked)(?: (?:them|it|these|those))? by (?:priority|urgency)|most urgent first|in priority order|by priority)$/, 'priority'],
];
const FIELD = '(?:names?|quantities|quantity|status|statuses|stock levels?|units?|suppliers?|details|amounts?)';
const PRESENT = new RegExp(`^(?:(?:show|list|give|tell|display|include|with|and)(?: me)?(?: (?:their|the|its|each))? ${FIELD}(?:(?: and| or)? ${FIELD})*|(?:show|explain|tell me|say|include|and)(?: me)? (?:why|the reasons?)(?: (?:each|every|they|it|these|those|each one|each item|items?) (?:appears?|is|are|was|were|shows? up)(?: (?:in|on) (?:the |this )?(?:list|results|table))?)?)$`);
const FIELD_ONLY = new RegExp(`^(?:their |the )?${FIELD}$`);
const EXCLUDE_CUE = /^(?:(?:and|but) )?(?:excluding|exclude|except for|except|other than|apart from|leaving out|leave out|but not|not including|minus)(?: (.+))?$/;
const INCLUDE_CUE = /^(?:plus|also|and also|as well as|along with|in addition|additionally)(?: (.+))?$/;
const ONLY = /^(?:(?:now|then|ok|okay) )?(?:only|just)(?: (?:show|keep|list|give))?(?: me)?(?: the)? (.+)$/;
const OF_THOSE = /^(?:(?:of|from|among) (?:those|these|them|the list|that list)(?: (?:which|what|show|list|show me))?|(?:which|what) of (?:those|these|them)(?: are)?) (.+)$/;
const COMPARISONS: [RegExp, (m: RegExpExecArray) => Condition['quantity']][] = [
  [/ between (\d+) to (\d+) /, m => [{ op: 'gte', value: +m[1] }, { op: 'lte', value: +m[2] }]],
  [/ (?:less than|fewer than|lower than|under|below) (\d+) /, m => [{ op: 'lt', value: +m[1] }]],
  [/ (?:at most|no more than|not more than|up to|a maximum of|maximum of) (\d+) /, m => [{ op: 'lte', value: +m[1] }]],
  [/ (\d+) or (?:less|fewer|below|under) /, m => [{ op: 'lte', value: +m[1] }]],
  [/ (?:at least|no less than|not less than|a minimum of|minimum of) (\d+) /, m => [{ op: 'gte', value: +m[1] }]],
  [/ (\d+) or (?:more|above|over|greater) /, m => [{ op: 'gte', value: +m[1] }]],
  [/ (?:more than|greater than|over|above) (\d+) /, m => [{ op: 'gt', value: +m[1] }]],
  [/ (?:exactly|equal to|equals|precisely|only) (\d+) /, m => [{ op: 'eq', value: +m[1] }]],
  [new RegExp(` (?:with|having|have|has|that have|which have|that has|which has) (\\d+) (?:(?:${UNIT_WORDS}) )?(?:left|remaining|in stock|on hand) `), m => [{ op: 'eq', value: +m[1] }]],
];
const STATES: [RegExp, StockState[]][] = [
  [/ lowout /, ['low', 'out']],
  [/ (?:that are |which are |is |are )?below (?:their |the |its )?(?:recorded )?minimum(?: stock)?(?: levels?)? /, ['below_minimum']],
  [/ (?:that are |which are |is |are )?out of stock /, ['out']],
  [/ (?:that have |which have |that |which )?(?:run|ran) out /, ['out']],
  [/ (?:that are |which are |is |are )?(?:running low|low on stock|low in stock|low stock|low) /, ['low']],
  [/ (?:that are |which are |is |are )?(?:in stock|well stocked) /, ['in_stock']],
];

type Hints = { names?: readonly string[]; categories?: readonly string[] };
/** One condition clause: every word must be a recognised filter or filler, otherwise the clause is not understood. */
function parseCondition(clause: string, hints: Hints, restore: (s: string) => string): Condition | null {
  const original = restore(clause);
  let s = ` ${original} `;
  const c = condition();
  const take = (re: RegExp) => { const m = re.exec(s); if (m) s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/ {2,}/g, ' '); return m; };
  const suffixCategory = take(/ (?:in|from|under|within) (?:the )?((?!(?:supplier|vendor|brand)\b).+?) category /);
  if (suffixCategory) c.category = suffixCategory[1].trim();
  // Fence off named values before looking for stock, criticality or numbers:
  // “supplier Low Stock Limited” and “brand Above 3” are recorded names, not
  // filters. A trailing condition needs interpretation instead of becoming part
  // of that name or disappearing from the request.
  const marker = / (?:(?:that are |which are )?supplied by|(?:from|by|with) (?:the )?(?:supplier|vendor)(?: named| called)?|(?:with|of|from) (?:the )?brand(?: name)?|(?:(?:in|from|under) (?:the )?)?category(?: of| called| named)?|in(?: the)?(?= (?!(?:stock|total|hand|inventory|our|my|this|that|list|draft|table|low|out|running)\b)\S)) /g;
  const found = [...s.matchAll(marker)];
  for (const [index, match] of found.entries()) {
    const kind = /brand/.test(match[0]) ? 'brand' : /category|^ in /.test(match[0]) ? 'category' : 'supplier';
    const value = s.slice(match.index! + match[0].length, index + 1 < found.length ? found[index + 1].index : s.length).trim();
    if (!value || c[kind] !== null || /\b(?:(?:that|which) (?:are|have|has|is)|(?:with|having) (?:quantity|qty|stock(?: levels?)?))\b/.test(value)) return null;
    c[kind] = value;
  }
  if (found.length) s = `${s.slice(0, found[0].index)} `;
  if (take(/ (?:with |that have |which have )?(?:no|missing(?: a)?|without(?: a)?) (?:recorded )?supplier(?: recorded| name| set)? /)) c.missing_supplier = true;
  for (const [re, quantity] of COMPARISONS) for (let m = take(re); m; m = take(re)) c.quantity.push(...quantity(m));
  const attention = !!take(/ need(?:s|ing)? (?:attention|reordering|restocking) /);
  for (const [re, states] of STATES) for (let m = take(re); m; m = take(re)) for (const state of states) if (!c.stock.includes(state)) c.stock.push(state);
  // Attention is a low/out union only without a more specific stock predicate.
  if (attention && c.stock.includes('in_stock')) return null;
  if (attention && !c.stock.length) c.stock.push('low', 'out');
  if (take(/ non (?:critical|important|essential|life support)(?: equipment)? /)) c.critical = false;
  if (take(/ (?:marked |flagged )?(?:critical|important|essential|life support)(?: equipment)? /)) { if (c.critical === false) return null; c.critical = true; }
  if (!c.category) for (const name of [...(hints.categories || [])].sort((a, b) => b.length - a.length)) {
    // "wound-care items": a recorded category name used as an adjective before a head noun.
    const found = new RegExp(` (?:in |from )?(?:the )?${looseName(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (?=(?:category |section )?(?:items?|supplies|products|stock|equipment|ones) )`).exec(s);
    if (found) { c.category = name; s = s.slice(0, found.index) + ' ' + s.slice(found.index + found[0].length); break; }
  }
  if (c.quantity.length > 2 || [c.category, c.brand, c.supplier].some(v => v !== null && (!v || v.length > 160))) return null;
  const leftover = s.split(' ').filter(Boolean);
  if (leftover.some(word => !FILLER.has(word))) return null;
  const constrained = c.quantity.length || c.stock.length || c.critical !== null || c.category || c.brand || c.supplier || c.missing_supplier;
  if (!constrained && !/\b(?:all|everything|every)\b/.test(original)) return null;
  return c;
}

/**
 * Bounded local grammar for multi-part requests: comparisons, stock-state groups, critical equipment,
 * category/supplier/brand, exclusions, sorting, follow-ups and filtered drafts. Anything it cannot fully
 * account for returns null, so the request goes to the strict online contract or a clarification.
 */
export function parsePlan(text: string, hints: Hints = {}): Plan | null {
  if (!text.trim() || text.length > 600 || unsupportedNumber(text, [...(hints.names || []), ...(hints.categories || [])])) return null;
  const marked = text.replace(/[;?!]+|\.(?=\s|$)|,(?=\s)|:(?=\s)/g, ' | ');
  let q = ` ${looseName(marked)} `;
  // Recorded names containing number words or list separators are opaque. Do
  // not turn “Zero pressure gauge” into “0 pressure gauge” in an order line.
  // Explicit supplier/brand/category values need the same protection even when
  // those recorded metadata names are not present in the inventory-name hints.
  const declaredNames = [...q.matchAll(/ (?:(?:that are |which are )?supplied by|(?:from|by|with) (?:the )?(?:supplier|vendor)(?: named| called)?|(?:with|of|from) (?:the )?brand(?: name)?|(?:in|from|under) (?:the )?category(?: of| called| named)?) (.+?)(?= \| |$)/g)]
    .map(match => match[1].trim()).filter(value => !/\b(?:and|or|plus|also|that are|which are|with quantity|having quantity)\b/.test(value));
  const protectedNames = [...new Set([...(hints.names || []), ...(hints.categories || []), ...declaredNames].map(looseName))]
    .filter(n => /\b(?:and|or|plus|cheyck|imprtant|tha|atatntion)\b/.test(n) || numberWord.test(n)).sort((a, b) => b.length - a.length);
  protectedNames.forEach((name, index) => { q = q.split(` ${name} `).join(` zzname${index}zz `); });
  const restore = (value: string) => value.replace(/zzname(\d+)zz/g, (_, i) => protectedNames[Number(i)]).trim();
  q = spokenNumbers(canonicalFilterWords(q));
  // Courtesy belongs to the whole utterance, not to one list condition. Strip
  // only complete leading wrappers so an understood union cannot fall through
  // to the v2 suffix grammar and become an intersection.
  q = q.replace(/^ (?:(?:please|can you|could you|would you)(?: please)? )+/, ' ');
  q = q.replace(/^ (?:check|see|find out) (?:if|whether) there (?:is|are) /, ' show ');
  if (/\b(?:yesterday|tomorrow|last (?:week|month|year|time)|next (?:week|month|year)|history|historical|bought|sold|used|usage|consumption|forecast|expir\w*|prescribe|dosage|price|cost|spend|budget|apply|receive|received|send|delete|save|persist|commit|confirm)\b/.test(q)) return null;
  if (/\b(?:not|never|don't|dont|isn't|aren't|cannot|can't|instead|unless|if)\b/.test(q.replace(/\b(?:not including|but not|not more than|not less than)\b/g, ' '))) return null;
  // Protect names that contain a separator, compound stock states and ranges before splitting.
  q = q.replace(/ (?:running )?low(?: on| in)?(?: stock)? (?:or|and|and or) out of stock /g, ' lowout ').replace(/ out of stock (?:or|and|and or) (?:running )?low(?: on| in)?(?: stock)? /g, ' lowout ')
    .replace(/ between (\d+) and (\d+) /g, ' between $1 to $2 ')
    .replace(/ (?=(?:excluding|except|other than|apart from|but not|not including|sorted|sort by|(?:prepare|create|make|put together|draft) (?:(?:an?|the|my) )?(?:purchase |unsaved |new )?(?:order|draft))\b)/g, ' | ');
  // A shared predicate keeps the same item set: 'critical items ... and are low'
  // is an intersection; 'critical items and low-stock items' stays a list union.
  // Do not rewrite a possibly opaque supplier/brand/category or spoken item name.
  // Leave those tails unchanged for name resolution or strict online interpretation.
  if (!/\b(?:supplier|vendor|brand|category|supplied by)\b/.test(q) &&
      !new RegExp(`\\b\\d+ (?:${UNIT_WORDS})\\b`).test(q)) {
    q = q.replace(/ and (?=(?:(?:that|which) )?(?:is|are|has|have|needs?|requires?) )/g, ' ');
  }
  const segments: { text: string; cue: 'include' | 'and' | 'start' }[] = [];
  for (const part of q.split('|')) {
    part.split(/ (?=(?:and also|plus|as well as|along with|and|or) )/).forEach((piece, index) => {
      const text = piece.trim();
      if (text) segments.push({ text, cue: index === 0 ? 'start' : /^(?:and also|plus|as well as|along with)\b/.test(text) ? 'include' : 'and' });
    });
  }
  const conditions: Condition[] = [], exclude: Condition[] = [], lines: PlanLine[] = [];
  let sort: SortOrder = 'none', draft = false, reference = false, previous = false, mode: 'include' | 'exclude' = 'include', presenting = false, orderNow = false;
  for (const segment of segments) {
    let s = segment.text.replace(/^(?:(?:please|and|or|then|so|now|ok|okay) )+/, '').trim();
    if (segment.cue === 'include' || segment.cue === 'start') mode = 'include';
    const include = INCLUDE_CUE.exec(s);
    if (include) { mode = 'include'; s = (include[1] || '').trim(); if (!s) continue; }
    if (PRESENT.test(s) || presenting && FIELD_ONLY.test(s)) { presenting = true; continue; }
    presenting = false;
    const sorted = SORT_RULES.find(([re]) => re.test(s));
    if (sorted) { sort = sorted[1]; continue; }
    const directive = DRAFT_DIRECTIVE.exec(s);
    if (directive) {
      draft = true;
      const rest = (directive[1] || '').trim();
      if (!rest || REFERENCE.test(rest)) { reference = true; continue; }
      s = rest;
    }
    const excluded = EXCLUDE_CUE.exec(s);
    if (excluded) { mode = 'exclude'; s = (excluded[1] || '').trim(); if (!s) continue; }
    const only = ONLY.exec(s) || OF_THOSE.exec(s);
    if (only && mode === 'include') { previous = true; s = only[1].trim(); }
    if (mode === 'include' && ORDER_NOW.some(re => re.test(s))) { orderNow = true; conditions.push(condition({ stock: ['low', 'out'] })); continue; }
    const line = new RegExp(`^(\\d+) (?:more )?(?:(${UNIT_WORDS}) (?:of )?)?(?:the )?(.+)$`).exec(s);
    if (line && mode === 'include') {
      const quantity = Number(line[1]), name = restore(line[3]);
      if (!Number.isInteger(quantity) || quantity < 1 || !name || name.length > 160 || HEAD.test(name) && parseCondition(line[3], hints, restore)) return null;
      // A courteous ending is not part of an inferred item name. Unless the
      // exact full name is recorded, let interpretation resolve the whole
      // utterance rather than publishing a bogus “hand gloves for me” target.
      if (/(?:^| )(?:for me|for us|please|thanks|thank you)$/.test(name) &&
          !(hints.names || []).some(recorded => looseName(recorded) === looseName(name))) return null;
      lines.push({ operation: 'set', target: 'named', item_query: name, quantity, unit: line[2] || null });
      continue;
    }
    const parsed = parseCondition(s, hints, restore);
    if (parsed && (mode === 'exclude' || previous || HEAD.test(restore(s)))) { (mode === 'exclude' ? exclude : conditions).push(parsed); continue; }
    if (mode === 'exclude' && !parsed) {
      // "excluding gloves and masks": bare names, each resolved against the inventory and listed when removed.
      const name = restore(s).replace(/^(?:the|any|all) /, '').trim();
      if (!name || name.length > 160 || name.split(' ').length > 8 || /\b(?:show|list|prepare|create|make|order|draft|sort)\b/.test(name)) return null;
      exclude.push(condition({ item_queries: [name] }));
      continue;
    }
    return null;
  }
  try {
    if (draft || lines.length) {
      if (!draft) return null; // Quantities alone are not a request; prepare/create must be said.
      const scopeIsPrevious = !conditions.length && (reference || previous);
      const chosen = conditions.length || scopeIsPrevious ? selection(conditions.length ? conditions : [condition()], { scope: scopeIsPrevious || previous ? 'previous' : 'inventory', exclude, sort }) : null;
      if (!chosen && (exclude.length || sort !== 'none')) return null;
      return validatePlan(plan('draft_order', { selection: chosen, draft: { mode: 'new', lines, include_selection: !!chosen } }));
    }
    if (!conditions.length && !previous && !exclude.length && sort === 'none') return null;
    const scope = previous || !conditions.length ? 'previous' : 'inventory';
    return validatePlan(plan('inventory_query', { selection: selection(conditions.length ? conditions : [condition()], { scope, exclude, sort: orderNow && sort === 'none' ? 'priority' : sort }) }));
  } catch { return null; }
}
