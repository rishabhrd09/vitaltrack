/* eslint-env node */
// V-20: spoken wording is prepared for every voice; screen text never changes.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) { if (name in deps) return deps[name]; throw new Error('Unexpected import: ' + name); } });
  return module.exports;
}
const core = load('features/assistant/core.ts', { '../../types': load('types/index.ts') });

test('V-20: units, symbols and medical sizes become words a voice can say', () => {
  for (const [written, spoken] of [
    ['Syringe 5ml', 'Syringe 5 millilitres'],
    ['Syringe 1 ml', 'Syringe 1 millilitre'],
    ['Saline 0.9% 500 ml', 'Saline 0.9 percent 500 millilitres'],
    ['Gloves (Large): 20 pairs', 'Gloves, Large: 20 pairs'],
    ['Suture 3/0', 'Suture 3 oh'],
    ['Dressing 10x10 cm', 'Dressing 10 by 10 centimetres'],
    ['N95 Mask', 'N95 Mask'],
    ['IV Cannula 20G', 'IV Cannula 20 gauge'],
    ['Foley catheter 16Fr', 'Foley catheter 16 French'],
    ['Chlorhexidine 2%', 'Chlorhexidine 2 percent'],
    ['Gauze 20 pcs, 1 pc spare', 'Gauze 20 pieces, 1 piece spare'],
    ['Paracetamol 500mg', 'Paracetamol 500 milligrams'],
    ['Infusion 5 ml/hr', 'Infusion 5 millilitres per hour'],
    ['Store below 25°C', 'Store below 25 degrees Celsius'],
    ['Cost ₹500 & tax', 'Cost 500 rupees and tax'],
    ['Masks/Gloves', 'Masks/Gloves'],
    ['10+ boxes', '10 plus boxes'],
    ['Bin #3', 'Bin number 3'],
    ['3 lines ready · 2 from your request, 1 suggested.', '3 lines ready, 2 from your request, 1 suggested.'],
    ['Patient’s “spare” kit…', 'Patient\'s "spare" kit.'],
    ['Twenty boxes left', 'Twenty boxes left'],
    ['Item 4G modem', 'Item 4G modem'],
    ['Sugar 50 g', 'Sugar 50 grams'],
  ]) assert.equal(core.speechFriendly(written), spoken, written);
});

test('speech preserves concentrations, fractions and recorded codes instead of inventing alternatives or suture sizes', () => {
  for (const text of ['Glucose 100mg/dL', 'Heparin 5000 IU/ml', 'SKU AB/CD', 'SKU AB12ml', 'SKU AB-12ml', 'SKU AB100mg/ml', '1/2', '1.5/0.5 mL', 'Vitamin 1mg/0.5ml']) {
    assert.equal(core.speechFriendly(text), text, text);
    assert.equal(core.speechText({ title: 'Item', text, items: [], choices: [], timestamp: 0, stale: false }), text);
  }
  assert.equal(core.speechFriendly('Cream 1% w/v'), 'Cream 1 percent w/v');
  assert.equal(core.speechFriendly('Suture 3/0.'), 'Suture 3 oh.');
  assert.equal(core.speechFriendly('Suture 3/0.5'), 'Suture 3/0.5');
});

test('V-20: the pronunciation map replaces whole words in any case only', () => {
  const map = { chlorhexidine: 'klor-HEX-ih-deen' };
  assert.equal(core.speechFriendly('Chlorhexidine 2% and chlorhexidines', map), 'klor-HEX-ih-deen 2 percent and chlorhexidines');
  assert.deepEqual({ ...core.PRONUNCIATIONS }, {}, 'starts empty; entries are added deliberately');
});

test('V-20: speech uses the spoken override and the 640-character limit after normalisation', () => {
  const answer = (text, extra = {}) => ({ title: 'T', text, items: [], choices: [], timestamp: 0, stale: false, ...extra });
  assert.equal(core.speechText(answer('Gloves · 20 pcs')), 'Gloves, 20 pieces');
  assert.equal(core.speechText(answer('Screen text', { spoken: 'Spoken (short)' })), 'Spoken, short');
  assert.match(core.speechText(answer('Gloves 2pcs', { stale: true })), /^Last known information\. .*Gloves 2 pieces$/);
  const long = Array.from({ length: 45 }, (_, i) => `Item ${i} 5ml`).join("; ");
  assert.ok(long.length < 640 && core.speechFriendly(long).length > 640, 'normalisation can lengthen text');
  assert.equal(core.speechText(answer(long)), 'Your answer is ready on screen. It is too long to read in one reply.');
});
