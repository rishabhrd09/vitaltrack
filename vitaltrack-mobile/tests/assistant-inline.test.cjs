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
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { fileName: file,
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

async function harness({ inventoryItems, pocketBuild = false, pocketReady = false, selectedPocket = false, pocketSpeech, pocketDownloadWait, spokenReplies = false, ready = true, permission = true, canAskAgain = false, mode, listen, embedded = !mode, deviceReady = true, permissionBackground = false, permissionAlreadyGranted = false, permissionReturnsInBackground = false, permissionMayAskInitially = true, rememberBackground = false, cloudAvailable = false, cloudConsented = false, cloudFailure = false, cloudV2Response, firstCapabilityFailure = false, consentFailure = false, onlineListening = false, audioConsented = false, audioFailure = false, transcript = 'How many hand gloves are left?', inventoryName = 'Hand gloves', permissionWait, liveCapture = false } = {}) {
  const calls = { navigation: [], stock: 0, transcribe: 0, stop: 0, record: 0, permission: 0, interpret: [], consent: [], cloudAudio: 0 };
  const listeners = new Set();
  const lifecycle = state => { for (const listener of [...listeners]) listener(state); };
  let nativeEvent;
  let liveListener;
  let capabilityCalls = 0;
  let pendingAlert;
  const unavailable = { interpret: false, scopes: [], consented: false, transcription_providers: [], speech_providers: [] };
  let scopes = [...(cloudConsented ? ['groq_text'] : []), ...(audioConsented ? ['groq_audio'] : [])];
  const prefs = { enabled: true, microphone: true, spokenReplies, audioOptIn: onlineListening, inputProvider: onlineListening ? 'groq' : 'offline', speechProvider: selectedPocket ? 'pocket' : 'device', cloud: cloudConsented };
  const recorder = { uri: 'file:///cache/test.m4a', isRecording: false,
    prepareToRecordAsync: async () => {}, record() { this.isRecording = true; calls.record++; },
    async stop() { this.isRecording = false; calls.stop++; },
  };
  const player = { pause() {}, replace() {}, play() {} };
  const appState = { currentState: 'active', addEventListener: (_, fn) => { listeners.add(fn); return { remove() { listeners.delete(fn); } }; } };
  const rn = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'Text', 'TextInput', 'TouchableOpacity', 'View', 'ScrollView', 'Switch'].map(name => [name, host(name)]));
  rn.Modal = ({ visible, children }) => visible ? React.createElement('Modal', {}, children) : null;
  Object.assign(rn, { StyleSheet: { create: v => v, absoluteFill: {}, hairlineWidth: 1 }, Keyboard: { dismiss() { calls.keyboardDismiss = (calls.keyboardDismiss || 0) + 1; } }, BackHandler: { addEventListener: () => ({ remove() {} }) }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }), Animated: { Value: class { setValue() {} }, View: host('AnimatedView'), timing: () => ({ start() {}, stop() {} }), sequence: () => ({}), loop: () => ({ start() {}, stop() {} }) }, Platform: { OS: 'android' }, AppState: appState,
    AccessibilityInfo: { isScreenReaderEnabled: async () => false, isReduceMotionEnabled: async () => true, addEventListener: () => ({ remove() {} }) },
    Alert: { alert(title, message, buttons) { pendingAlert = buttons; } }, Linking: { openSettings: async () => {} } });
  const auth = fn => fn({ isAuthenticated: true, user: { id: 'test-user' } }); auth.subscribe = () => () => {};
  const colors = load('theme/colors.ts').colors;
  const core = load('features/assistant/core.ts', { '../../types': load('types/index.ts') });
  const types = load('types/index.ts');
  const contracts = load('features/assistant/contracts.ts');
  const queries = load('features/assistant/queries.ts', { '@/types': types, './core': core, './contracts': contracts });
  const sessionTools = { captureSession: () => ({ owner: 'test-user', epoch: 0 }), assertSession() {} };
  auth.getState = () => ({ isAuthenticated: true, user: { id: 'test-user' } });
  const drafts = load('features/assistant/drafts.ts', { react: React, '@/store/useAuthStore': { useAuthStore: auth }, '@/services/assistantSession': sessionTools, '@/types': types, '@/utils/helpers': { generateId: () => 'synthetic-submission' }, './queries': queries, './contracts': contracts });
  rn.FlatList = ({ data, renderItem, ListHeaderComponent }) => React.createElement('FlatList', {}, ListHeaderComponent, data.map((item,index) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item,index }))));
  const uiDeps = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn, '@expo/vector-icons': { Ionicons: host('Icon') }, '@/theme/ThemeContext': { useTheme: () => ({ colors }) } };
  const layer = load('components/assistant/AssistantLayer.tsx', uiDeps);
  const dock = load('components/assistant/AssistantDock.tsx', uiDeps);
  const table = load('components/assistant/AnswerList.tsx', { ...uiDeps, react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn, '@/theme/ThemeContext': { useTheme: () => ({ colors }) }, '@/features/assistant/queries': queries });
  const Screen = load('components/assistant/AssistantExperience.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn,
    'expo-router': { useLocalSearchParams: () => ({ mode, listen }), useRouter: () => Object.fromEntries(['navigate', 'setParams', 'back', 'replace'].map(name => [name, value => calls.navigation.push([name, value])])) },
    '@expo/vector-icons': { Ionicons: host('Icon') }, 'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') },
    'expo-audio': { RecordingPresets: { HIGH_QUALITY: {} }, AudioModule: { getRecordingPermissionsAsync: async () => ({ granted: permissionAlreadyGranted, canAskAgain: permissionMayAskInitially }), requestRecordingPermissionsAsync: async () => { calls.permission++; if (permissionBackground) { appState.currentState = 'background'; lifecycle('background'); await Promise.resolve(); if (!permissionReturnsInBackground) { appState.currentState = 'active'; lifecycle('active'); } } if (permissionWait) await permissionWait; return { granted: permission, canAskAgain }; } },
      setAudioModeAsync: async () => {}, useAudioRecorder: (_, cb) => { nativeEvent = cb; return recorder; },
      useAudioRecorderState: () => ({ durationMillis: 1000, metering: -20 }), useAudioPlayer: () => player, useAudioPlayerStatus: () => ({}) },
    'expo-file-system/legacy': {}, 'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async () => {} }, '@/store/useAuthStore': { useAuthStore: auth }, '@/theme/ThemeContext': { useTheme: () => ({ colors }) },
    '@/services/assistantSession': sessionTools,
    '@/services/assistant': { unavailable,
      capabilities: async () => { if (++capabilityCalls === 1 && firstCapabilityFailure) throw new Error('Cold start'); return { ...unavailable, interpret: cloudAvailable, interpret_contracts: cloudV2Response ? [1,2] : [1], scopes, consented: scopes.length > 0, transcription_providers: cloudAvailable ? ['groq'] : [] }; },
      setConsent: async (_, next) => { calls.consent.push([...next]); if (consentFailure) throw new Error('Unavailable'); scopes = [...next]; },
      interpret: async (_, text) => { calls.interpret.push(text); if (cloudFailure) throw new Error('Quota or network unavailable'); return core.command('low_stock'); },
      interpretExpanded: async (_,text) => { calls.interpret.push(text); return contracts.validateSpecification(cloudV2Response); },
      transcribe: async () => { calls.cloudAudio++; if (audioFailure) throw new Error('Online transcription unavailable'); return { transcript }; },
      speak: async () => { calls.cloudAudio++; throw new Error('Speech must stay local'); },
    }, '@/features/assistant/core': core,
    '@/features/assistant/contracts': contracts, '@/features/assistant/queries': queries, '@/features/assistant/drafts': drafts,
    '@/components/assistant/AnswerList': table, '@/components/assistant/AssistantDock': dock, '@/components/assistant/AssistantLayer': layer, '@/utils/inventoryPdfExport': { exportInventoryPdf: async () => { calls.inventoryPdf = (calls.inventoryPdf || 0) + 1; return { shared: true }; } },
    '@/features/assistant/preferences': { defaults: { ...prefs, enabled: false }, loadPreferences: async () => ({ ...prefs }), savePreferences: async (_, next) => Object.assign(prefs, next) },
    '@/features/assistant/snapshot': { cachedItemNames: () => inventoryItems ? inventoryItems.filter(i=>i.isActive).map(i=>i.name) : [inventoryName], categorySnapshot: async () => [], inventorySnapshot: async () => { calls.stock++; return { items: inventoryItems || [{ id: 'g', name: inventoryName, quantity: 18, minimumStock: 5, unit: 'pairs', isActive: true }], timestamp: Date.now(), stale: false }; } },
    '@/features/assistant/audioFiles': { rememberAudio: async () => { if (rememberBackground) { appState.currentState = 'background'; lifecycle('background'); } }, discardAudio: async () => {} },
    '@/features/assistant/capture': load('features/assistant/capture.ts'),
    '@/features/assistant/offlineVoice': { pocketVoiceSupported: pocketBuild, pocketVoice: {
      status: async () => ({ ready: pocketReady, supported: pocketBuild, bytes: 208767942, name: 'Alba' }),
      download: async () => { calls.pocketDownloads = (calls.pocketDownloads || 0) + 1; if (pocketDownloadWait) await pocketDownloadWait; pocketReady = true; },
      remove: async () => { pocketReady = false; }, progress: () => ({ remove() {} }), licences: async () => 'file:///licences.zip',
      speak: async (text, pace) => { (calls.pocketSpeech ||= []).push({ text, pace }); if (pocketSpeech) await pocketSpeech(); },
    }, offlineSupported: true, liveCaptureSupported: liveCapture, createLiveRecorder: () => Object.assign(recorder, { configure() {}, subscribe(listener) { liveListener = listener; return { remove() { liveListener = null; } }; } }), offlineVoice: { status: async () => ({ ready, bytes: 100 }),
      download: async () => { ready = true; }, remove: async () => { ready = false; }, deviceStatus: async () => ({ ready: deviceReady, name: 'English' }), progress: () => ({ remove() {} }), cancel() {},
      transcribe: async () => { calls.transcribe++; return { transcript }; }, speak: async () => {} } },
    '@/features/assistant/policy': load('features/assistant/policy.ts'), '@/features/assistant/readiness': load('features/assistant/readiness.ts'),
    '@/components/assistant/VoiceSetup': mode ? load('components/assistant/VoiceSetup.tsx', {
      react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn,
      '@expo/vector-icons': { Ionicons: host('Icon') }, '@/theme/ThemeContext': { useTheme: () => ({ colors }) },
      '@/features/assistant/core': core, '@/features/assistant/notices': { offlineSpeechNotice: 'Offline model licence', pocketSpeechNotice: 'Pocket model licence' },
    }) : { default: host('VoiceSetup'), VoiceButton },
  }).default;
  let tree;
  const render = props => React.createElement(layer.AssistantLayerProvider, {}, React.createElement(Screen, props));
  await act(async () => { tree = create(render({ embedded, active: true, screenKey: 'dashboard' })); });
  const find = label => tree.root.findAll(node => typeof node.type === 'string' && (node.props.accessibilityLabel === label || node.props.label === label || (node.type === 'TouchableOpacity' && node.findAllByType('Text').some(t => t.children.join('') === label))))[0];
  return { calls, prefs, recorder, tree, find, drafts, sessionTools,
    confirm: async () => { await act(async () => { await pendingAlert.at(-1).onPress(); }); },
    editTranscript: async value => { await act(async () => { find('Review voice transcript').props.onChangeText(value); }); },
    typeQuestion: async value => { await act(async () => { find('Question or editable transcript').props.onChangeText(value); }); },
    toggle: async (label, value) => { await act(async () => { await find(label).props.onValueChange(value); }); },
    press: async label => { const target = find(label); assert.ok(target, label); assert.ok(!target.props.disabled, label + ' disabled'); await act(async () => { await target.props.onPress(); }); },
    foreground: async () => { await act(async () => { appState.currentState = 'active'; lifecycle('active'); }); },
    background: async () => { await act(async () => { appState.currentState = 'background'; lifecycle('background'); }); },
    focus: async (active, screenKey = 'dashboard') => { await act(async () => tree.update(render({ embedded, active, screenKey }))); },
    error: async () => { await act(async () => nativeEvent({ hasError: true, error: 'Microphone disconnected' })); },
    layer: () => tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === 'assistant-answer-layer').length,
    dialogs: () => tree.root.findAllByType('Modal').length,
    live: async text => { await act(async () => liveListener?.({ transcript: text })); },
    dispose: async () => { await act(async () => tree.unmount()); },
  };
}

test('a listen route parameter cannot start recording without a microphone tap', async () => {
  const h = await harness({ embedded: false, listen: '1', permissionAlreadyGranted: true });
  try {
    assert.equal(h.calls.record, 0);
    assert.equal(h.calls.permission, 0);
    assert.equal(h.calls.transcribe, 0);
  } finally { await h.dispose(); }
});

test('online listening requires its own confirmed consent, independent of text consent', async () => {
  const h = await harness({ mode:'settings', cloudAvailable:true, cloudConsented:true });
  try {
    await h.press('Enable Groq online listening');
    assert.equal(h.prefs.inputProvider,'offline'); assert.equal(h.calls.consent.length,0);
    await h.confirm();
    assert.deepEqual(h.calls.consent,[['groq_text','groq_audio']]);
    assert.equal(h.prefs.inputProvider,'groq'); assert.equal(h.prefs.audioOptIn,true);
    await h.press('Withdraw all cloud consent');
    assert.equal(h.prefs.audioOptIn,false); assert.equal(h.prefs.inputProvider,'offline');
    assert.deepEqual(h.calls.consent.at(-1),[]);
  } finally { await h.dispose(); }
});

test('consented online listening works without a Moonshine download and never interprets before Send', async () => {
  const h = await harness({ ready:false, cloudAvailable:true, onlineListening:true, audioConsented:true });
  try {
    await h.press('Start voice recording'); assert.equal(h.calls.cloudAudio,0);
    await h.press('Stop recording and review transcript');
    assert.equal(h.calls.cloudAudio,1); assert.equal(h.calls.transcribe,0);
    assert.equal(h.calls.stock,0); assert.equal(h.calls.interpret.length,0);
    await h.press('Send question'); assert.equal(h.calls.stock,1);
  } finally { await h.dispose(); }
});

for (const options of [{ audioConsented:false },{ audioConsented:true,audioFailure:true }]) test(`online listening failure never silently substitutes a transcript: ${JSON.stringify(options)}`, async () => {
  const h = await harness({ cloudAvailable:true,onlineListening:true,...options });
  try {
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript');
    assert.equal(h.calls.transcribe,0); assert.equal(h.calls.stock,0); assert.equal(h.calls.interpret.length,0);
    assert.equal(h.find('Send question'),undefined);
    assert.equal(h.calls.cloudAudio,options.audioConsented ? 1 : 0);
  } finally { await h.dispose(); }
});

test('natural draft request against an old backend reports the deployment mismatch', async () => {
  const h = await harness({cloudAvailable:true,cloudConsented:true,transcript:'Could you put together hand gloves in my draft with 20 pairs?'});
  try {
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); await h.press('Send question');
    assert.equal(h.calls.interpret.length,0); assert.equal(h.calls.stock,0);
    assert.ok(h.tree.root.findAllByType('Text').some(n=>n.children.join('').includes('Deploy the latest feature branch')));
  } finally { await h.dispose(); }
});

test('typed compound query sends every filter to Groq and displays only matching stock', async () => {
  const cloudV2Response = {version:2,intent:'inventory_query',draft_mode:null,query:{status:'low',category:null,supplier:null,brand:null,missing_supplier:false,item_queries:['hand gloves'],sort:'name',previous:false},lines:[],include_low:false,include_out:false};
  const h = await harness({embedded:false,cloudAvailable:true,cloudConsented:true,cloudV2Response});
  try {
    // Typing does not require microphone capture or a speech model call.
    const text = 'Show low-stock hand gloves, sorted by name please';
    await h.typeQuestion(text); await h.press('Show answer');
    assert.deepEqual(h.calls.interpret,[text]); assert.equal(h.calls.stock,1);
    assert.equal(h.calls.record,0); assert.equal(h.calls.transcribe,0); assert.equal(h.calls.cloudAudio,0);
  } finally { await h.dispose(); }
});

test('a failed cold-start capability check is refreshed on the next consented typed query', async () => {
  const h = await harness({ embedded:false, cloudAvailable:true, cloudConsented:true, firstCapabilityFailure:true });
  try {
    await h.typeQuestion(unfamiliarQuestion); await h.press('Show answer');
    assert.equal(h.calls.interpret.length,1); assert.equal(h.calls.stock,1); assert.equal(h.calls.record,0);
  } finally { await h.dispose(); }
});

test('a new draft matching no stock keeps existing work and explains low versus out of stock', async () => {
  const h = await harness({embedded:false});
  try {
    await h.typeQuestion('Prepare a draft for all low-stock items'); await h.press('Show answer');
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()),null);
    assert.ok(h.tree.root.findAllByType('Text').some(n=>n.children.join('').includes('Low-stock and out-of-stock are separate')));
  } finally { await h.dispose(); }
});

test('a safety word inside an exact inventory name still gives a read-only stock answer', async () => {
  const h = await harness({ inventoryName: 'Used needle box', transcript: 'How many used needle box are left?' });
  try {
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); await h.press('Send question');
    assert.equal(h.calls.stock, 1); assert.equal(h.calls.interpret.length, 0);
    assert.ok(h.tree.root.findAllByType('Text').some(node => node.children.join('').includes('18 pairs remaining')));
  } finally { await h.dispose(); }
});

test('tap twice stays on the same screen, reviews transcript, and reads stock only after Send', async () => {
  const h = await harness();
  try {
    await h.press('Start voice recording');
    assert.equal(h.recorder.isRecording, true); assert.equal(h.layer(), 0);
    assert.equal(h.calls.stock, 0); assert.equal(h.calls.transcribe, 0);
    await h.press('Stop recording and review transcript');
    assert.equal(h.recorder.isRecording, false); assert.equal(h.layer(), 0);
    assert.equal(h.find('Review voice transcript').props.value, 'How many hand gloves are left?');
    assert.equal(h.calls.stock, 0);
    await h.press('Send question');
    assert.equal(h.calls.stock, 1); assert.equal(h.layer(), 1);
    assert.deepEqual(h.calls.navigation, []);
    await h.press('Close assistant');
    assert.equal(h.layer(), 0); assert.deepEqual(h.calls.navigation, []);
  } finally { await h.dispose(); }
});

test('missing model reports setup inline without redirecting or starting capture', async () => {
  const h = await harness({ ready: false });
  try {
    await h.press('Start voice recording');
    assert.equal(h.calls.record, 0); assert.equal(h.layer(), 0);
    assert.deepEqual(h.calls.navigation, []); assert.ok(h.find('Voice setup'));
  } finally { await h.dispose(); }
});

test('denied microphone permission has an actionable error and never claims Listening', async () => {
  const h = await harness({ permission: false });
  try {
    await h.press('Start voice recording');
    assert.equal(h.calls.permission, 1); assert.equal(h.calls.record, 0);
    assert.ok(h.find('Open Android app permissions')); assert.ok(h.find('Start voice recording'));
    assert.equal(h.layer(), 0);
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
    assert.equal(h.layer(), 0);
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
    assert.equal(h.layer(), 0);
    await h.editTranscript('Show low stock'); await h.press('Send question');
    assert.equal(h.calls.interpret.length, 1);
    assert.equal(h.calls.stock, 1);
    assert.equal(h.layer(), 1);
  } finally { await h.dispose(); }
});


test('reviewed speech prepares a local draft with spoken quantity and navigates only through Review', async () => {
  const h = await harness({ transcript: 'Prepare an order for 20 pairs of hand gloves' });
  try {
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript');
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()), null);
    await h.press('Send question');
    const draft = h.drafts.getDraft(h.sessionTools.captureSession());
    assert.equal(draft.rows[0].quantity, 20); assert.equal(draft.attempt, undefined);
    assert.deepEqual(h.calls.navigation, []); assert.equal(h.calls.stock, 1);
    assert.ok(h.tree.root.findAllByType('Text').some(node => node.children.join('').includes('Nothing has been saved')));
    await h.press('Review unsaved order draft');
    assert.deepEqual(h.calls.navigation, [['navigate', '/order/create']]);
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()).rows[0].quantity, 20);
  } finally { await h.dispose(); }
});

test('voice cannot overwrite a manual draft without the merge/replace review choice', async () => {
  const h = await harness({ transcript: 'Prepare an order for 20 pairs of hand gloves' });
  try {
    h.drafts.writeDraft(h.sessionTools.captureSession(), [{ item: { id: 'g', name: 'Hand gloves', unit: 'pairs', quantity:18, minimumStock:5, isActive:true }, quantity:7, source:'manual' }]);
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); await h.press('Send question');
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()).rows[0].quantity, 7);
    const late = h.find('Replace existing draft with this proposal').props.onPress;
    await h.press('Close assistant'); await act(async () => late());
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()).rows[0].quantity, 7, 'a late Alert callback cannot replace a cancelled draft');
  } finally { await h.dispose(); }
});

test('voice order commitment is refused and does not even fetch inventory', async () => {
  for (const transcript of ['Confirm', 'Save my order', 'Export my order', 'Prepare an order for 20 pairs of hand gloves and save it', 'Prepare a draft for 20 pairs of hand gloves and persist it']) {
    const h = await harness({ transcript, cloudAvailable:true, cloudConsented:true });
    try {
      await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); await h.press('Send question');
      assert.equal(h.calls.stock, 0); assert.equal(h.calls.interpret.length, 0); assert.equal(h.calls.inventoryPdf || 0, 0);
      assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()), null);
    } finally { await h.dispose(); }
  }
});

test('inventory PDF voice request requires reviewing a list and a separate touch export', async () => {
  const h = await harness({ transcript:'Show all inventory items with quantities and status' });
  try {
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); await h.press('Send question');
    await h.press('Export inventory report');
    assert.equal(h.calls.inventoryPdf || 0, 0);
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()), null);
    await h.confirm(); assert.equal(h.calls.inventoryPdf, 1);
  } finally { await h.dispose(); }
});


test('unfamiliar reviewed text uses consented v2 interpretation and only prepares a local draft', async () => {
  const cloudV2Response = { version:2,intent:'draft_order',draft_mode:'new',query:null,lines:[{operation:'set',item_query:'hand gloves',quantity:20,unit:'pairs'}],include_low:false,include_out:false };
  const h = await harness({ cloudAvailable:true,cloudConsented:true,cloudV2Response,transcript:'Could you put together 20 pairs of hand gloves for my unsaved draft' });
  try {
    await h.press('Start voice recording');await h.press('Stop recording and review transcript');
    assert.equal(h.calls.interpret.length,0);
    await h.press('Send question');
    assert.equal(h.calls.interpret.length,1);assert.equal(h.calls.stock,1);
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()).rows[0].quantity,20);
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()).attempt,undefined);
    assert.equal(h.calls.cloudAudio,0);assert.deepEqual(h.calls.navigation,[]);
  } finally {await h.dispose();}
});

test('a cloud v2 response containing a save operation cannot publish a draft', async () => {
  const h = await harness({ cloudAvailable:true,cloudConsented:true,cloudV2Response:{version:2,intent:'save_order'},transcript:'Could you put together something for me' });
  try {
    await h.press('Start voice recording');await h.press('Stop recording and review transcript');await h.press('Send question');
    assert.equal(h.calls.interpret.length,1);assert.equal(h.calls.stock,0);
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()),null);assert.deepEqual(h.calls.navigation,[]);
  } finally {await h.dispose();}
});

for (const transcript of [
  'Could you prepare a draft order containing 20 pairs of hand gloves?',
  'Create a purchase order draft with hand gloves, I need 20 pairs please.',
  'Please make an unsaved order with 20 pairs of hand gloves for me.',
]) test(`draft paraphrase reaches Groq rather than the legacy refusal: ${transcript}`, async () => {
  const cloudV2Response = { version:2,intent:'draft_order',draft_mode:'new',query:null,lines:[{operation:'set',item_query:'hand gloves',quantity:20,unit:'pairs'}],include_low:false,include_out:false };
  const h = await harness({ cloudAvailable:true,cloudConsented:true,cloudV2Response,transcript });
  try {
    await h.press('Start voice recording');await h.press('Stop recording and review transcript');await h.press('Send question');
    assert.equal(h.calls.interpret.length,1);
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()).rows[0].quantity,20);
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()).attempt,undefined);
  } finally { await h.dispose(); }
});

test('real partial captions stay beside the mic and cannot dispatch until reviewed and sent', async () => {
  const h = await harness({ liveCapture: true });
  try {
    await h.press('Start voice recording');
    await h.live('How many hand');
    assert.ok(h.tree.root.findAllByType('Text').some(n => n.children.join('') === 'How many hand'));
    assert.equal(h.find('Review voice transcript'), undefined);
    assert.equal(h.find('Send question'), undefined);
    assert.equal(h.calls.stock, 0); assert.equal(h.calls.cloudAudio, 0);
    await h.live('How many hand gloves are left?');
    await h.press('Stop recording and review transcript');
    assert.equal(h.find('Review voice transcript').props.value, 'How many hand gloves are left?');
    await h.editTranscript('Summary');
    await h.press('Send question');
    assert.equal(h.calls.stock, 1); assert.equal(h.layer(), 1); assert.equal(h.dialogs(), 0);
    assert.ok(h.calls.keyboardDismiss >= 2);
  } finally { await h.dispose(); }
});

test('late live words after navigation cannot resurrect a cancelled take', async () => {
  const h = await harness({ liveCapture: true });
  try {
    await h.press('Start voice recording'); await h.live('Hand gloves');
    await h.focus(false); await h.live('Order 20 pairs');
    assert.equal(h.recorder.isRecording, false); assert.equal(h.layer(), 0);
    assert.equal(h.calls.stock, 0); assert.equal(h.calls.interpret.length, 0);
    assert.ok(!h.tree.root.findAllByType('Text').some(n => n.children.join('') === 'Order 20 pairs'));
  } finally { await h.dispose(); }
});

test('first answer to another query repeatedly releases the answer layer and microphone', async () => {
  const h = await harness({ liveCapture: true, permissionAlreadyGranted: true });
  try {
    for (let round = 1; round <= 3; round++) {
      await h.press('Start voice recording');
      assert.equal(h.recorder.isRecording, true);
      assert.equal(h.layer(), 0); assert.equal(h.dialogs(), 0);
      await h.live('How many hand gloves');
      await h.press('Stop recording and review transcript');
      assert.equal(h.recorder.isRecording, false);
      assert.equal(h.calls.stock, round - 1, 'listening and review cannot submit');
      await h.editTranscript(round === 1 ? 'Summary' : 'How many hand gloves are left?');
      await h.press('Send question');
      assert.equal(h.calls.stock, round); assert.equal(h.layer(), 1); assert.equal(h.dialogs(), 0);
      await h.press('Ask another question');
      assert.equal(h.layer(), 0); assert.equal(h.recorder.isRecording, false);
      assert.equal(h.find('Review voice transcript'), undefined);
      assert.ok(h.find('Start voice recording'));
    }
    assert.equal(h.calls.record, 3); assert.equal(h.calls.stop, 3);
    assert.equal(h.calls.permission, 0, 'granted permission must not open a permission activity');
    assert.deepEqual(h.calls.navigation, [], 'the complete loop stays on the same screen');
  } finally { await h.dispose(); }
});


test('Alba download is explicitly confirmed, selects the local voice and preserves the microphone', async () => {
  const h = await harness({ mode: 'settings', pocketBuild: true, deviceReady: false });
  try {
    assert.equal(h.find('Preview voice').props.disabled, true);
    await h.press('Download Alba voice pack');
    assert.equal(h.calls.pocketDownloads || 0, 0);
    await h.confirm();
    assert.equal(h.calls.pocketDownloads, 1);
    assert.equal(h.prefs.speechProvider, 'pocket');
    assert.equal(h.prefs.spokenReplies, false);
    assert.equal(h.prefs.microphone, true);
    await h.toggle('Read answers aloud', true);
    await h.press('Relaxed pace');
    await h.press('Preview voice');
    assert.equal(h.calls.pocketSpeech.length, 1);
    assert.equal(h.calls.pocketSpeech[0].pace, 0.9);
    assert.equal(h.calls.cloudAudio, 0);
    assert.equal(h.calls.stock, 0);
    await h.press('Remove Alba voice pack'); await h.confirm();
    assert.equal(h.prefs.spokenReplies, false);
    assert.equal(h.prefs.speechProvider, 'pocket', 'removal never silently selects another provider');
    assert.equal(h.prefs.microphone, true);
  } finally { await h.dispose(); }
});

test('an old APK keeps its device voice and offers no unsupported Alba action', async () => {
  const h = await harness({ mode: 'settings' });
  try {
    assert.equal(h.find('Download Alba voice pack').props.disabled, true);
    assert.equal(h.find('Use Alba voice').props.disabled, true);
    assert.equal(h.find('Preview voice').props.disabled, false);
    assert.equal(h.prefs.speechProvider, 'device');
  } finally { await h.dispose(); }
});

test('Alba generation failure keeps the verified answer and never falls back to cloud speech', async () => {
  const h = await harness({ embedded: false, pocketBuild: true, pocketReady: true, selectedPocket: true, spokenReplies: true,
    pocketSpeech: async () => { throw new Error('Simulated audio failure'); } });
  try {
    await h.typeQuestion('How many hand gloves are left?'); await h.press('Show answer');
    assert.ok(h.tree.root.findAllByType('Text').some(n => n.children.join('').includes('18 pairs remaining')));
    assert.equal(h.calls.pocketSpeech.length, 1);
    assert.equal(h.calls.cloudAudio, 0);
    assert.equal(h.calls.stock, 1);
  } finally { await h.dispose(); }
});


test('cloud withdrawal preserves explicitly selected offline Alba', async () => {
  const h = await harness({ mode: 'settings', pocketBuild: true, pocketReady: true, selectedPocket: true,
    spokenReplies: true, cloudAvailable: true, cloudConsented: true, onlineListening: true, audioConsented: true });
  try {
    await h.press('Withdraw all cloud consent');
    assert.equal(h.prefs.cloud, false); assert.equal(h.prefs.audioOptIn, false);
    assert.equal(h.prefs.inputProvider, 'offline'); assert.equal(h.prefs.speechProvider, 'pocket');
    assert.equal(h.prefs.spokenReplies, true); assert.deepEqual(h.calls.consent.at(-1), []);
    assert.equal(h.calls.cloudAudio, 0);
  } finally { await h.dispose(); }
});

test('Hear answer uses Alba even when no Android device voice is installed', async () => {
  const h = await harness({ embedded: false, pocketBuild: true, pocketReady: true, selectedPocket: true, deviceReady: false });
  try {
    await h.typeQuestion('How many hand gloves are left?'); await h.press('Show answer');
    assert.equal(h.calls.pocketSpeech?.length || 0, 0);
    await h.press('Hear answer');
    assert.equal(h.calls.pocketSpeech.length, 1);
    assert.equal(h.calls.cloudAudio, 0); assert.equal(h.calls.stock, 1);
  } finally { await h.dispose(); }
});

const mixedInventory = [
  { id:'a', name:'Ambu Bag', quantity:1, minimumStock:5, unit:'unit', isActive:true, version:2 },
  { id:'g', name:'Hand gloves', quantity:2, minimumStock:5, unit:'pairs', isActive:true, version:3 },
  { id:'m', name:'Masks', quantity:0, minimumStock:4, unit:'boxes', isActive:true, version:1 },
  { id:'s', name:'Saline', quantity:10, minimumStock:5, unit:'bottles', isActive:true, version:1 },
  { id:'d', name:'Old item', quantity:0, minimumStock:5, unit:'pieces', isActive:false, version:1 },
];
const mixedCommand = 'Create a saved order draft for the following items: first is two units of Ambu bag, and second is all the items which are low in stock or out of stock, create a saved order draft.';
for (const typed of [false,true]) test(`mixed ${typed ? 'typed' : 'reviewed spoken'} request produces one unsaved draft with both stock groups`, async () => {
  const h=await harness({embedded:!typed,transcript:mixedCommand,inventoryItems:mixedInventory});
  try {
    if (typed) await h.typeQuestion(mixedCommand);
    else { await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); }
    assert.equal(h.calls.stock,0); assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()),null);
    await h.press(typed ? 'Show answer' : 'Send question');
    const draft=h.drafts.getDraft(h.sessionTools.captureSession());
    assert.deepEqual(JSON.parse(JSON.stringify(draft.rows.map(r=>[r.item.id,r.quantity,r.source]))),[['a',2,'spoken'],['g',3,'suggested'],['m',4,'suggested']]);
    assert.equal(draft.attempt,undefined); assert.equal(h.calls.stock,1); assert.equal(h.calls.interpret.length,0);
    assert.equal(h.calls.inventoryPdf || 0,0); assert.deepEqual(h.calls.navigation,[]);
    assert.ok(h.tree.root.findAllByType('Text').some(n=>n.children.join('').includes('Nothing has been saved')));
    await h.press('Review unsaved order draft'); assert.deepEqual(h.calls.navigation,[['navigate','/order/create']]);
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()).attempt,undefined);
  } finally { await h.dispose(); }
});

test('consented unfamiliar mixed draft uses the complete specification and retains explicit quantity',async()=>{
  const transcript='Could you put together a draft with Ambu bag: I need two units; include anything running low and anything out of stock';
  const cloudV2Response={version:2,intent:'draft_order',draft_mode:'new',query:null,lines:[{operation:'set',item_query:'Ambu bag',quantity:2,unit:'units'}],include_low:true,include_out:true};
  const h=await harness({transcript,inventoryItems:mixedInventory,cloudAvailable:true,cloudConsented:true,cloudV2Response});
  try {
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript');
    assert.equal(h.calls.interpret.length,0); await h.press('Send question');
    assert.deepEqual(h.calls.interpret,[transcript]); assert.equal(h.calls.stock,1);
    const draft=h.drafts.getDraft(h.sessionTools.captureSession());
    assert.deepEqual(JSON.parse(JSON.stringify(draft.rows.map(r=>[r.item.id,r.quantity]))),[['a',2],['g',3],['m',4]]);
    assert.equal(draft.attempt,undefined); assert.equal(h.calls.cloudAudio,0);
  } finally { await h.dispose(); }
});

test('unresolved mixed draft cannot omit a named line or replace an existing draft',async()=>{
  const h=await harness({transcript:mixedCommand,inventoryItems:mixedInventory.filter(i=>i.id!=='a')});
  try {
    h.drafts.writeDraft(h.sessionTools.captureSession(),[{item:mixedInventory[1],quantity:7,source:'manual'}]);
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); await h.press('Send question');
    const draft=h.drafts.getDraft(h.sessionTools.captureSession());
    assert.equal(draft.rows.length,1); assert.equal(draft.rows[0].quantity,7); assert.equal(draft.attempt,undefined);
    assert.ok(h.tree.root.findAllByType('Text').some(n=>n.children.join('').includes('No draft changes were made')));
  } finally { await h.dispose(); }
});

test('voice setup follows listening, understanding and reply stages with distinct controls',async()=>{
  const h=await harness({mode:'settings',cloudAvailable:true,pocketBuild:true,pocketReady:true,selectedPocket:true});
  try {
    const headings=h.tree.root.findAll(n=>n.type==='Text' && n.props.accessibilityRole==='header').map(n=>n.children.join(''));
    assert.deepEqual(headings,['Tap to talk','Listening · speech to text','Understanding · text to task','Spoken replies']);
    await h.press('Relaxed pace'); assert.equal(h.prefs.speechPace,0.9);
    assert.equal(h.prefs.cloud,false); assert.equal(h.prefs.audioOptIn,false);
    await h.press('Enable Groq understanding'); await h.confirm();
    assert.equal(h.prefs.cloud,true); assert.equal(h.prefs.inputProvider,'offline'); assert.equal(h.prefs.speechProvider,'pocket');
  } finally { await h.dispose(); }
});

test('cancelled Alba download cannot change voice preferences when its promise settles late', async () => {
  let finish;
  const pocketDownloadWait = new Promise(resolve => { finish = resolve; });
  const h = await harness({ mode: 'settings', pocketBuild: true, pocketDownloadWait });
  try {
    await h.press('Download Alba voice pack'); await h.confirm();
    assert.equal(h.calls.pocketDownloads, 1);
    await h.press('Cancel voice download');
    await act(async () => { finish(); await pocketDownloadWait; });
    assert.equal(h.prefs.speechProvider, 'device'); assert.equal(h.prefs.microphone, true);
    assert.equal(h.prefs.spokenReplies, false); assert.equal(h.calls.stock, 0);
  } finally { finish(); await h.dispose(); }
});
