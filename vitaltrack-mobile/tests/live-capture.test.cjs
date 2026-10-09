const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, { module, exports: module.exports, Date, require(name) {
    if (name in dependencies) return dependencies[name];
    throw new Error('Unexpected dependency ' + name);
  }, ...globals });
  return module.exports;
}

test('native adapter delivers only the current take and waits for asynchronous mic startup', async () => {
  let listener, id, release;
  const starting = new Promise(resolve => { release = resolve; });
  const native = { prepareCapture: async (take, preview) => { id = take; assert.equal(preview, true); return { uri: 'file:///capture.wav' }; },
    startCapture: async () => { await starting; return true; }, finishCapture: async () => ({ uri: 'file:///capture.wav' }),
    addListener: (_, fn) => { listener = fn; return { remove() {} }; } };
  const voice = load('features/assistant/offlineVoice.ts', { 'expo-modules-core': { requireOptionalNativeModule: () => native }, 'react-native': { Platform: { OS: 'android' } } });
  const recorder = voice.createLiveRecorder(); const seen = [];
  recorder.configure(true); recorder.subscribe(e => seen.push(e.transcript));
  await recorder.prepareToRecordAsync();
  listener({ id: 'old-take', transcript: 'Wrong account' });
  listener({ id, transcript: 'Hand gloves' });
  const start = recorder.record({ forDuration: 28 }); assert.equal(recorder.isRecording, false);
  release(); await start; assert.equal(recorder.isRecording, true);
  await recorder.stop(); listener({ id, transcript: 'Late words' });
  assert.deepEqual(seen, ['Hand gloves']); assert.equal(recorder.isRecording, false);
});

test('cancelling while native start is pending stops and discards before another take', async () => {
  let release; const started = new Promise(resolve => { release = resolve; });
  let stops = 0, discarded = 0;
  const recorder = { uri: 'file:///capture.wav', isRecording: false, prepareToRecordAsync: async () => {},
    record: async () => { await started; recorder.isRecording = true; }, stop: async () => { stops++; recorder.isRecording = false; } };
  const { MicrophoneCapture } = load('features/assistant/capture.ts');
  const capture = new MicrophoneCapture(recorder, async () => {}, async () => { discarded++; });
  const start = capture.start(async () => {});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  capture.cancel(); assert.equal(await capture.start(async () => {}), false);
  release(); assert.equal(await start, false);
  assert.equal(stops, 1); assert.equal(discarded, 1); assert.equal(recorder.isRecording, false); assert.equal(capture.phase, 'idle');
});

for (const [uri, name, mime] of [['file:///take.wav','question.wav','audio/wav'],['file:///take.m4a','question.m4a','audio/mp4']]) {
  test('authenticated transcription uploads the actual audio format: ' + mime, async () => {
    let body; const parts = [];
    const service = load('services/assistant.ts', { './api': { api: { assistantRequest: async (_, request, check) => { check(); body = request.body; return { transcript: 'Synthetic' }; } } },
      './assistantSession': { assertSession() {} }, '@/features/assistant/contracts': { validateSpecification: x => x }, '@/features/assistant/core': { validateIntent: x => x } },
    { FormData: class { append(...args) { parts.push(args); } } });
    await service.transcribe({ owner: 'test' }, uri, new AbortController().signal);
    assert.ok(body); assert.equal(parts[0][0], 'file');
    assert.equal(parts[0][1].name, name); assert.equal(parts[0][1].type, mime); assert.equal(parts[0][1].uri, uri);
  });
}
