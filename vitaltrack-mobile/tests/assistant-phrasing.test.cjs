/* eslint-env node */
// Spoken phrasing: fillers, transcript punctuation and everyday variations reach the same read-only commands,
// while negation, history, actions and multi-item questions are still refused.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: name => {
    if (name in dependencies) return dependencies[name];
    throw new Error('Unexpected dependency: ' + name);
  }, Date, Set, Map, WeakMap });
  return mod.exports;
}
const core = load('features/assistant/core.ts', { '../../types': load('types/index.ts') });
const item = (id, name, quantity = 18) => ({ id, name, quantity, minimumStock: 5, unit: 'pairs', isActive: true, isCritical: false });

test('exact inventory names fence safety words without permitting instructions or history', () => {
  for (const name of ['Used needle box', 'Stock history folder', 'Mask without valve', 'Not sterile gauze']) {
    const intent = core.parseLocal(`How many ${name} are left?`, [name]);
    assert.equal(intent?.intent, 'read_item');
    assert.equal(core.answerIntent(intent, [item('i', name)], 100).resolvedId, 'i');
    assert.ok(['clarify', 'unsupported_action'].includes(core.parseLocal(`Delete ${name}`, [name])?.intent));
    assert.ok(['clarify', 'unsupported_action'].includes(core.parseLocal(`Do not show ${name}`, [name])?.intent));
    assert.equal(core.parseLocal(`How many ${name} did we use last week?`, [name])?.intent, 'unsupported_action');
  }
  assert.equal(core.parseLocal('How many used needle box are left?')?.intent, 'unsupported_action');
});

test('item questions accept everyday spoken forms', () => {
  const cases = {
    'How many hand gloves are there?': 'hand gloves',
    'How many hand gloves?': 'hand gloves',
    'How many hand gloves we have': 'hand gloves',
    'How much saline is left?': 'saline',
    'How many hand gloves do we have left in stock right now?': 'hand gloves',
    'How many hand gloves remain?': 'hand gloves',
    'How many pairs of hand gloves do we have?': 'hand gloves',
    'How many of the hand gloves are left?': 'hand gloves',
    'Okay, how many hand gloves do we have?': 'hand gloves',
    'Um, how many, uh, hand gloves do we have?': 'hand gloves',
    'Hey CareKosh, how many hand gloves are there?': 'hand gloves',
    "What's the stock of hand gloves?": 'hand gloves',
    'Check hand gloves': 'hand gloves',
    'Check on the hand gloves, please.': 'hand gloves',
    'Is there any saline left?': 'saline',
    'Are there any hand gloves in stock?': 'hand gloves',
    'Do we have any hand gloves left?': 'hand gloves',
    "Who's the supplier for hand gloves?": 'hand gloves',
  };
  for (const [text, name] of Object.entries(cases)) {
    const intent = core.parseLocal(text);
    assert.equal(intent?.intent, 'read_item', text);
    assert.equal(intent.item_query, name, text);
  }
  assert.equal(core.parseLocal('And who supplies them?')?.reference, 'previous');
});

test('list commands accept everyday spoken forms', () => {
  const cases = {
    'Low stock items': 'low_stock', 'What items are low?': 'low_stock', 'Which items are running low?': 'low_stock',
    'Okay, show me all the low stock items.': 'low_stock', 'Is anything running low?': 'low_stock', 'Check low stock items now': 'low_stock',
    "What's out of stock?": 'out_of_stock', 'Are there any items out of stock?': 'out_of_stock', 'What have we run out of?': 'out_of_stock',
    'Stock summary, please': 'summary', 'Check stock': 'summary', 'How many items do we have?': 'summary',
    'Stop talking': 'stop_speaking',
  };
  for (const [text, intent] of Object.entries(cases)) assert.equal(core.parseLocal(text)?.intent, intent, text);
});

test('safety rules still win over the new phrasings', () => {
  // Negation, history and action words are checked before any wording is tidied.
  assert.equal(core.parseLocal("Um, don't show low stock")?.intent, 'clarify');
  assert.equal(core.parseLocal('Okay, delete hand gloves')?.intent, 'unsupported_action');
  assert.equal(core.parseLocal('And set hand gloves to 20')?.intent, 'unsupported_action');
  assert.equal(core.parseLocal('Check hand gloves and delete them')?.intent, 'unsupported_action');
  assert.equal(core.parseLocal('How many hand gloves did we use last week?')?.intent, 'unsupported_action');
  // A "name" that is really a clause is never guessed as an item.
  for (const q of ['How many gloves should I order?', 'How many gloves do we need?', 'Check if we need gloves', 'How much is a box of gloves?']) {
    assert.equal(core.parseLocal(q), null, q);
  }
  // Two items, or a list plus an item, never become one answer.
  for (const q of ['Check gloves and masks', 'Check low stock and who supplies them', 'Show low stock and show summary']) assert.equal(core.parseLocal(q), null, q);
  // Only filler asks for a question; inherited object keys are not commands.
  assert.equal(core.parseLocal('Um.')?.intent, 'clarify');
  assert.equal(core.parseLocal('constructor'), null);
});

test('partial names still ask before answering', () => {
  const answer = core.answerIntent(core.parseLocal('How many gloves are there?'), [item('a', 'Hand Gloves')], 100);
  assert.equal(answer.resolvedId, undefined);
  assert.equal(answer.choices.length, 1);
});

test('transcript punctuation does not break exact names', () => {
  const inventory = [item('s', 'Saline 0.9%, 500 ml', 4), item('t', '1,000 ml bags', 2)];
  assert.equal(core.answerIntent(core.parseLocal('How many saline 0.9% 500 ml do we have?'), inventory, 100).resolvedId, 's');
  assert.equal(core.answerIntent(core.parseLocal('Check 1,000 ml bags.'), inventory, 100).resolvedId, 't');
});
