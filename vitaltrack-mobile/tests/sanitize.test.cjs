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
const { sanitizeString, sanitizeName, sanitizeContact, escapeHtml } = mod.exports;

test('free text keeps "word=value" content (F-7)', () => {
  assert.equal(sanitizeString('Dose once=daily'), 'Dose once=daily');
  assert.equal(sanitizeString('Ondansetron=4mg'), 'Ondansetron=4mg');
});

test('legitimate names and supplier contacts are not silently rewritten', () => {
  assert.equal(sanitizeName(`Ryle's tube & gauze; "large"`), `Ryle's tube & gauze; "large"`);
  assert.equal(sanitizeContact('asha_k+orders@example.com / Ext #2, Delhi'), 'asha_k+orders@example.com / Ext #2, Delhi');
  assert.equal(sanitizeContact('आशा: +91 12345'), 'आशा: +91 12345');
});

test('preserving punctuation still removes markup and escapes HTML output', () => {
  assert.equal(sanitizeName('<b>Gauze & tape</b>'), 'Gauze & tape');
  assert.equal(sanitizeContact('<b>asha_k@example.com</b>'), 'asha_k@example.com');
  assert.equal(escapeHtml(`Ryle's tube & "gauze"`), 'Ryle&#039;s tube &amp; &quot;gauze&quot;');
});

test('HTML tags and javascript: are still removed', () => {
  assert.equal(sanitizeString('<img src=x onerror=alert(1)>Gauze'), 'Gauze');
  assert.equal(sanitizeString('javascript:alert(1)'), 'alert(1)');
  assert.equal(sanitizeString('  x  ', 3), 'x');
});
