/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.join(__dirname, '..');

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name in dependencies) return dependencies[name];
    throw new Error('Unmocked dependency: ' + name);
  }, setTimeout, clearTimeout, setInterval, clearInterval, Date, AbortController });
  return module.exports;
}
const host = name => function Host({ children, ...props }) { return React.createElement(name, props, children); };
const VoiceButton = ({ label, onPress, disabled }) => React.createElement('Button', { label, onPress, disabled }, label);

async function harness({ ready = true, permission = true, canAskAgain = false, mode, deviceReady = true, permissionBackground = false, permissionAlreadyGranted = false, permissionReturnsInBackground = false, permissionMayAskInitially = true, rememberBackground = false, cloudAvailable = false, cloudConsented = false, cloudFailure = false, consentFailure = false, transcript = 'How many hand gloves are left?', permissionWait } = {}) {
  const calls = { navigation: [], stock: 0, transcribe: 0, stop: 0, record: 0, permission: 0, interpret: [], consent: [], cloudAudio: 0 };
  const listeners = new Set();
  const lifecycle = state => { for (const listener of [...listeners]) listener(state); };
  let nativeEvent;
  let pendingAlert;
  const unavailable = { interpret: false, scopes: [], consented: false, transcription_providers: [], speech_providers: [] };
  let scopes = cloudConsented ? ['groq_text'] : [];
  const prefs = { enabled: true, microphone: true, spokenReplies: false, inputProvider: 'offline', speechProvider: 'device', cloud: cloudConsented };
  const recorder = { uri: 'file:///cache/test.m4a', isRecording: false,
    prepareToRecordAsync: async () => {}, record() { this.isRecording = true; calls.record++; },
    async stop() { this.isRecording = false; calls.stop++; },
  };
  const player = { pause() {}, replace() {}, play() {} };
  const appState = { currentState: 'active', addEventListener: (_, fn) => { listeners.add(fn); return { remove() { listeners.delete(fn); } }; } };
  const rn = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'Text', 'TextInput', 'TouchableOpacity', 'View', 'ScrollView', 'Switch'].map(name => [name, host(name)]));
  rn.Modal = ({ visible, children }) => visible ? React.createElement('Modal', {}, children) : null;
  Object.assign(rn, { StyleSheet: { create: v => v, absoluteFill: {} }, Platform: { OS: 'android' }, AppState: appState,
    AccessibilityInfo: { isScreenReaderEnabled: async () => false, addEventListener: () => ({ remove() {} }) },
    Alert: { alert(title, message, buttons) { pendingAlert = buttons; } }, Linking: { openSettings: async () => {} } });
  const auth = fn => fn({ isAuthenticated: true, user: { id: 'test-user' } }); auth.subscribe = () => () => {};
  const colors = load('theme/colors.ts').colors;
  const core = load('features/assistant/core.ts', { '../../types': load('types/index.ts') });
  const Screen = load('components/assistant/AssistantExperience.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn,
    'expo-router': { useLocalSearchParams: () => ({ mode }), useRouter: () => Object.fromEntries(['navigate', 'setParams', 'back', 'replace'].map(name => [name, value => calls.navigation.push([name, value])])) },
    '@expo/vector-icons': { Ionicons: host('Icon') }, 'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') },
    'expo-audio': { RecordingPresets: { HIGH_QUALITY: {} }, AudioModule: { getRecordingPermissionsAsync: async () => ({ granted: permissionAlreadyGranted, canAskAgain: permissionMayAskInitially }), requestRecordingPermissionsAsync: async () => { calls.permission++; if (permissionBackground) { appState.currentState = 'background'; lifecycle('background'); await Promise.resolve(); if (!permissionReturnsInBackground) { appState.currentState = 'active'; lifecycle('active'); } } if (permissionWait) await permissionWait; return { granted: permission, canAskAgain }; } },
      setAudioModeAsync: async () => {}, useAudioRecorder: (_, cb) => { nativeEvent = cb; return recorder; },
      useAudioRecorderState: () => ({ durationMillis: 1000, metering: -20 }), useAudioPlayer: () => player, useAudioPlayerStatus: () => ({}) },
    'expo-file-system/legacy': {}, '@/store/useAuthStore': { useAuthStore: auth }, '@/theme/ThemeContext': { useTheme: () => ({ colors }) },
    '@/services/assistantSession': { captureSession: () => ({ owner: 'test-user' }), assertSession() {} },
    '@/services/assistant': { unavailable,
      capabilities: async () => ({ ...unavailable, interpret: cloudAvailable, scopes, consented: scopes.length > 0 }),
      setConsent: async (_, next) => { calls.consent.push([...next]); if (consentFailure) throw new Error('Unavailable'); scopes = [...next]; },
      interpret: async (_, text) => { calls.interpret.push(text); if (cloudFailure) throw new Error('Quota or network unavailable'); return core.command('low_stock'); },
      transcribe: async () => { calls.cloudAudio++; throw new Error('Audio must stay local'); },
      speak: async () => { calls.cloudAudio++; throw new Error('Speech must stay local'); },
    }, '@/features/assistant/core': core,
    '@/features/assistant/preferences': { defaults: { ...prefs, enabled: false }, loadPreferences: async () => ({ ...prefs }), savePreferences: async (_, next) => Object.assign(prefs, next) },
    '@/features/assistant/snapshot': { inventorySnapshot: async () => { calls.stock++; return { items: [{ id: 'g', name: 'Hand gloves', quantity: 18, minimumStock: 5, unit: 'pairs', isActive: true }], timestamp: Date.now(), stale: false }; } },
    '@/features/assistant/audioFiles': { rememberAudio: async () => { if (rememberBackground) { appState.currentState = 'background'; lifecycle('background'); } }, discardAudio: async () => {} },
    '@/features/assistant/capture': load('features/assistant/capture.ts'),
    '@/features/assistant/offlineVoice': { offlineSupported: true, offlineVoice: { status: async () => ({ ready, bytes: 100 }),
      download: async () => { ready = true; }, remove: async () => { ready = false; }, deviceStatus: async () => ({ ready: deviceReady, name: 'English' }), progress: () => ({ remove() {} }), cancel() {},
      transcribe: async () => { calls.transcribe++; return { transcript }; }, speak: async () => {} } },
    '@/features/assistant/policy': load('features/assistant/policy.ts'), '@/features/assistant/readiness': load('features/assistant/readiness.ts'),
    '@/components/assistant/VoiceSetup': mode ? load('components/assistant/VoiceSetup.tsx', {
      react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn,
      '@expo/vector-icons': { Ionicons: host('Icon') }, '@/theme/ThemeContext': { useTheme: () => ({ colors }) },
      '@/features/assistant/core': core, '@/features/assistant/notices': { offlineSpeechNotice: 'Offline model licence' },
    }) : { default: host('VoiceSetup'), VoiceButton },
  }).default;
  let tree;
  await act(async () => { tree = create(React.createElement(Screen, { embedded: !mode, active: true, screenKey: 'dashboard' })); });
  const find = label => tree.root.findAll(node => typeof node.type === 'string' && (node.props.accessibilityLabel === label || node.props.label === label || (node.type === 'TouchableOpacity' && node.findAllByType('Text').some(t => t.children.join('') === label))))[0];
  return { calls, prefs, recorder, tree, find,
    confirm: async () => { await act(async () => { await pendingAlert.at(-1).onPress(); }); },
    editTranscript: async value => { await act(async () => { find('Review voice transcript').props.onChangeText(value); }); },
    toggle: async (label, value) => { await act(async () => { await find(label).props.onValueChange(value); }); },
    press: async label => { const target = find(label); assert.ok(target, label); assert.ok(!target.props.disabled, label + ' disabled'); await act(async () => { await target.props.onPress(); }); },
    foreground: async () => { await act(async () => { appState.currentState = 'active'; lifecycle('active'); }); },
    background: async () => { await act(async () => { appState.currentState = 'background'; lifecycle('background'); }); },
    focus: async (active, screenKey = 'dashboard') => { await act(async () => tree.update(React.createElement(Screen, { embedded: !mode, active, screenKey }))); },
    error: async () => { await act(async () => nativeEvent({ hasError: true, error: 'Microphone disconnected' })); },
    modal: () => tree.root.findAllByType('Modal').length,
    dispose: async () => { await act(async () => tree.unmount()); },
  };
}

test('tap twice stays on the same screen, reviews transcript, and reads stock only after Send', async () => {
  const h = await harness();
  try {
    await h.press('Start voice recording');
    assert.equal(h.recorder.isRecording, true); assert.equal(h.modal(), 0);
    assert.equal(h.calls.stock, 0); assert.equal(h.calls.transcribe, 0);
    await h.press('Stop recording and review transcript');
    assert.equal(h.recorder.isRecording, false); assert.equal(h.modal(), 0);
    assert.equal(h.find('Review voice transcript').props.value, 'How many hand gloves are left?');
    assert.equal(h.calls.stock, 0);
    await h.press('Send question');
    assert.equal(h.calls.stock, 1); assert.equal(h.modal(), 1);
    assert.deepEqual(h.calls.navigation, []);
    await h.press('Close assistant');
    assert.equal(h.modal(), 0); assert.deepEqual(h.calls.navigation, []);
  } finally { await h.dispose(); }
});

test('missing model reports setup inline without redirecting or starting capture', async () => {
  const h = await harness({ ready: false });
  try {
    await h.press('Start voice recording');
    assert.equal(h.calls.record, 0); assert.equal(h.modal(), 0);
    assert.deepEqual(h.calls.navigation, []); assert.ok(h.find('Voice setup'));
  } finally { await h.dispose(); }
});

test('denied microphone permission has an actionable error and never claims Listening', async () => {
  const h = await harness({ permission: false });
  try {
    await h.press('Start voice recording');
    assert.equal(h.calls.permission, 1); assert.equal(h.calls.record, 0);
    assert.ok(h.find('Open Android app permissions')); assert.ok(h.find('Start voice recording'));
    assert.equal(h.modal(), 0);
  } finally { await h.dispose(); }
});

for (const event of ['background', 'screen change', 'blur', 'native error']) test(`${event} stops capture without submitting a question`, async () => {
  const h = await harness();
  try {
    await h.press('Start voice recording');
    if (event === 'background') await h.background();
    else if (event === 'native error') await h.error();
    else await h.focus(event !== 'blur', 'inventory');
    assert.equal(h.recorder.isRecording, false); assert.equal(h.calls.stock, 0); assert.equal(h.calls.transcribe, 0);
    assert.equal(h.modal(), 0);
  } finally { await h.dispose(); }
});

test('returning from setup reloads microphone preferences before the next tap', async () => {
  const h = await harness();
  try {
    await h.focus(false); h.prefs.microphone = false; await h.focus(true);
    await h.press('Start voice recording'); assert.equal(h.calls.record, 0);
    await h.focus(false); h.prefs.microphone = true; await h.focus(true);
    await h.press('Start voice recording'); assert.equal(h.calls.record, 1);
  } finally { await h.dispose(); }
});


test('setup downloads/removes the model and saves microphone and spoken-reply choices', async () => {
  const h = await harness({ mode: 'settings', ready: false });
  try {
    await h.press('Download speech pack'); await h.confirm();
    assert.ok(h.find('Remove speech pack'));
    await h.toggle('Microphone', false); assert.equal(h.prefs.microphone, false);
    await h.press('Enable assistant & microphone'); assert.equal(h.prefs.microphone, true); assert.equal(h.prefs.enabled, true);
    await h.toggle('Read answers aloud', true); assert.equal(h.prefs.spokenReplies, true);
    await h.press('Preview voice');
    await h.press('Remove speech pack'); await h.confirm();
    assert.ok(h.find('Download speech pack')); assert.equal(h.calls.stock, 0);
  } finally { await h.dispose(); }
});

test('missing device TTS blocks spoken replies only, with a visible recheck action', async () => {
  const h = await harness({ mode: 'settings', deviceReady: false });
  try {
    assert.equal(h.find('Read answers aloud').props.disabled, true);
    assert.equal(h.find('Preview voice').props.disabled, true);
    assert.equal(h.find('Microphone').props.disabled, false);
    assert.ok(h.find('Recheck voice & online understanding'));
  } finally { await h.dispose(); }
});


test('granting permission through a backgrounding Android dialog enables and saves the microphone', async () => {
  const h = await harness({ mode: 'settings', permissionBackground: true });
  try {
    await h.toggle('Microphone', false);
    await h.press('Enable assistant & microphone');
    assert.equal(h.prefs.microphone, true);
    assert.equal(h.find('Microphone').props.value, true);
    assert.equal(h.calls.record, 0, 'enabling a setting must never start recording');
  } finally { await h.dispose(); }
});

test('denying permission through a backgrounding dialog keeps microphone disabled and offers settings', async () => {
  const h = await harness({ mode: 'settings', permissionBackground: true, permission: false });
  try {
    await h.toggle('Microphone', false);
    await h.press('Enable assistant & microphone');
    assert.equal(h.prefs.microphone, false);
    assert.ok(h.find('Open Android app permissions'));
    assert.equal(h.calls.record, 0);
  } finally { await h.dispose(); }
});

for (const event of ['cancel', 'leave setup']) test(`${event} during microphone setup ignores a later permission grant`, async () => {
  let grant;
  const permissionWait = new Promise(resolve => { grant = resolve; });
  const h = await harness({ mode: 'settings', permissionBackground: true, permissionWait });
  try {
    await h.toggle('Microphone', false);
    await h.press('Enable assistant & microphone');
    if (event === 'cancel') await h.press('Cancel operation');
    else await h.focus(false);
    await act(async () => { grant(); await permissionWait; });
    assert.equal(h.prefs.microphone, false);
    assert.equal(h.calls.record, 0);
  } finally { grant(); await h.dispose(); }
});


test('already granted microphone access starts recording without requesting permission again', async () => {
  const h = await harness({ permissionAlreadyGranted: true, permissionBackground: true });
  try {
    await h.press('Start voice recording');
    assert.equal(h.calls.permission, 0);
    assert.equal(h.recorder.isRecording, true);
  } finally { await h.dispose(); }
});

test('a transient permission activity does not cancel recording startup', async () => {
  const h = await harness({ permissionBackground: true });
  try {
    await h.press('Start voice recording');
    assert.equal(h.recorder.isRecording, true);
    assert.equal(h.calls.stock, 0);
    await h.press('Stop recording and review transcript');
    assert.equal(h.find('Review voice transcript').props.value, 'How many hand gloves are left?');
  } finally { await h.dispose(); }
});

test('permission granted before Android resumes waits for active before starting the recorder', async () => {
  const h = await harness({ permissionBackground: true, permissionReturnsInBackground: true });
  try {
    await h.press('Start voice recording');
    assert.equal(h.calls.record, 0);
    await h.foreground();
    assert.equal(h.recorder.isRecording, true);
    assert.equal(h.calls.stock, 0);
  } finally { await h.dispose(); }
});


for (const event of ['leave screen', 'cancel']) test(`${event} while waiting for Android foreground never starts recording on return`, async () => {
  const h = await harness({ permissionBackground: true, permissionReturnsInBackground: true });
  try {
    await h.press('Start voice recording');
    if (event === 'cancel') await h.press('Dismiss voice input');
    else await h.focus(false);
    await h.foreground();
    assert.equal(h.calls.record, 0);
    assert.equal(h.calls.stock, 0);
    assert.equal(h.calls.transcribe, 0);
  } finally { await h.dispose(); }
});

test('permission result with no foreground return times out and cannot start later', async () => {
  const h = await harness({ permissionBackground: true, permissionReturnsInBackground: true });
  try {
    await h.press('Start voice recording');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 3100)); });
    assert.ok(h.tree.root.findAllByType('Text').some(node => node.children.join('').includes('not in the foreground')));
    await h.foreground();
    assert.equal(h.calls.record, 0);
    assert.equal(h.find('Start voice recording').props.disabled, false);
  } finally { await h.dispose(); }
});

test('permanently denied permission offers Android settings without reopening the permission activity', async () => {
  const h = await harness({ permission: false, permissionMayAskInitially: false });
  try {
    await h.press('Start voice recording');
    assert.equal(h.calls.permission, 0);
    assert.equal(h.calls.record, 0);
    assert.ok(h.find('Open Android app permissions'));
  } finally { await h.dispose(); }
});

test('backgrounding after permission while preparing the file still cancels recording', async () => {
  const h = await harness({ permissionAlreadyGranted: true, rememberBackground: true });
  try {
    await h.press('Start voice recording');
    await h.foreground();
    assert.equal(h.calls.record, 0);
    assert.equal(h.calls.transcribe, 0);
    assert.equal(h.calls.stock, 0);
  } finally { await h.dispose(); }
});


test('Groq text requires confirmed consent and grants no audio scopes', async () => {
  const h = await harness({ mode: 'settings', cloudAvailable: true });
  try {
    await h.press('Enable Groq understanding');
    assert.equal(h.prefs.cloud, false);
    assert.equal(h.calls.consent.length, 0);
    await h.confirm();
    assert.deepEqual(h.calls.consent, [['groq_text']]);
    assert.equal(h.prefs.cloud, true);
    assert.equal(h.prefs.inputProvider, 'offline');
    assert.equal(h.prefs.speechProvider, 'device');
    assert.equal(h.find('Groq listening'), undefined);
    await h.press('Withdraw all cloud consent');
    assert.equal(h.prefs.cloud, false);
    assert.deepEqual(h.calls.consent, [['groq_text'], []]);
  } finally { await h.dispose(); }
});

test('failed consent does not enable Groq text locally', async () => {
  const h = await harness({ mode: 'settings', cloudAvailable: true, consentFailure: true });
  try {
    await h.press('Enable Groq understanding'); await h.confirm();
    assert.equal(h.prefs.cloud, false);
    assert.equal(h.calls.interpret.length, 0);
  } finally { await h.dispose(); }
});

test('unconfigured backend visibly disables Groq activation without blocking microphone setup', async () => {
  const h = await harness({ mode: 'settings' });
  try {
    assert.equal(h.find('Enable Groq understanding').props.disabled, true);
    assert.equal(h.find('Microphone').props.disabled, false);
  } finally { await h.dispose(); }
});

const unfamiliarQuestion = 'Which supplies should I keep an eye on because they are running short?';
for (const [name, options, expected] of [
  ['consented', { cloudAvailable: true, cloudConsented: true }, 1],
  ['not consented', { cloudAvailable: true }, 0],
  ['backend disabled', { cloudConsented: true }, 0],
]) test(`unfamiliar spoken question (${name}) sends only reviewed text after Send`, async () => {
  const h = await harness({ ...options, transcript: unfamiliarQuestion });
  try {
    await h.press('Start voice recording');
    await h.press('Stop recording and review transcript');
    assert.equal(h.calls.interpret.length, 0);
    assert.equal(h.calls.stock, 0);
    await h.editTranscript(unfamiliarQuestion + ' Please.');
    await h.press('Send question');
    assert.equal(h.calls.interpret.length, expected);
    assert.equal(h.calls.stock, expected);
    if (expected) assert.equal(h.calls.interpret[0], unfamiliarQuestion + ' Please.');
    assert.equal(h.calls.cloudAudio, 0);
  } finally { await h.dispose(); }
});

test('familiar questions and prohibited mutations never call the LLM, even after opt-in', async () => {
  for (const transcript of ['Show low stock', 'Delete hand gloves']) {
    const h = await harness({ cloudAvailable: true, cloudConsented: true, transcript });
    try {
      await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); await h.press('Send question');
      assert.equal(h.calls.interpret.length, 0);
      assert.equal(h.calls.cloudAudio, 0);
      assert.equal(h.calls.stock, transcript.startsWith('Delete') ? 0 : 1);
    } finally { await h.dispose(); }
  }
});

test('failed Groq request leaves local commands usable and never fabricates stock', async () => {
  const h = await harness({ cloudAvailable: true, cloudConsented: true, cloudFailure: true, transcript: unfamiliarQuestion });
  try {
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); await h.press('Send question');
    assert.equal(h.calls.interpret.length, 1);
    assert.equal(h.calls.stock, 0);
    assert.equal(h.modal(), 0);
    await h.editTranscript('Show low stock'); await h.press('Send question');
    assert.equal(h.calls.interpret.length, 1);
    assert.equal(h.calls.stock, 1);
    assert.equal(h.modal(), 1);
  } finally { await h.dispose(); }
});
