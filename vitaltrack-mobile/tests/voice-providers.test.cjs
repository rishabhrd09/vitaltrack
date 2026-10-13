/* eslint-env node */
// Voice provider registry: readiness, saved choices, consent and the provider in use stay separate.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, JSON, process: { env: {} }, require(name) { if (name in deps) return deps[name]; throw new Error('Unexpected import: ' + name); } });
  return module.exports;
}
const policy = load('features/assistant/policy.ts');
const sarvam = load('features/assistant/sarvam.ts');
const registry = load('features/assistant/providers.ts', { './policy': policy, './sarvam': sarvam });
const preferences = stored => load('features/assistant/preferences.ts', {
  '@react-native-async-storage/async-storage': { getItem: async () => stored === undefined ? null : JSON.stringify(stored), setItem: async () => {} }, './policy': policy });
const caps = (patch = {}) => ({ interpret: false, transcribe: false, speak: false, consented: false, consent_version: 'voice-2026-10-06', voice: '', scopes: [],
  transcription_providers: [], speech_providers: [], ...patch });
const env = (patch = {}) => ({ supported: true, model: { checked: true, ready: true }, deviceVoice: { ready: true }, alba: { checked: true, ready: true, supported: true }, caps: caps(), ...patch });
const defaults = { enabled: true, cloud: false, microphone: true, spokenReplies: true, audioOptIn: false, inputProvider: 'offline', speechProvider: 'device' };
const byId = list => Object.fromEntries(list.map(p => [p.id, p.readiness]));

test('readiness is derived from the phone and server, never from a saved choice', () => {
  assert.deepEqual(byId(registry.listeners(env())), { offline: 'ready', groq: 'unavailable' });
  assert.deepEqual(byId(registry.listeners(env({ model: { checked: true, ready: false }, caps: caps({ transcription_providers: ['groq'] }) }))), { offline: 'needs_download', groq: 'needs_consent' });
  assert.deepEqual(byId(registry.listeners(env({ supported: false }))).offline, 'unavailable');
  assert.equal(byId(registry.listeners(env({ supported:false, caps:caps({transcription_providers:['groq'],scopes:['groq_audio']}) }))).groq, 'unavailable');
  assert.deepEqual(byId(registry.interpreters(env({ caps: caps({ interpret: true, scopes: ['groq_text'], interpret_contracts: [1, 2, 3] }) }))), { local: 'ready', groq: 'ready' });
  assert.match(registry.interpreters(env({ caps: caps({ interpret: true, scopes: ['groq_text'], interpret_contracts: [1, 2] }) }))[1].detail, /older \(contract 2\)/);
  assert.match(registry.interpreters(env({ caps: caps({ interpret:true, scopes:['groq_text'], interpret_contracts:[1] }) }))[1].detail, /basic requests only \(contract 1\)/);
  assert.deepEqual(byId(registry.speakers(env(), defaults)), { device: 'ready', pocket: 'paused', sarvam: 'unavailable' });
  assert.equal(byId(registry.speakers(env({ caps: caps({ speech_providers: ['sarvam'], sarvam_application_available: true }) }), defaults)).sarvam, 'needs_consent');
  // A personal key never borrows the shared account.
  const personal = { ...defaults, sarvamKeySource: 'personal' };
  assert.equal(byId(registry.speakers(env({ caps: caps({ speech_providers: ['sarvam'], sarvam_application_available: true, scopes: ['sarvam_speech'], sarvam_personal_key: { usable: false } }) }), personal)).sarvam, 'needs_key');
});

test('unmatched advanced wording requires a contract that can express every condition', () => {
  for (const text of ['fewer than three units', 'less than 3', 'at most five', 'critical supplies', 'apart from gloves', 'excluding masks', 'order priority', 'a draft for those', 'order items supplied by Supplier A']) assert.equal(registry.minimumInterpretContract(text), 3, text);
  assert.equal(registry.minimumInterpretContract('find stock supplied by Supplier A'), 2);
  assert.equal(registry.minimumInterpretContract('Prepare an order with 5 boxes of masks'), 2);
  assert.equal(registry.minimumInterpretContract('Could you tell me how many gloves we have?'), 1);
});

test('an unmatched AND union with supplier conditions cannot be sent to contract 2', () => {
  assert.equal(registry.minimumInterpretContract('Could you show low-stock items and items from supplier Good Supplier?'), 3);
});

test('a chosen provider that cannot run is shown with its reason, never as working', () => {
  const chosen = registry.choicesFrom({ ...defaults, speechProvider: 'sarvam', sarvamSpeechOptIn: true, cloud: true, inputProvider: 'groq', audioOptIn: true });
  assert.deepEqual({ ...chosen }, { listening: 'groq', understanding: 'groq', speaking: 'sarvam', fallback: null });
  const withdrawn = env({ caps: caps({ speech_providers: ['sarvam'], sarvam_application_available: true, interpret: true, transcription_providers: ['groq'] }) });
  const speaking = registry.inUse(chosen.speaking, registry.speakers(withdrawn, defaults));
  assert.equal(speaking.ready, false); assert.match(speaking.reason, /^Needs your consent · /);
  assert.equal(registry.inUse(chosen.understanding, registry.interpreters(withdrawn)).ready, false);
  assert.equal(registry.inUse(chosen.listening, registry.listeners(withdrawn)).ready, false);
  assert.equal(registry.inUse('pocket', registry.speakers(env(), defaults)).reason, 'Paused · Paused until it passes the phone acceptance checks.');
});

test('old or unknown preferences migrate locally with no online opt-in', async () => {
  for (const [stored, expected] of [
    [undefined, { listening: 'offline', understanding: 'local', speaking: 'device', fallback: null }],
    [{ enabled: true, cloud: false, inputProvider: 'groq', audioOptIn: false, speechProvider: 'kokoro' }, { listening: 'offline', understanding: 'local', speaking: 'device', fallback: null }],
    [{ enabled: true, inputProvider: 'sarvam', audioOptIn: true, speechProvider: 'sarvam' }, { listening: 'offline', understanding: 'local', speaking: 'device', fallback: null }],
    [{ enabled: true, speechProvider: 'pocket', speechFallback: 'pocket' }, { listening: 'offline', understanding: 'local', speaking: 'device', fallback: null }],
    [{ enabled: true, speechProvider: 'sarvam', sarvamSpeechOptIn: true, speechFallback: 'device', cloud: 'yes' }, { listening: 'offline', understanding: 'local', speaking: 'sarvam', fallback: 'device' }],
  ]) {
    const loaded = await preferences(stored).loadPreferences('owner');
    if (stored) assert.equal(loaded.enabled, true, 'stored preferences were read, not replaced by defaults');
    assert.deepEqual({ ...registry.choicesFrom(loaded) }, expected, JSON.stringify(stored));
  }
  // Choices are per account: the storage key includes the owner.
  const keys = [];
  const prefs = load('features/assistant/preferences.ts', { '@react-native-async-storage/async-storage': { getItem: async key => { keys.push(key); return null; }, setItem: async () => {} }, './policy': policy });
  await prefs.loadPreferences('account-a'); await prefs.loadPreferences('account-b');
  assert.deepEqual(keys, ['carekosh-voice-settings-v2:account-a', 'carekosh-voice-settings-v2:account-b']);
});
