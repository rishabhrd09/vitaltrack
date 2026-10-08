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

test('online listening is available separately; cloud speaking stays off', () => {
  const policy = load('features/assistant/policy.ts', {});
  assert.equal(policy.CLOUD_VOICE_ENABLED, false);
  assert.equal(policy.CLOUD_TEXT_ENABLED, true);
  assert.equal(policy.CLOUD_TRANSCRIPTION_ENABLED, true);
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
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(source) === 'assistant'
      && ['transcribe', 'speak'].includes(node.expression.name.text)) {
      cloudCalls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const guarded = (call) => {
    const flag = call.expression.name.text === 'transcribe' ? 'CLOUD_TRANSCRIPTION_ENABLED' : 'CLOUD_VOICE_ENABLED';
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
