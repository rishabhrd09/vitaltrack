/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
function bridge(native) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../features/assistant/offlineVoice.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name === 'expo-modules-core') return { requireOptionalNativeModule: () => native };
    throw new Error(name);
  } });
  return module.exports.pocketVoice;
}
const pack = { pocketVoiceStatus() {}, downloadPocketVoice() {}, removePocketVoice() {}, speakPocket() {} };
test('progress is scoped to one speech request and subscriptions are released', async () => {
  let listener; let removed = 0; const seen = [];
  const voice = bridge({ ...pack, addListener(name, fn) { assert.equal(name, 'pocketSpeechProgress'); listener = fn; return { remove() { removed++; } }; },
    async speakPocketWithProgress(text, pace, id) {
      assert.equal(text, '32 active items'); assert.equal(pace, 0.9);
      listener({ id: 'old-request', stage: 'playing' }); listener({ id, stage: 'unknown' });
      listener({ id, stage: 'cpu_retry' }); listener({ id, stage: 'playing' });
    } });
  await voice.speak('32 active items', 0.9, message => seen.push(message));
  assert.equal(removed, 1); assert.equal(seen.length, 2);
  assert.match(seen[0], /CPU/); assert.match(seen[1], /Playing Alba/);
});
test('native failure releases the progress listener and remains visible', async () => {
  let removed = 0;
  const voice = bridge({ ...pack, addListener() { return { remove() { removed++; } }; },
    async speakPocketWithProgress() { throw new Error('Alba generation failed'); } });
  await assert.rejects(voice.speak('Hello'), /Alba generation failed/); assert.equal(removed, 1);
});
test('older Alba APK uses its original two-argument speech API', async () => {
  let args;
  const voice = bridge({ ...pack, async speakPocket(...value) { args = value; } });
  await voice.speak('Hello', 1); assert.deepEqual(args, ['Hello', 1]);
});
test('completed playback returns its actual route and volume without assuming sound was heard', async () => {
  const report = { output: 'Bluetooth audio', volumePercent: 60, audioSeconds: 2, frames: 48000 };
  const voice = bridge({ ...pack, addListener() { return { remove() {} }; }, async speakPocketWithProgress() { return report; },
    async checkPocketAudioOutput() { return report; }, async pocketAudioDiagnostic() { return '48000 rendered frames'; } });
  assert.equal(await voice.speak('Hello'), report);
  assert.equal(await voice.checkOutput(), report);
  assert.equal(await voice.diagnostics(), '48000 rendered frames');
});
test('generation progress uses bounded counts and ignores invalid or old request data', async () => {
  const seen = []; let listener;
  const voice = bridge({ ...pack, addListener(_, fn) { listener = fn; return { remove() {} }; },
    async speakPocketWithProgress(_, __, id) {
      listener({ id, stage: 'generating_cpu', frames: 25 });
      listener({ id, stage: 'generating', frames: 999999 });
      listener({ id: 'old', stage: 'decoding' });
      listener({ id, stage: 'decoding_cpu' });
    } });
  await voice.speak('Hello', 1, v => seen.push(v));
  assert.equal(seen.length, 3); assert.match(seen[0], /2\.0s generated/);
  assert.doesNotMatch(seen[1], /999999/); assert.match(seen[2], /Converting.*CPU/);
});
test('older APK has no sound-check API and no diagnostic upload', async () => {
  const voice = bridge(pack);
  assert.throws(() => voice.checkOutput(), /latest Android APK/);
  assert.equal(await voice.diagnostics(), '');
});
