/* eslint-env node */
// Text interpretation can be opted into without enabling cloud audio.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function load(file, dependencies) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, {
    module: mod, exports: mod.exports, JSON,
    require: (name) => { if (name in dependencies) return dependencies[name]; throw new Error(`Unexpected dependency: ${name}`); },
  }, { filename: file });
  return mod.exports;
}

test('Groq listening and Sarvam narration have separate flags; Alba and legacy hosted choices stay off', () => {
  const policy = load('features/assistant/policy.ts', {});
  assert.equal(policy.CLOUD_VOICE_ENABLED, false);
  assert.equal(policy.CLOUD_TEXT_ENABLED, true);
  assert.equal(policy.CLOUD_TRANSCRIPTION_ENABLED, true);
  assert.equal(policy.SARVAM_SPEECH_ENABLED, true);
  assert.equal(policy.ALBA_SELECTION_ENABLED, false);
  assert.equal(policy.KOKORO_SELECTION_ENABLED, false);
});

test('existing text opt-in never restores old cloud audio providers', async () => {
  const saved = { enabled: true, cloud: true, microphone: true, spokenReplies: true, inputProvider: 'groq', speechProvider: 'sarvam' };
  const storage = { getItem: async () => JSON.stringify(saved), setItem: async () => {} };
  const { loadPreferences } = load('features/assistant/preferences.ts', {
    '@react-native-async-storage/async-storage': storage,
    './policy': load('features/assistant/policy.ts', {}),
  });
  // Spread copies the sandbox object into this realm for a strict comparison.
  assert.deepEqual({ ...(await loadPreferences('owner')) }, {
    enabled: true, cloud: true, microphone: true, spokenReplies: true, audioOptIn: false, inputProvider: 'offline', speechProvider: 'device', understandingProvider: 'groq',
  });
});

test('every cloud audio call remains gated independently of cloud text', () => {
  const source = ts.createSourceFile('assistant.tsx', read('components/assistant/AssistantExperience.tsx'), ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  const cloudCalls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ((ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(source) === 'assistant'
      && node.expression.name.text === 'transcribe') || (ts.isIdentifier(node.expression) && node.expression.text === 'playSarvamSpeech'))) {
      cloudCalls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const guarded = (call) => {
    const flag = ts.isPropertyAccessExpression(call.expression) ? 'CLOUD_TRANSCRIPTION_ENABLED' : 'SARVAM_SPEECH_ENABLED';
    const mentionsSwitch = (node) => node.getText(source).includes(flag);
    let child = call;
    for (let node = call.parent; node; child = node, node = node.parent) {
      // `if (CLOUD_VOICE_ENABLED) <call>` or `!CLOUD_VOICE_ENABLED || … ? local : <call>`
      if (ts.isIfStatement(node) && child === node.thenStatement && node.expression.getText(source).includes(flag)) return true;
      if (ts.isConditionalExpression(node) && child === node.whenFalse && node.condition.getText(source).includes('!' + flag)) return true;
      // An earlier statement in the same block that leaves when the switch is off.
      if (ts.isBlock(node)) {
        const index = node.statements.indexOf(child);
        if (node.statements.slice(0, index).some((s) => mentionsSwitch(s) && s.getText(source).includes('!' + flag) && /\b(return|throw)\b/.test(s.getText(source)))) return true;
      }
    }
    return false;
  };
  assert.equal(cloudCalls.length, 2, 'both audio upload and cloud speech must be guarded');
  const unguarded = cloudCalls.filter((call) => !guarded(call)).map((call) => `line ${source.getLineAndCharacterOfPosition(call.getStart()).line + 1}: ${call.getText(source).slice(0, 60)}`);
  assert.deepEqual(unguarded, []);
});

test('fresh audio opt-in can restore Groq listening but never cloud speech or Sarvam', async () => {
  let saved = { enabled:true, cloud:false, audioOptIn:true, inputProvider:'groq', speechProvider:'sarvam' };
  const preferences = load('features/assistant/preferences.ts', {
    '@react-native-async-storage/async-storage': { getItem:async () => JSON.stringify(saved) },
    './policy':load('features/assistant/policy.ts',{}),
  });
  assert.equal((await preferences.loadPreferences('owner')).inputProvider,'groq');
  assert.equal((await preferences.loadPreferences('owner')).cloud,false);
  assert.equal((await preferences.loadPreferences('owner')).speechProvider,'device');
  saved = { ...saved, inputProvider:'sarvam' };
  assert.equal((await preferences.loadPreferences('owner')).inputProvider,'offline');
});

test('paused Alba preferences use device speech; validated pace remains account scoped', async () => {
  const keys = [];
  let saved = { speechProvider: 'pocket', speechPace: 0.9, spokenReplies: true };
  const preferences = load('features/assistant/preferences.ts', {
    '@react-native-async-storage/async-storage': { getItem: async key => { keys.push(key); return JSON.stringify(saved); } },
    './policy': load('features/assistant/policy.ts', {}),
  });
  assert.equal((await preferences.loadPreferences('owner-a')).speechProvider, 'device');
  assert.equal((await preferences.loadPreferences('owner-b')).speechPace, 0.9);
  assert.notEqual(keys[0], keys[1]);
  saved = { speechProvider: 'pocket', speechPace: 99 };
  assert.equal((await preferences.loadPreferences('owner-a')).speechPace, undefined);
});

test('only an explicit new Sarvam narration choice can restore online speech; Kokoro stays disabled', async () => {
  let saved = { speechProvider: 'sarvam', sarvamSpeechOptIn: true, cloud: false, audioOptIn: false };
  const preferences = load('features/assistant/preferences.ts', {
    '@react-native-async-storage/async-storage': { getItem: async () => JSON.stringify(saved), setItem: async (_, value) => { saved = JSON.parse(value); } },
    './policy': load('features/assistant/policy.ts', {}),
  });
  const selected = await preferences.loadPreferences('owner');
  assert.equal(selected.speechProvider, 'sarvam');
  assert.equal(selected.cloud, false); assert.equal(selected.inputProvider, 'offline');
  await preferences.savePreferences('owner', { ...selected, speechProvider: 'kokoro' });
  assert.equal(saved.speechProvider, 'device');
});


test('personal billing preference is account scoped and raw keys are never loaded as preferences', async () => {
  const reads = [];
  const saved = { sarvamKeySource: 'personal', api_key: 'synthetic-private-key', speechProvider: 'device' };
  const preferences = load('features/assistant/preferences.ts', {
    '@react-native-async-storage/async-storage': { getItem: async key => { reads.push(key); return JSON.stringify(saved); } },
    './policy': load('features/assistant/policy.ts', {}),
  });
  const a = await preferences.loadPreferences('a'); const b = await preferences.loadPreferences('b');
  assert.equal(a.sarvamKeySource, 'personal'); assert.equal(b.sarvamKeySource, 'personal');
  assert.notEqual(reads[0], reads[1]);
  assert.equal(JSON.stringify(a).includes('synthetic-private-key'), false);
});

test('V-38/V-40: the Alba voice list matches the pinned native catalog and keeps only commercial-use voices', async () => {
  let saved = { speechProvider: 'device', albaVoice: 'albapause' };
  const preferences = load('features/assistant/preferences.ts', {
    '@react-native-async-storage/async-storage': { getItem: async () => JSON.stringify(saved), setItem: async () => {} },
    './policy': load('features/assistant/policy.ts', {}),
  });
  const manifest = JSON.parse(read('modules/carekosh-voice/android/src/main/assets/pocket-alba-manifest.json'));
  assert.deepEqual(manifest.voices.map(v => v.id), [...preferences.ALBA_VOICES]);
  for (const voice of manifest.voices) {
    assert.equal(voice.name, `pt_voice_${voice.id}.bin`);
    assert.match(voice.sha256, /^[a-f0-9]{64}$/);
    assert.ok(!/cosette|jean|expresso|ears/i.test(`${voice.id} ${voice.source}`), 'no non-commercial presets');
    if (voice.voiceState) {
      // Packed on the phone from Kyutai's pinned english_2026-04 state; the packed size is 4 + 24576 bytes per frame.
      assert.equal(voice.url, undefined);
      assert.match(voice.voiceState.url, /^https:\/\/huggingface\.co\/kyutai\/pocket-tts-without-voice-cloning\/resolve\/069025daa1d6a8a9640bd52581e2a2252f8bede4\/languages\/english_2026-04\/embeddings\/[a-z]+\.safetensors$/);
      assert.match(voice.voiceState.sha256, /^[a-f0-9]{64}$/);
      assert.ok(voice.voiceState.bytes > 0 && voice.voiceState.bytes <= 16_000_000);
      assert.equal((voice.bytes - 4) % 24576, 0);
      assert.ok((voice.bytes - 4) / 24576 <= 200);
    } else {
      assert.equal(voice.url, `https://huggingface.co/mlboydaisuke/Pocket-TTS-LiteRT/resolve/e0e68d4fb79feb529d7d0f8d0bbfad8d15a18a1e/voices/${voice.name}`);
    }
  }
  assert.equal(manifest.voices[0].voiceState, undefined, 'the original Alba stays a direct pinned download');
  assert.equal((await preferences.loadPreferences('owner')).albaVoice, 'albapause');
  saved = { speechProvider: 'device', albaVoice: 'cosette' };
  assert.equal((await preferences.loadPreferences('owner')).albaVoice, undefined);
});

test('V-41: a saved Kokoro test voice is kept only in diagnostics builds; the hosted kokoro id always migrates', async () => {
  let saved = { speechProvider: 'kokoro_offline', kokoroVoice: 'bf_emma' };
  const storage = { getItem: async () => JSON.stringify(saved), setItem: async () => {} };
  const normal = load('features/assistant/preferences.ts', { '@react-native-async-storage/async-storage': storage, './policy': load('features/assistant/policy.ts', {}) });
  const diagnostics = load('features/assistant/preferences.ts', { '@react-native-async-storage/async-storage': storage,
    './policy': { ...load('features/assistant/policy.ts', {}), VOICE_DIAGNOSTICS_ENABLED: true, ALBA_SELECTION_ENABLED: true, KOKORO_SELECTION_ENABLED: true } });
  assert.equal((await normal.loadPreferences('owner')).speechProvider, 'device');
  const kept = await diagnostics.loadPreferences('owner');
  assert.equal(kept.speechProvider, 'kokoro_offline'); assert.equal(kept.kokoroVoice, 'bf_emma');
  saved = { speechProvider: 'kokoro', kokoroVoice: 'af_nicole' };
  const hosted = await diagnostics.loadPreferences('owner');
  assert.equal(hosted.speechProvider, 'device', 'the retired hosted Kokoro never becomes the offline voice');
  assert.equal(hosted.kokoroVoice, undefined, 'only catalogued voices load');
});

test('V-41: the Kokoro manifest pins exactly the moonshine-voice 0.1.5 file set and the offered voices', () => {
  const manifest = JSON.parse(read('modules/carekosh-voice/android/src/main/assets/kokoro-manifest.json'));
  const preferences = load('features/assistant/preferences.ts', { '@react-native-async-storage/async-storage': {}, './policy': load('features/assistant/policy.ts', {}) });
  assert.equal(manifest.revision, '0bf2f2e5aff22e6fbba4300b00a4e00bbc4f8aae');
  assert.equal(manifest.library, 'ai.moonshine:moonshine-voice:0.1.5');
  assert.match(read('modules/carekosh-voice/android/build.gradle'), /ai\.moonshine:moonshine-voice:0\.1\.5/);
  // The split prosody/decoder stages are what 0.1.5 lists; the whole-utterance model.ort is not needed.
  assert.deepEqual(manifest.assets.map(a => a.path), ['kokoro/config.json', 'kokoro/prosody.model.ort', 'kokoro/prosody.weights.ort',
    'kokoro/decoder.model.ort', 'kokoro/decoder.weights.ort', 'en_us/dict_filtered_heteronyms.tsv', 'en_us/g2p-config.json',
    'en_us/oov/model.ort', 'en_us/oov/onnx-config.json']);
  assert.deepEqual(manifest.voices.map(v => v.id), [...preferences.KOKORO_VOICES]);
  for (const entry of [...manifest.assets, ...manifest.voices]) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(entry.bytes) && entry.bytes > 0);
  }
  for (const voice of manifest.voices) assert.equal(voice.path, `kokoro/voices/${voice.id}.kokorovoice`);
  assert.ok([...manifest.assets, ...manifest.voices].reduce((sum, entry) => sum + entry.bytes, 0) < 115_000_000);
});
