/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function load(file, dependencies = {}) {
  const module = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2021 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Map, Set, Date, Number, JSON, Promise, require(name) { if (name in dependencies) return dependencies[name]; throw new Error(name); } });
  return module.exports;
}
const id = '00000000-0000-4000-8000-000000000123';
function setup() {
  let current = { owner: 'synthetic-a', epoch: 1 }, pause, response;
  const stored = new Map(), requests = [];
  class ApiClientError extends Error { constructor(status) { super('Failed'); this.status = status; } }
  const api = { assistantRequest: async (url, options, assertReady) => { assertReady(); requests.push({ url, options }); if (response !== undefined) return response; throw new ApiClientError(404); } };
  const storage = { getItem: async key => { if (pause) await pause; return stored.get(key) || null; }, setItem: async (key, value) => stored.set(key, value), removeItem: async key => stored.delete(key) };
  const assertSession = s => { if (s.owner !== current.owner || s.epoch !== current.epoch) throw new Error('Session changed'); };
  const service = load('features/supplyReview/submissionRecovery.ts', {
    '@react-native-async-storage/async-storage': storage, '@/services/api': { api, ApiClientError }, '@/services/assistantSession': { assertSession }, './contracts': load('features/supplyReview/contracts.ts'),
  });
  return { service, stored, requests, session: { ...current }, switchOwner() { current = { owner: 'synthetic-b', epoch: 2 }; }, pause(p) { pause = p; }, respond(value) { response = value; } };
}
test('durable recovery contains only an owner-bound identifier, never a replayable order', async () => {
  const h = setup(); await h.service.rememberSubmission(h.session, id);
  assert.equal(h.stored.size, 1); assert.ok([...h.stored.keys()][0].endsWith('synthetic-a'));
  const value = JSON.parse([...h.stored.values()][0]); assert.deepEqual(Object.keys(value).sort(), ['created_at', 'local_id']); assert.equal(value.local_id, id);
  await assert.rejects(h.service.rememberSubmission(h.session, '00000000-0000-4000-8000-000000000124'), /reconciliation/);
  assert.equal((await h.service.pendingSubmission(h.session)).local_id, id);
  await h.service.forgetSubmission(h.session, '00000000-0000-4000-8000-000000000124'); assert.equal(h.stored.size, 1);
  await h.service.forgetSubmission(h.session, id); assert.equal(h.stored.size, 0);
});
test('a lookup miss is read-only and retains its pointer; owner switching rejects late storage work', async () => {
  const h = setup(); await h.service.rememberSubmission(h.session, id);
  assert.equal(await h.service.findSubmission(h.session, id, new AbortController().signal), null);
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].options.method, 'GET'); assert.equal(h.stored.size, 1);
  let finish; h.pause(new Promise(resolve => { finish = resolve; }));
  const pending = h.service.pendingSubmission(h.session); await Promise.resolve(); await Promise.resolve(); h.switchOwner(); finish();
  await assert.rejects(pending, /Session changed/); assert.equal(h.stored.size, 1);
});

test('explicit resolution uses the fenced route and verifies its outcome before the caller may clear a pointer', async () => {
  const h = setup(); await h.service.rememberSubmission(h.session, id); const signal = new AbortController().signal;
  for (const invalid of [{ state: 'unknown', order: null }, { state: 'closed', order: {} }, { state: 'saved', order: { id: 'x' } }]) {
    h.respond(invalid); await assert.rejects(h.service.resolveSubmission(h.session, id, signal), /could not be verified/); assert.equal(h.stored.size, 1);
  }
  h.respond({ state: 'closed', order: null }); assert.equal((await h.service.resolveSubmission(h.session, id, signal)).state, 'closed');
  assert.equal(h.stored.size, 1); assert.ok(h.requests.every(r => r.url.endsWith('/' + id + '/resolve') && r.options.method === 'POST' && !r.options.body));
});
