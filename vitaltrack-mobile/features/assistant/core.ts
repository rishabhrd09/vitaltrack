import { isLowStock, isOutOfStock, type Item } from '../../types';

export type IntentName = 'read_item' | 'summary' | 'low_stock' | 'out_of_stock' | 'close' | 'stop_speaking' | 'clarify' | 'unsupported_action';
export type Field = 'quantity' | 'supplier' | 'status';
export type Intent = { intent: IntentName; item_query: string | null; reference: 'named' | 'previous' | 'none'; fields: Field[] };
export type Answer = { title: string; text: string; items: Item[]; choices: Item[]; resolvedId?: string; timestamp: number; stale: boolean;
  statistics?: { label: string; value: number; tone: 'neutral' | 'low' | 'out' }[] };
export const command = (intent: IntentName): Intent => ({ intent, item_query: null, reference: 'none', fields: [] });
// Lower-case, unify apostrophes and drop the sentence punctuation that speech transcripts add.
// Used for questions and item names alike, so exact name matching stays consistent.
// Decimal points and thousands separators ("0.9%", "1,000") are kept.
const normalize = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'").replace(/[?!]+/g, ' ')
  .replace(/[.,;:]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();

export const commandExamples = [
  'Show me low stock', 'What are we running low on?', 'Which items are low?', 'Which items are out of stock?',
  'Give me a stock summary', 'How many hand gloves do we have?', 'How many hand gloves are there?', 'Check hand gloves',
  'What is the stock status of hand gloves?', 'Where do we normally order hand gloves from?',
  'How many hand gloves are left and who supplies them?', 'Who supplies those?', 'Close this overlay', 'Stop speaking',
];

// Whole-utterance list commands, looked up as said and again without articles ("show me all the low stock items").
// A Map, so words like "constructor" can never hit an inherited object key.
const phrases = (intent: IntentName, list: string[]) => list.map((phrase): [string, IntentName] => [phrase, intent]);
const LIST_COMMANDS = new Map<string, IntentName>([
  ...phrases('summary', ['summary', 'stock summary', 'show summary', 'show stock summary', 'show me a stock summary', 'give me a stock summary',
    'give me an inventory summary', 'inventory summary', 'summarize our stock', 'show me summary', 'show me stock summary', 'show inventory summary',
    'show me inventory summary', 'give me summary', 'give me stock summary', 'give me inventory summary', 'summary of stock', 'summary of inventory',
    'summarize stock', 'summarize inventory', 'summarise stock', 'summarise inventory', 'stock overview', 'inventory overview', 'stock status',
    'inventory status', 'what is stock status', 'check stock', 'check inventory', 'check summary', 'stock check', 'how is stock', 'how is stock looking',
    'how is inventory looking', 'how many items do we have', 'how many items are there', 'how many items']),
  ...phrases('low_stock', ['low stock', 'show low stock', 'show low stock items', 'show me low stock', 'show me low stock items',
    'what are we running low on', 'which items are low in stock', 'what is running low', 'low stock items', 'low stock list', 'low items',
    'items low on stock', 'items low in stock', 'items running low', 'items that are low', 'items that are running low', 'list low stock',
    'list low stock items', 'check low stock', 'what is low', 'what is low on stock', 'what is low in stock', 'what are we low on',
    'what items are low', 'what items are low on stock', 'what items are low in stock', 'what items are running low', 'which items are low',
    'which items are low on stock', 'which items are running low', 'which ones are low', 'is anything low', 'is anything low on stock',
    'is anything running low', 'is there anything low', 'is there anything running low', 'anything low', 'anything running low',
    'are there low stock items', 'are there items low on stock', 'are there items running low', 'how many items are low',
    'how many items are low on stock', 'how many items are running low', 'what needs restocking']),
  ...phrases('out_of_stock', ['out of stock', 'show out of stock', 'show out of stock items', 'show me out of stock items',
    'which items are out of stock', 'what is out of stock', 'show me out of stock', 'out of stock items', 'out of stock list', 'items out of stock',
    'list out of stock', 'list out of stock items', 'check out of stock', 'what items are out of stock', 'which ones are out of stock',
    'what are we out of', 'what have we run out of', 'what has run out', 'is anything out of stock', 'is there anything out of stock',
    'anything out of stock', 'are there items out of stock', 'how many items are out of stock']),
  ...phrases('close', ['close', 'close this overlay', 'close this overlay screen', 'close the assistant', 'close this screen', 'dismiss this overlay',
    'close assistant']),
  ...phrases('stop_speaking', ['stop speaking', 'stop', 'stop talking', 'stop reading']),
]);
const withoutArticles = (q: string) => q.replace(/\b(?:the|a|an|all|our|my|any)\b/g, ' ').replace(/\s+/g, ' ').trim();
// Summary, low-stock or out-of-stock list named inside a read form ("check low stock items"), never close/stop.
function listIntent(phrase: string): IntentName | undefined {
  const found = LIST_COMMANDS.get(phrase) ?? LIST_COMMANDS.get(withoutArticles(phrase));
  return found === 'summary' || found === 'low_stock' || found === 'out_of_stock' ? found : undefined;
}

// How people end a current-stock question: "... in stock", "... right now".
const TAIL = '(?: (?:left|remaining|available|in (?:our |the )?(?:stock|inventory)|on hand|in hand|in total|total|altogether|right now|currently|now|at the moment|today))*';
// The verb part between the item and the end: "do we have", "are there", "is left".
const HAVE = '(?:do (?:we|i) (?:still |currently )?(?:have|got)|have (?:we|i) (?:still )?(?:got|left)|(?:we|i) (?:still )?(?:have|got)|(?:are|is) there'
  + '|(?:are|is) (?:still )?(?:left|remaining|available|in stock|in (?:our |the )?inventory))';
// In the looser forms, a "name" holding these words is really a clause ("gloves should I order"), so no item is guessed.
const CLAUSE_WORDS = new Set(['i', 'we', 'you', 'they', 'he', 'she', 'should', 'would', 'could', 'will', 'shall', 'must', 'did', 'does', 'need',
  'needs', 'if', 'whether', 'when', 'why', 'what', 'which', 'who', 'where', 'how', 'is', 'are']);
type ReadPattern = { pattern: RegExp; fields: Field[]; loose: boolean };
const readForm = (source: string, fields: Field[], loose = false): ReadPattern => ({ pattern: new RegExp(`^${source}$`), fields, loose });
const READ_PATTERNS: ReadPattern[] = [
  readForm(`how (?:many|much) (.+?) ${HAVE}${TAIL}`, ['quantity'], true),
  readForm(`how (?:many|much) (.+?) (?:still )?(?:left|remaining|available|remain|remains)${TAIL}`, ['quantity'], true),
  readForm(`(?:what is|how is) (?:the |our )?(?:current )?(?:quantity|count) (?:of|for) (.+?)${TAIL}`, ['quantity']),
  readForm('(?:quantity|count) (?:of|for) (.+)', ['quantity']),
  readForm('(?:check|show|tell me) (?:me )?(?:the )?(?:quantity|count) (?:of|for) (.+)', ['quantity']),
  readForm('(?:who supplies|who is the supplier (?:of|for)|(?:what is |check |find |show (?:me )?)?(?:the )?supplier (?:of|for)) (.+)', ['supplier']),
  readForm('where do (?:we|i) (?:normally |usually )?(?:order|buy|get) (.+?)(?: from)?', ['supplier']),
  readForm('who do (?:we|i) (?:normally |usually )?(?:order|buy|get) (.+?) from', ['supplier']),
  readForm('(?:what is|how is|show|check) (?:me )?(?:the )?(?:current )?(?:stock )?status (?:of|for) (.+)', ['quantity', 'status']),
  readForm('(?:what is |how is |check |show (?:me )?)?(?:the |our )?(?:current )?(?:stock|stock level|inventory|inventory level) (?:of|for) (.+)', ['quantity', 'status']),
  readForm(`(?:do|have) (?:we|i) (?:still )?(?:have|stock|got) (?:any |some )?(.+?)${TAIL}`, ['quantity', 'status'], true),
  readForm(`(?:is|are) there (?:still )?(?:any |some )?(.+?)${TAIL}`, ['quantity', 'status'], true),
  // Loosest forms last: "how many hand gloves?", "check hand gloves".
  readForm(`how (?:many|much) (.+?)${TAIL}`, ['quantity'], true),
  readForm(`(?:check on|check|look up|find|show me|show) (?:the )?(.+?)(?: (?:stock|stock level|quantity|count|status))?${TAIL}`, ['quantity', 'status'], true),
];
// "of the", "any" and "boxes of" are how people say a name, not part of it.
const itemName = (raw: string) => raw.trim().replace(/^(?:of (?:the |our )?|the |our |any |some )/, '')
  .replace(/^(?:boxes|packs|packets|pairs|bottles|units|pieces|rolls|strips|tubes|vials|bags|cartons|cases|sachets) of /, '').trim();

function readPhrase(q: string): Intent | null {
  // "look up low stock" names a list, not an item; checked before any item form can split it.
  const list = listIntent(q) ?? listIntent(q.replace(/^(?:check on|check|look up|find|show me|show|list|give me|tell me) /, ''));
  if (list) return command(list);
  for (const { pattern, fields, loose } of READ_PATTERNS) {
    const raw = q.match(pattern)?.[1];
    if (!raw) continue;
    const name = itemName(raw);
    if (!name || name.length > 160) continue;
    if (loose) {
      const named = listIntent(name); // "how many low stock items"
      if (named) return command(named);
      if (name.split(' ').some(word => CLAUSE_WORDS.has(word))) return null;
    }
    const previous = /^(those|it|that|them|these|that item)$/.test(name);
    return { intent: 'read_item', item_query: previous ? null : name, reference: previous ? 'previous' : 'named', fields };
  }
  return null;
}

// Speech adds fillers ("okay", "um"), contractions and courtesy wrappers. Peel whole wrappers off the
// ends only; never fish a command out of a longer sentence.
function tidy(question: string): string {
  let q = ` ${question} `.replace(/ (?:um+|uh+|uhm|erm|hmm+)(?= )/g, '').trim();
  q = q.replace(/\b(what|who|where|how|that|there)'s\b/g, '$1 is').replace(/\bwhats\b/g, 'what is');
  for (let previous = ''; previous !== q;) {
    previous = q;
    q = q.replace(/^(?:ok|okay|um+|uh+|uhm|erm|er|hmm+|so|well|alright|all right|right|yeah|yes|hi|hey|hello|and|also)(?: |$)/, '')
      .replace(/^(?:hey |hello |hi )?care ?[ck]osh(?: |$)/, '').replace(/^please(?: |$)/, '')
      .replace(/^(?:can|could|would) you (?:please )?/, '').replace(/^(?:tell|show) me (?:please )?(?=how many |how much |what is |who supplies |where do we )/, '')
      .replace(/ (?:please|thanks|thank you|for me|okay|ok|right now|now|at the moment|today)$/, '').trim();
  }
  return q;
}

/** Intentionally conservative: match the entire utterance, not a keyword. */
export function parseLocal(text: string): Intent | null {
  let q = normalize(text);
  if (!q || q.length > 600) return command('clarify');
  if (/\b(yesterday|tomorrow|last (?:week|month|year|time)|previous (?:week|month|year)|history|ordered|bought|sold|used|prescribe|dosage)\b/.test(q)) return command('unsupported_action');
  if (/\b(not|never|don't|dont|cannot|can't|isn't|aren't|without|except|but|instead)\b/.test(q)) return command('clarify');
  q = tidy(q);
  if (!q) return command('clarify'); // only filler, e.g. "um" or "okay"
  // Reject action clauses, not product words ("dressing set" is a valid item).
  if (/(?:^|\b(?:and|then|also) )(?:please )?(?:delete|remove|update|change|increase|decrease|add|buy|send|create|set|order)\b/.test(q)) return command('unsupported_action');
  const direct = LIST_COMMANDS.get(q) ?? LIST_COMMANDS.get(withoutArticles(q));
  if (direct) return command(direct);
  const clauses = q.split(/,? and (?:also )?/);
  if (clauses.length === 2) {
    const first = readPhrase(clauses[0]), second = readPhrase(clauses[1]);
    // Only two reads of the same item combine; a list command never merges with anything.
    if (first?.intent === 'read_item' && second?.intent === 'read_item' && (second.reference === 'previous' ||
      (first.reference === 'named' && first.item_query === second.item_query))) {
      return { ...first, fields: [...new Set([...first.fields, ...second.fields])] };
    }
    return null;
  }
  if (/\b(and|or|then|also)\b/.test(q)) return null;
  return readPhrase(q);
}

// Conservative lexical suggestions, never a fuzzy auto-execution or guessed ID.
function itemWords(text: string): string[] {
  return normalize(text).replace(/[-_]/g, ' ').split(' ').map(word =>
    word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);
}
function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
function possibleItem(name: string, query: string): boolean {
  const words = itemWords(name), terms = itemWords(query);
  if (terms.length > 20 || terms.some(t => t.length > 40)) return false;
  return terms.every(t => words.some(w => w === t || (t.length >= 5 && w.length >= 5 && Math.abs(t.length - w.length) <= 1 && editDistance(t, w) <= 1)));
}

export function validateIntent(value: unknown): Intent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid intent.');
  const v = value as Intent;
  const names: IntentName[] = ['read_item', 'summary', 'low_stock', 'out_of_stock', 'close', 'stop_speaking', 'clarify', 'unsupported_action'];
  if (Object.keys(v).sort().join() !== 'fields,intent,item_query,reference' || !names.includes(v.intent) ||
      !['named', 'previous', 'none'].includes(v.reference) || !Array.isArray(v.fields) || v.fields.length > 3 ||
      new Set(v.fields).size !== v.fields.length || v.fields.some(f => !['quantity', 'supplier', 'status'].includes(f))) throw new Error('Invalid intent.');
  if (v.intent === 'read_item') {
    if (!v.fields.length || v.reference === 'none' || (v.reference === 'named' && (typeof v.item_query !== 'string' || !v.item_query.trim() || v.item_query.length > 160)) ||
        (v.reference === 'previous' && v.item_query !== null)) throw new Error('Invalid item reference.');
  } else if (v.item_query !== null || v.reference !== 'none' || v.fields.length) throw new Error('Unexpected intent parameters.');
  return v;
}

export function answerIntent(intent: Intent, source: Item[], timestamp: number, previousId?: string, stale = false): Answer {
  validateIntent(intent);
  const items = source.filter(i => i.isActive);
  const base = { items: [] as Item[], choices: [] as Item[], timestamp, stale };
  if (intent.intent === 'unsupported_action') return { ...base, title: 'Read-only assistant', text: 'I can show current stock and recorded suppliers. I cannot change stock, create orders, send messages or answer historical or medical questions.' };
  if (intent.intent === 'clarify') return { ...base, title: 'Please clarify', text: 'Ask one current-stock question, for example: How many hand gloves are left?' };
  if (intent.intent === 'read_item') {
    const exact = intent.reference === 'previous' ? items.filter(i => i.id === previousId) : items.filter(i => normalize(i.name) === normalize(intent.item_query!));
    const candidates = exact.length ? exact : intent.reference === 'named' ? items.filter(i => normalize(i.name).includes(normalize(intent.item_query!)) || possibleItem(i.name, intent.item_query!)) : [];
    if (exact.length !== 1) return { ...base, title: candidates.length ? 'Which item did you mean?' : 'Item not found',
      text: candidates.length ? 'Please choose the exact item below.' : 'I could not find an exact item. Try its full inventory name.', choices: candidates.slice(0, 20) };
    const item = exact[0];
    const parts: string[] = [];
    if (intent.fields.includes('quantity')) parts.push(Number.isFinite(item.quantity) ? `${item.quantity} ${item.unit || 'units'} remaining.` : 'Quantity information is incomplete. Please refresh.');
    if (intent.fields.includes('supplier')) parts.push(item.supplierName?.trim() ? `Recorded supplier: ${item.supplierName.trim()}.` : 'Supplier information is not recorded.');
    if (intent.fields.includes('status')) parts.push(!Number.isFinite(item.quantity) || !Number.isFinite(item.minimumStock) ? 'Stock status is incomplete. Please refresh.' : isOutOfStock(item) ? 'Out of stock.' : isLowStock(item) ? 'Low stock.' : 'Stock available.');
    return { ...base, title: item.name, text: `${item.name}: ${parts.join(' ')}`, items: [item], resolvedId: item.id };
  }
  if (items.some(i => !Number.isFinite(i.quantity) || !Number.isFinite(i.minimumStock))) {
    return { ...base, title: 'Incomplete stock information', text: 'Some quantities or stock thresholds are missing. Please refresh before requesting a summary.' };
  }
  const low = items.filter(isLowStock), out = items.filter(isOutOfStock);
  if (intent.intent === 'low_stock' || intent.intent === 'out_of_stock') {
    const selected = intent.intent === 'low_stock' ? low : out;
    const label = intent.intent === 'low_stock' ? 'Low stock' : 'Out of stock';
    return { ...base, title: label, text: `${label}: ${selected.length} ${selected.length === 1 ? 'item' : 'items'}. ${selected.slice(0, 3).map(i => `${i.name}: ${i.quantity} ${i.unit || 'units'}`).join('. ')}${selected.length > 3 ? '. See the full list on screen.' : ''}`, items: selected };
  }
  return { ...base, title: 'Stock summary', text: `${items.length} active items. ${low.length} low-stock items. ${out.length} out-of-stock items. Counts reflect the last successful refresh.`,
    statistics: [{ label: 'Active items', value: items.length, tone: 'neutral' }, { label: 'Low stock', value: low.length, tone: 'low' }, { label: 'Out of stock', value: out.length, tone: 'out' }] };
}

export function speechText(answer: Answer): string {
  const text = `${answer.stale ? 'Last known information. Stock may have changed since the last sync. ' : ''}${answer.text}`;
  return text.length <= 640 ? text : 'Your answer is ready on screen. It is too long to read in one reply.';
}
