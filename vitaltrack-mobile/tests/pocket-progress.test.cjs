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
