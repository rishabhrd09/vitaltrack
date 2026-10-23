/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, JSON, Date, setTimeout, clearTimeout, process: { env: {} }, ...globals, require(name) { if (name in dependencies) return dependencies[name]; throw new Error('Unexpected import ' + name); } });
  return module.exports;
}
const policy = diagnostic => load('features/assistant/policy.ts', {}, { process: { env: diagnostic ? { EXPO_PUBLIC_VOICE_DIAGNOSTICS: '1' } : {} } });
const storage = value => ({ value: JSON.stringify(value), async getItem() { return this.value; }, async setItem(_, next) { this.value = next; } });
const preferences = (stored, diagnostic) => load('features/assistant/preferences.ts', { '@react-native-async-storage/async-storage': stored, './policy': policy(diagnostic) });

test('Whistle selection is diagnostic-only; loading or saving a normal build never enables online audio', async () => {
  assert.equal(policy(false).WHISTLE_LISTENING_ENABLED, false);
  assert.equal(policy(true).WHISTLE_LISTENING_ENABLED, true);
  const stored = storage({ enabled: true, microphone: true, inputProvider: 'whistle', audioOptIn: false, cloud: true, speechProvider: 'sarvam', sarvamSpeechOptIn: true });
  const diag = await preferences(stored, true).loadPreferences('owner');
  assert.equal(diag.inputProvider, 'whistle'); assert.equal(diag.speechProvider, 'sarvam'); assert.equal(diag.audioOptIn, false); assert.equal(diag.cloud, true);
  const normal = preferences(stored, false);
  const migrated = await normal.loadPreferences('owner');
  assert.equal(migrated.inputProvider, 'offline'); assert.equal(migrated.speechProvider, 'sarvam'); assert.equal(migrated.audioOptIn, false); assert.equal(migrated.cloud, true);
  await normal.savePreferences('owner', diag);
  assert.equal(JSON.parse(stored.value).inputProvider, 'offline'); assert.equal(JSON.parse(stored.value).sarvamSpeechOptIn, true);
});

test('Whistle readiness requires its own verified pack and disabled telemetry; Moonshine readiness is independent', () => {
  const registry = load('features/assistant/providers.ts', { './policy': policy(true), './sarvam': load('features/assistant/sarvam.ts') });
  const env = { supported: true, model: { checked: true, ready: false }, deviceVoice: { ready: true }, alba: { supported: false, checked: true, ready: false }, caps: { scopes: [], transcription_providers: [] }, whistle: { supported: true, checked: true, ready: true, telemetryDisabled: true } };
  const byId = e => Object.fromEntries(registry.listeners(e).map(p => [p.id, p]));
  assert.equal(byId(env).offline.readiness, 'needs_download'); assert.equal(byId(env).whistle.readiness, 'ready'); assert.equal(byId(env).whistle.online, false);
  assert.equal(byId({ ...env, whistle: { ...env.whistle, ready: false } }).whistle.readiness, 'needs_download');
  assert.match(byId({ ...env, whistle: { ...env.whistle, telemetryDisabled: false } }).whistle.detail, /blocked.*telemetry/);
  assert.equal(byId({ ...env, whistle: { ...env.whistle, supported: false } }).whistle.readiness, 'unavailable');
});

function bridge(diagnostic, native, globals = {}) {
  return load('features/assistant/offlineVoice.ts', { './policy': policy(diagnostic), 'expo-modules-core': { requireOptionalNativeModule: () => native }, 'react-native': { Platform: { OS: 'android' } } }, globals);
}
const pack = { whistleStatus: async () => ({ ready: true }), downloadWhistleModel() {}, removeWhistleModel() {}, prepareCapture() {}, startCapture() {}, finishCapture() {} };
test('Whistle bridge only transcribes completed local WAV and never substitutes another provider', async () => {
  const calls = [];
  const native = { ...pack, async transcribeWhistle(uri) { calls.push(uri); return { transcript: 'Two Ambu bags', requires_confirmation: true }; }, cancel() {} };
  assert.equal(bridge(false, native).whistleSupported, false);
  assert.throws(() => bridge(false, native).whistleVoice.transcribe('file:///take.wav'), /diagnostic APK/);
  const voice = bridge(true, native); assert.equal(voice.whistleSupported, true);
  assert.equal((await voice.whistleVoice.transcribe('file:///take.wav')).requires_confirmation, true);
  assert.deepEqual(calls, ['file:///take.wav']);
  assert.equal(bridge(true, { ...native, prepareCapture: undefined }).whistleSupported, false, 'WAV capture is required');
});

test('cancelled Whistle calls stop waiting and remove their timeout before another question', async () => {
  let timeout; let cleared = 0, cancels = 0;
  const voice = bridge(true, { ...pack, transcribeWhistle: () => new Promise(() => {}), cancel() { cancels++; } }, { setTimeout(fn) { timeout = fn; return 1; }, clearTimeout() { timeout = null; cleared++; } });
  const abort = new AbortController();
  const waiting = voice.whistleVoice.transcribe('file:///take.wav', abort.signal);
  abort.abort(); await assert.rejects(waiting, /recognition cancelled/);
  assert.equal(timeout, null); assert.equal(cleared, 1); assert.equal(cancels, 0, 'the turn owner already cancelled native work');
});

test('Whistle JS timeout bounds a lost native answer without an upload', async () => {
  let timeout; let cancels = 0;
  const voice = bridge(true, { ...pack, transcribeWhistle: () => new Promise(() => {}), cancel() { cancels++; } }, { setTimeout(fn, ms) { assert.equal(ms, 60000); timeout = fn; return 1; }, clearTimeout() {} });
  const waiting = voice.whistleVoice.transcribe('file:///take.wav'); timeout();
  await assert.rejects(waiting, /within 60 seconds.*No recording was uploaded/); assert.equal(cancels, 1);
});

test('Whistle pack operations use the app-wide lock shared with Moonshine and narration downloads', async () => {
  const downloads = load('features/assistant/downloads.ts'); let finish, progress;
  const pending = new Promise(resolve => { finish = resolve; });
  const operation = downloads.downloadPack('whistle', () => pending, fn => { progress = fn; return { remove() {} }; });
  progress({ downloaded: 10, total: 100 }); assert.equal(downloads.downloadSnapshot().kind, 'whistle'); assert.equal(downloads.downloadSnapshot().percent, 10);
  await assert.rejects(downloads.removePack('speech', async () => {}), /already running/);
  finish(); await operation; assert.equal(downloads.downloadSnapshot(), null);
});
