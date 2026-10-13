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
    enabled: true, cloud: true, microphone: true, spokenReplies: true, audioOptIn: false, inputProvider: 'offline', speechProvider: 'device',
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
