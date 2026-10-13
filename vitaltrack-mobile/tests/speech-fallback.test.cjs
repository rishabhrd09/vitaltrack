/* eslint-env node */
// Optional offline fallback for online narration: explicit, read-once, never a second paid request.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}, context = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, { module: mod, exports: mod.exports, JSON, ...context,
    require: (name) => { if (name in dependencies) return dependencies[name]; throw new Error(`Unexpected dependency: ${name}`); } });
  return mod.exports;
}
const { narrateWithFallback } = load('features/assistant/narration.ts');

function scenario(options = {}) {
  const { online, ready = true, current = () => true } = options;
  const fallback = 'fallback' in options ? options.fallback : 'device'; // an explicit undefined means "off"
  const calls = { online: 0, offline: [], fallbackNotices: [] };
  const run = narrateWithFallback({
    speakOnline: async onStarted => { calls.online++; await online(onStarted); },
    speakOffline: async voice => { calls.offline.push(voice); },
    fallback, fallbackReady: () => ready, stillCurrent: current,
    onFallback: (voice, reason) => calls.fallbackNotices.push([voice, reason]),
  });
  return { calls, run };
}
const timeout = async () => { throw new Error('Sarvam speech timed out. Retry or select device voice.'); };

test('online success never touches the offline voice', async () => {
  const { calls, run } = scenario({ online: async started => { started(); } });
  assert.deepEqual({ ...(await run) }, { voice: 'online' });
  assert.equal(calls.online, 1); assert.deepEqual(calls.offline, []);
});

test('an online failure before any audio reads the same answer once with the chosen offline voice', async () => {
  const { calls, run } = scenario({ online: timeout });
  const outcome = await run;
  assert.equal(outcome.voice, 'device'); assert.match(outcome.onlineError, /timed out/);
  assert.equal(calls.online, 1, 'no second online request'); assert.deepEqual(calls.offline, ['device']);
  assert.equal(calls.fallbackNotices.length, 1);
});

test('fallback stays off unless chosen; the original error is kept truthfully', async () => {
  for (const fallback of [null, undefined]) {
    const { calls, run } = scenario({ online: timeout, fallback });
    await assert.rejects(run, /timed out/); assert.deepEqual(calls.offline, []);
  }
});

test('never re-reads an answer after online audio was heard', async () => {
  const { calls, run } = scenario({ online: async started => { started(); throw new Error('Audio playback did not finish.'); } });
  await assert.rejects(run, /did not finish/); assert.deepEqual(calls.offline, []);
});

test('Stop, another question or a session change never triggers the fallback', async () => {
  const cancelled = scenario({ online: async () => { throw new Error('Speech cancelled.'); } });
  await assert.rejects(cancelled.run, /Speech cancelled/); assert.deepEqual(cancelled.calls.offline, []);
  const stale = scenario({ online: timeout, current: () => false });
  await assert.rejects(stale.run, /timed out/); assert.deepEqual(stale.calls.offline, []);
  let checks = 0; // becomes stale just as the fallback is about to start
  const racing = scenario({ online: timeout, current: () => ++checks < 2 });
  await assert.rejects(racing.run, /timed out/); assert.deepEqual(racing.calls.offline, []);
});

test('an unavailable fallback voice is reported honestly and nothing is spoken', async () => {
  const { calls, run } = scenario({ online: timeout, fallback: 'pocket', ready: false });
  await assert.rejects(run, error => /timed out/.test(error.message) && /Alba \(offline\).*not ready.*nothing was read aloud/.test(error.message));
  assert.deepEqual(calls.offline, []); assert.deepEqual(calls.fallbackNotices, []);
});

test('an offline fallback failure is surfaced, not hidden as success', async () => {
  const run = narrateWithFallback({ speakOnline: timeout, speakOffline: async () => { throw new Error('Install an offline English voice'); },
    fallback: 'device', fallbackReady: () => true, stillCurrent: () => true });
  await assert.rejects(run, /Install an offline English voice/);
});

const storage = saved => { const data = { value: JSON.stringify(saved) }; return { data, getItem: async () => data.value, setItem: async (_, value) => { data.value = value; } }; };
const policyNormal = load('features/assistant/policy.ts');
const policyDiagnostics = load('features/assistant/policy.ts', {}, { process: { env: { EXPO_PUBLIC_VOICE_DIAGNOSTICS: '1' } } });
const preferences = (store, policy = policyNormal) => load('features/assistant/preferences.ts', { '@react-native-async-storage/async-storage': store, './policy': policy });

test('normal builds hide diagnostics and keep Alba paused; only the diagnostics build enables both', () => {
  assert.equal(policyNormal.VOICE_DIAGNOSTICS_ENABLED, false); assert.equal(policyNormal.ALBA_SELECTION_ENABLED, false);
  assert.equal(load('features/assistant/policy.ts', {}, { process: { env: {} } }).ALBA_SELECTION_ENABLED, false);
  assert.equal(policyDiagnostics.VOICE_DIAGNOSTICS_ENABLED, true); assert.equal(policyDiagnostics.ALBA_SELECTION_ENABLED, true);
});

test('fallback preference: off by default, device kept, paused or unknown voices read as off', async () => {
  assert.equal((await preferences(storage({})).loadPreferences('owner')).speechFallback, undefined);
  assert.equal((await preferences(storage({ speechFallback: 'device' })).loadPreferences('owner')).speechFallback, 'device');
  for (const value of ['pocket', 'kokoro', 'sarvam', true, 'https://example.invalid/voice']) {
    assert.equal((await preferences(storage({ speechFallback: value })).loadPreferences('owner')).speechFallback, undefined, String(value));
  }
  assert.equal((await preferences(storage({ speechFallback: 'pocket' }), policyDiagnostics).loadPreferences('owner')).speechFallback, 'pocket');
  const store = storage({});
  await preferences(store).savePreferences('owner', { enabled: true, cloud: false, microphone: true, spokenReplies: true, audioOptIn: false, inputProvider: 'offline', speechProvider: 'sarvam', sarvamSpeechOptIn: true, speechFallback: 'pocket' });
  assert.equal(JSON.parse(store.data.value).speechFallback, undefined, 'a paused voice is never stored as the fallback');
  assert.equal(JSON.parse(store.data.value).speechProvider, 'sarvam', 'saving a fallback never changes the online choice');
});
