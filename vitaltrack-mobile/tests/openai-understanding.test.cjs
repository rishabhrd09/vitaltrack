/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, JSON, process: { env: {} }, require(name) {
    if (name in dependencies) return dependencies[name];
    throw new Error('Unexpected import: ' + name);
  } });
  return module.exports;
}
const policy = load('features/assistant/policy.ts');

test('legacy preferences choose only Groq and explicit text choices never alter listening or speaking', async () => {
  let saved = { enabled: true, cloud: true, audioOptIn: true, inputProvider: 'groq', speechProvider: 'sarvam', sarvamSpeechOptIn: true };
  let written;
  const prefs = load('features/assistant/preferences.ts', { './policy': policy,
    '@react-native-async-storage/async-storage': { getItem: async () => JSON.stringify(saved), setItem: async (_, value) => { written = JSON.parse(value); } } });
  const old = await prefs.loadPreferences('synthetic');
  assert.equal(old.understandingProvider, 'groq');
  assert.equal(old.inputProvider, 'groq'); assert.equal(old.speechProvider, 'sarvam');
  await prefs.savePreferences('synthetic', { ...old, understandingProvider: 'openai' });
  assert.equal(written.understandingProvider, 'openai'); assert.equal(written.inputProvider, 'groq'); assert.equal(written.speechProvider, 'sarvam');
  saved = { ...written, cloud: false };
  assert.equal((await prefs.loadPreferences('synthetic')).understandingProvider, 'local', 'disabled cloud cannot be revived by an old OpenAI choice');
  saved = { ...written, understandingProvider: 'unknown-provider' };
  const invalid = await prefs.loadPreferences('synthetic');
  assert.equal(invalid.cloud, false); assert.equal(invalid.understandingProvider, 'local');
});

test('OpenAI readiness distinguishes server setup, saved key, own consent and usable contracts', () => {
  const registry = load('features/assistant/providers.ts', { './policy': policy, './sarvam': load('features/assistant/sarvam.ts') });
  const caps = { interpret: false, scopes: [], interpretation_providers: [], interpret_contracts: [1, 2, 3],
    transcription_providers: [], speech_providers: [], openai_personal_key: { setup_available: true, configured: false, usable: false },
    openai_model: { id: 'gpt-5.4-mini-2026-03-17', label: 'GPT-5.4 mini' } };
  const env = { caps, server: { state: 'loaded' } };
  const status = () => registry.interpreters(env).find(p => p.id === 'openai').readiness;
  assert.equal(status(), 'needs_key');
  caps.openai_personal_key = { setup_available: true, configured: true, usable: true }; caps.interpretation_providers = ['openai'];
  caps.scopes = ['groq_text', 'sarvam_speech']; assert.equal(status(), 'needs_consent');
  caps.scopes.push('openai_text'); assert.equal(status(), 'ready');
  caps.interpret_contracts = [1, 2]; assert.equal(status(), 'unavailable');
  env.server = { state: 'failed' }; assert.equal(status(), 'unavailable');
  const chosen = registry.choicesFrom({ cloud: true, understandingProvider: 'openai', inputProvider: 'groq', audioOptIn: true, speechProvider: 'sarvam', sarvamSpeechOptIn: true });
  assert.equal(chosen.listening, 'groq'); assert.equal(chosen.understanding, 'openai'); assert.equal(chosen.speaking, 'sarvam');
});

test('key enrollment, access checks and interpretation use separate owner-guarded payloads with no credential reuse', async () => {
  const requests = []; let valid = true;
  const service = load('services/assistant.ts', {
    './api': { api: { assistantRequest: async (url, options, guard) => { guard(); requests.push({ url, ...options }); return {}; } } },
    './assistantSession': { assertSession() { if (!valid) throw new Error('Session changed'); } },
    '@/features/assistant/contracts': { validatePlan: value => value }, '@/features/assistant/core': {},
  });
  const session = { owner: 'synthetic' }, signal = new AbortController().signal;
  await service.saveOpenAIKey(session, 'synthetic-private-key', signal);
  assert.deepEqual(JSON.parse(requests[0].body), { api_key: 'synthetic-private-key', storage_consent: true });
  assert.equal(requests[0].url, '/ai/openai-key');
  await service.checkOpenAIKey(session, signal);
  assert.equal(requests[1].url, '/ai/openai-key/check'); assert.equal(requests[1].method, 'POST'); assert.equal(requests[1].body, undefined);
  await service.interpretPlan(session, 'Which supplies need review?', true, signal, 'openai');
  assert.deepEqual(JSON.parse(requests[2].body), { question: 'Which supplies need review?', has_previous_item: true, contract_version: 3, provider: 'openai' });
  assert.equal(JSON.stringify(requests[2]).includes('synthetic-private-key'), false);
  await service.interpretPlan(session, 'A familiar Groq request', false, signal);
  assert.deepEqual(JSON.parse(requests[3].body), { question: 'A familiar Groq request', has_previous_item: false, contract_version: 3 });
  await service.removeOpenAIKey(session, signal); assert.equal(requests[4].method, 'DELETE'); assert.equal(requests[4].body, undefined);
  valid = false;
  await assert.rejects(service.checkOpenAIKey(session, signal), /Session changed/);
  await assert.rejects(service.saveOpenAIKey(session, 'synthetic-private-key', signal), /Session changed/);
  assert.equal(requests.length, 5);
});
