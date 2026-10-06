import { isLowStock, isOutOfStock, type Item } from '../../types';

export type IntentName = 'read_item' | 'summary' | 'low_stock' | 'out_of_stock' | 'close' | 'stop_speaking' | 'clarify' | 'unsupported_action';
export type Field = 'quantity' | 'supplier' | 'status';
export type Intent = { intent: IntentName; item_query: string | null; reference: 'named' | 'previous' | 'none'; fields: Field[] };
export type Answer = { title: string; text: string; items: Item[]; choices: Item[]; resolvedId?: string; timestamp: number; stale: boolean };
export const command = (intent: IntentName): Intent => ({ intent, item_query: null, reference: 'none', fields: [] });
const normalize = (text: string) => text.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[?!.]+$/g, '').replace(/\s+/g, ' ');

export const commandExamples = [
  'Show me low stock', 'What are we running low on?', 'Which items are out of stock?',
  'Give me a stock summary', 'How many hand gloves do we have?', 'What is the stock status of hand gloves?',
  'Where do we normally order hand gloves from?', 'How many hand gloves are left and who supplies them?',
  'Who supplies those?', 'Close this overlay', 'Stop speaking',
];

function readPhrase(q: string): Intent | null {
  const patterns: [RegExp, Field[]][] = [
    [/^how many (.+?) (?:are (?:left|remaining|available)|do we (?:have|currently have)|have we got)(?: (?:in (?:our )?stock|right now))?$/, ['quantity']],
    [/^how many (.+?) (?:left|remaining|available)(?: in (?:our )?stock)?$/, ['quantity']],
    [/^(?:what is|what's) (?:the |our )?(?:current )?(?:quantity|count) of (.+?)(?: (?:left )?in (?:our )?stock)?$/, ['quantity']],
    [/^(?:quantity|count) of (.+)$/, ['quantity']],
    [/^(?:check|show|tell me) (?:the )?(?:quantity|count) (?:of|for) (.+)$/, ['quantity']],
    [/^(?:who supplies|who is the supplier (?:of|for)|supplier (?:of|for)) (.+)$/, ['supplier']],
    [/^where do we (?:normally |usually )?(?:order|buy|get) (.+?)(?: from)?$/, ['supplier']],
    [/^(?:what is|what's|show|check) (?:the )?(?:current )?(?:stock )?status (?:of|for) (.+)$/, ['quantity', 'status']],
    [/^do we (?:have|stock) (.+?)(?: in stock)?$/, ['quantity', 'status']],
    [/^(?:stock|stock level) (?:of|for) (.+)$/, ['quantity', 'status']],
  ];
  for (const [pattern, fields] of patterns) {
    const name = q.match(pattern)?.[1]?.trim();
    if (!name || name.length > 160) continue;
    const previous = /^(those|it|that|them|these|that item)$/.test(name);
    return { intent: 'read_item', item_query: previous ? null : name, reference: previous ? 'previous' : 'named', fields };
  }
  return null;
}

/** Intentionally conservative: match the entire utterance, not a keyword. */
export function parseLocal(text: string): Intent | null {
  let q = normalize(text);
  if (!q || q.length > 600) return command('clarify');
  if (/\b(yesterday|tomorrow|last (?:week|month|year|time)|previous (?:week|month|year)|history|ordered|bought|sold|used|prescribe|dosage)\b/.test(q)) return command('unsupported_action');
  if (/\b(not|never|don't|dont|cannot|can't|isn't|aren't|without|except|but|instead)\b/.test(q)) return command('clarify');
  // Only remove whole courtesy wrappers. Never fish a command out of a longer sentence.
  q = q.replace(/^(?:hey |hello )?carekosh[, ]+/, '').replace(/^please /, '')
    .replace(/^(?:can|could|would) you (?:please )?/, '').replace(/^(?:tell|show) me (?:please )?(?=how many |what is |who supplies |where do we )/, '')
    .replace(/(?:,? please)$/, '');
  // Reject action clauses, not product words ("dressing set" is a valid item).
  if (/(?:^|\b(?:and|then|also) )(?:please )?(?:delete|remove|update|change|increase|decrease|add|buy|send|create|set|order)\b/.test(q)) return command('unsupported_action');
  const direct: Record<string, IntentName> = {
    'summary': 'summary', 'stock summary': 'summary', 'show summary': 'summary', 'show stock summary': 'summary',
    'low stock': 'low_stock', 'show low stock': 'low_stock', 'show low stock items': 'low_stock', 'show me low stock': 'low_stock', 'show me low stock items': 'low_stock',
    'out of stock': 'out_of_stock', 'show out of stock': 'out_of_stock', 'show out of stock items': 'out_of_stock', 'show me out of stock items': 'out_of_stock',
    'close': 'close', 'close this overlay': 'close', 'close this overlay screen': 'close',
    'stop speaking': 'stop_speaking', 'stop': 'stop_speaking',
    'show me a stock summary': 'summary', 'give me a stock summary': 'summary',
    'give me an inventory summary': 'summary', 'inventory summary': 'summary', 'summarize our stock': 'summary',
    'what are we running low on': 'low_stock', 'which items are low in stock': 'low_stock', 'what is running low': 'low_stock',
    'which items are out of stock': 'out_of_stock', 'what is out of stock': 'out_of_stock', 'show me out of stock': 'out_of_stock',
    'close the assistant': 'close', 'close this screen': 'close', 'dismiss this overlay': 'close',
  };
  if (direct[q]) return command(direct[q]);
  const clauses = q.split(/,? and (?:also )?/);
  if (clauses.length === 2) {
    const first = readPhrase(clauses[0]), second = readPhrase(clauses[1]);
    if (first && second && (second.reference === 'previous' ||
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
  return { ...base, title: 'Stock summary', text: `${items.length} active items. ${low.length} low-stock items. ${out.length} out-of-stock items. Counts reflect the last successful refresh.` };
}

export function speechText(answer: Answer): string {
  const text = `${answer.stale ? 'Last known information. Stock may have changed since the last sync. ' : ''}${answer.text}`;
  return text.length <= 640 ? text : 'Your answer is ready on screen. It is too long to read in one reply.';
}
