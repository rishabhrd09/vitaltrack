/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness({ request, write, valid = true } = {}) {
  const calls = { players: [], writes: [], remembered: [], discarded: [], requests: [], statuses: [] };
  const timers = new Map(); let timerId = 0;
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../features/assistant/cloudSpeech.ts'), 'utf8');
  class Reader {
    readAsDataURL() { this.result = 'data:audio/wav;base64,UklGRg=='; this.onload(); }
    abort() {}
  }
  const deps = {
    'expo-audio': { setAudioModeAsync: async options => { calls.mode = options; }, createAudioPlayer: () => {
      const player = { plays: 0, removed: false, paused: false, listener: null,
        addListener(_, listener) { this.listener = listener; return { remove: () => { this.listener = null; } }; },
        replace(source) { this.source = source; },
        play() { this.plays++; }, pause() { this.paused = true; }, remove() { this.removed = true; },
        emit(status) { this.listener?.(status); },
      }; calls.players.push(player); return player;
    } },
    'expo-file-system/legacy': { cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' }, writeAsStringAsync: async (uri, data, options) => { calls.writes.push({ uri, data, options }); if (write) await write(); } },
    '@/services/assistantSession': { assertSession() { if (!valid) throw new Error('Session changed'); } },
    '@/services/assistant': { speak: async (...args) => { calls.requests.push(args); return request ? await request(...args) : { size: 48 }; } },
    './audioFiles': { rememberAudio: async uri => calls.remembered.push(uri), discardAudio: async uri => { if (uri) calls.discarded.push(uri); } },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { module, exports: module.exports, require: name => deps[name], AbortController, FileReader: Reader,
      setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) });
  return { ...module.exports, calls, timers, invalidate() { valid = false; },
    status: text => calls.statuses.push(text), fire(ms) { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('speech waits for loaded audio and actual completion, then releases its player', async () => {
  const h = harness(); const abort = new AbortController(); let complete = false;
  const playing = h.playSpeechClip('file:///cache/speech.wav', abort.signal, () => {}, h.status).then(() => { complete = true; });
  const player = h.calls.players[0];
  assert.equal(player.plays, 0);
  player.emit({ isLoaded: true, duration: 2, playing: false });
  assert.equal(player.plays, 1); await tick(); assert.equal(complete, false);
  player.emit({ isLoaded: true, duration: 2, playing: true });
  await tick(); assert.equal(complete, false);
  player.emit({ didJustFinish: true }); await playing;
  assert.equal(complete, true); assert.equal(player.removed, true); assert.equal(player.paused, true);
  assert.equal(h.timers.size, 0); assert.equal(player.volume, 1); assert.equal(player.muted, false);
});

test('cancelled playback releases its player and cannot complete a subsequent clip', async () => {
  const h = harness(); const first = new AbortController();
  const playing = h.playSpeechClip('file:///cache/a.wav', first.signal, () => {}, h.status);
  const rejected = assert.rejects(playing, /cancelled/); first.abort(); await rejected;
  assert.equal(h.calls.players[0].removed, true);
  const next = h.playSpeechClip('file:///cache/b.wav', new AbortController().signal, () => {}, h.status);
  h.calls.players[0].emit({ didJustFinish: true });
  assert.equal(h.calls.players[1].removed, false);
  h.calls.players[1].emit({ isLoaded: true, duration: 2 });
  h.calls.players[1].emit({ didJustFinish: true }); await next;
});

test('audio load failure and stalled playback are visible and release resources', async () => {
  for (const error of [true, false]) {
    const h = harness(); const playing = h.playSpeechClip('file:///cache/s.wav', new AbortController().signal, () => {}, h.status);
    const rejected = assert.rejects(playing, /could not play|did not start/);
    if (error) h.calls.players[0].emit({ playbackState: 'error' }); else h.fire(15_000);
    await rejected; assert.equal(h.calls.players[0].removed, true); assert.equal(h.timers.size, 0);
  }
});

test('English narration sends only text/provider/pace and deletes the temporary clip after playback', async () => {
  const h = harness(); const signal = new AbortController().signal;
  const reply = h.playSarvamSpeech({ owner: 'synthetic', epoch: 0 }, '18 pairs remain.', 0.9, signal, h.status);
  await tick(); const player = h.calls.players[0];
  assert.equal(h.calls.requests.length, 1); assert.equal(h.calls.requests[0][1], '18 pairs remain.');
  assert.equal(h.calls.requests[0][3], 'sarvam'); assert.equal(h.calls.requests[0][4], 0.9);
  assert.equal(h.calls.writes[0].data, 'UklGRg==');
  assert.equal(h.calls.mode.allowsRecording, false); assert.equal(h.calls.mode.shouldRouteThroughEarpiece, false);
  assert.equal(h.calls.discarded.length, 0);
  player.emit({ isLoaded: true, duration: 2 }); player.emit({ didJustFinish: true }); await reply;
  assert.deepEqual(h.calls.discarded, h.calls.remembered); assert.equal(h.timers.size, 0);
});

test('late synthesis after cancellation cannot create a file or start playback', async () => {
  let finish; const waiting = new Promise(resolve => { finish = resolve; });
  const h = harness({ request: () => waiting }); const abort = new AbortController();
  const reply = h.playSarvamSpeech({ owner: 'synthetic' }, 'Synthetic', 1, abort.signal, h.status);
  const rejected = assert.rejects(reply, /cancelled/); abort.abort(); await rejected;
  finish({ size: 48 }); await tick();
  assert.equal(h.calls.players.length, 0); assert.equal(h.calls.writes.length, 0);
});

test('request timeout has no automatic provider retry or offline substitution', async () => {
  const h = harness({ request: () => new Promise(() => {}) });
  const reply = h.playSarvamSpeech({ owner: 'synthetic' }, 'Synthetic', 1, new AbortController().signal, h.status);
  const rejected = assert.rejects(reply, /timed out/); h.fire(35_000); await rejected;
  assert.equal(h.calls.requests.length, 1); assert.equal(h.calls.players.length, 0); assert.equal(h.timers.size, 0);
});

test('logout while a clip is being written prevents playback and removes the clip', async () => {
  let finish; const waiting = new Promise(resolve => { finish = resolve; });
  const h = harness({ write: () => waiting });
  const reply = h.playSarvamSpeech({ owner: 'synthetic' }, 'Synthetic', 1, new AbortController().signal, h.status);
  const rejected = assert.rejects(reply, /Session changed/);
  await tick(); h.invalidate(); finish(); await rejected;
  assert.equal(h.calls.players.length, 0); assert.deepEqual(h.calls.discarded, h.calls.remembered);
});


test('personal narration carries only a billing selector, never a raw key', async () => {
  const h = harness();
  const reply = h.playSarvamSpeech({ owner: 'synthetic' }, 'Short test.', 1, new AbortController().signal, h.status, 'personal');
  await tick();
  assert.equal(h.calls.requests[0][5], 'personal');
  assert.equal(h.calls.requests[0].length, 6);
  h.calls.players[0].emit({ isLoaded: true, duration: 2 }); h.calls.players[0].emit({ didJustFinish: true });
  await reply;
});

test('partial playback progress before a sampled playing event prevents repeating the answer via fallback', async () => {
  const h = harness(); let began = 0;
  const reply = h.playSpeechClip('file:///cache/partial.wav', new AbortController().signal, () => {}, h.status, () => { began++; });
  const rejected = assert.rejects(reply, /could not play/);
  const player = h.calls.players[0];
  player.emit({isLoaded:true, duration:2, playing:false, currentTime:0});
  player.emit({isLoaded:true, duration:2, playing:false, currentTime:0.4, playbackState:'error'});
  await rejected;
  assert.equal(began, 1, 'progress is considered before the error, even without playing=true');
  assert.equal(player.paused, true); assert.equal(player.removed, true);
});
