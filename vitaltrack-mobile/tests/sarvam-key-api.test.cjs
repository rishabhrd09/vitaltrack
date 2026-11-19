
/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('key storage and narration carry disjoint authenticated payloads; invalidated sessions reject', async () => {
  const requests = []; let valid = true;
  const deps = { './api': { api: { assistantRequest: async (url, options, guard) => {
    guard(); requests.push({ url, ...options }); guard(); return {};
  } } }, './assistantSession': { assertSession() { if (!valid) throw new Error('Session changed'); } },
    '@/features/assistant/contracts': {}, '@/features/assistant/core': {} };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../services/assistant.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module, exports: module.exports, require: name => deps[name] });
  const service = module.exports; const session = { owner: 'synthetic' }; const signal = new AbortController().signal;
  await service.saveSarvamKey(session, 'synthetic-private-key', signal);
  assert.equal(requests[0].url, '/ai/sarvam-key');
  assert.deepEqual(JSON.parse(requests[0].body), { api_key: 'synthetic-private-key', storage_consent: true });
  await service.speak(session, 'Short answer.', signal, 'sarvam', 1, 'personal');
  assert.deepEqual(JSON.parse(requests[1].body), { text: 'Short answer.', provider: 'sarvam', pace: 1, credential_source: 'personal' });
  assert.equal(JSON.stringify(requests[1]).includes('synthetic-private-key'), false);
  await service.removeSarvamKey(session, signal);
  assert.equal(requests[2].method, 'DELETE'); assert.equal(requests[2].body, undefined);
  valid = false;
  await assert.rejects(service.saveSarvamKey(session, 'synthetic-private-key', signal), /Session changed/);
  await assert.rejects(service.speak(session, 'Short answer.', signal, 'sarvam', 1, 'personal'), /Session changed/);
  assert.equal(requests.length, 3);
});
