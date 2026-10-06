/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../utils/sanitize.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, {
  module: mod, exports: mod.exports, URL,
  require: (name) => { if (name === '@/utils/logger') return { logger: { warn() {} } }; throw new Error(`Unexpected dependency: ${name}`); },
}, { filename: 'sanitize.ts' });
const { sanitizeString } = mod.exports;

test('free text keeps "word=value" content (F-7)', () => {
  assert.equal(sanitizeString('Dose once=daily'), 'Dose once=daily');
  assert.equal(sanitizeString('Ondansetron=4mg'), 'Ondansetron=4mg');
});

test('HTML tags and javascript: are still removed', () => {
  assert.equal(sanitizeString('<img src=x onerror=alert(1)>Gauze'), 'Gauze');
  assert.equal(sanitizeString('javascript:alert(1)'), 'alert(1)');
  assert.equal(sanitizeString('  x  ', 3), 'x');
});
