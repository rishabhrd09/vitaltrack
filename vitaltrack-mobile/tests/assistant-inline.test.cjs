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

async function harness({ personalSetup = false, personalConfigured = false, personalUsable = false, personalSource = false, keyWait, sarvamAvailable = false, sarvamConsented = false, selectedSarvam = false, sarvamPlayback, inventoryItems, pocketBuild = false, pocketReady = false, selectedPocket = false, pocketSpeech, pocketOutput, pocketDiagnostics = 'Native audio details', pocketDownloadWait, speechFallback, spokenReplies = false, ready = true, permission = true, canAskAgain = false, mode, listen, embedded = !mode, deviceReady = true, permissionBackground = false, permissionAlreadyGranted = false, permissionReturnsInBackground = false, permissionMayAskInitially = true, rememberBackground = false, cloudAvailable = false, cloudConsented = false, cloudFailure = false, cloudV2Response, cloudV3Response, categories = [], firstCapabilityFailure = false, consentFailure = false, onlineListening = false, audioConsented = false, audioFailure = false, transcript = 'How many hand gloves are left?', inventoryName = 'Hand gloves', permissionWait, liveCapture = false, width = 390, fontScale = 1, preferenceSaveWait } = {}) {
  const calls = { navigation: [], stock: 0, transcribe: 0, stop: 0, record: 0, permission: 0, interpret: [], consent: [], cloudAudio: 0 };
  const listeners = new Set();
  const lifecycle = state => { for (const listener of [...listeners]) listener(state); };
  let nativeEvent;
  let liveListener;
  let capabilityCalls = 0;
  let pendingAlert;
  const unavailable = { interpret: false, scopes: [], consented: false, transcription_providers: [], speech_providers: [] };
  let scopes = [...(cloudConsented ? ['groq_text'] : []), ...(audioConsented ? ['groq_audio'] : []), ...(sarvamConsented ? ['sarvam_speech'] : [])];
  const prefs = { enabled: true, microphone: true, spokenReplies, audioOptIn: onlineListening, sarvamSpeechOptIn: selectedSarvam, sarvamKeySource: personalSource ? 'personal' : undefined, inputProvider: onlineListening ? 'groq' : 'offline', speechProvider: selectedSarvam ? 'sarvam' : selectedPocket ? 'pocket' : 'device', cloud: cloudConsented, ...(speechFallback ? { speechFallback } : {}) };
  const recorder = { uri: 'file:///cache/test.m4a', isRecording: false,
    prepareToRecordAsync: async () => {}, record() { this.isRecording = true; calls.record++; },
    async stop() { this.isRecording = false; calls.stop++; },
  };
  const policy = load('features/assistant/policy.ts');
  const permittedSpeechProvider = load('features/assistant/preferences.ts', { '@react-native-async-storage/async-storage': {}, './policy': policy }).permittedSpeechProvider;
  const appState = { currentState: 'active', addEventListener: (_, fn) => { listeners.add(fn); return { remove() { listeners.delete(fn); } }; } };
  const rn = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'Text', 'TextInput', 'TouchableOpacity', 'View', 'ScrollView', 'Switch'].map(name => [name, host(name)]));
  rn.Modal = ({ visible, children }) => visible ? React.createElement('Modal', {}, children) : null;
  Object.assign(rn, { StyleSheet: { create: v => v, absoluteFill: {}, hairlineWidth: 1 }, Keyboard: { dismiss() { calls.keyboardDismiss = (calls.keyboardDismiss || 0) + 1; } }, BackHandler: { addEventListener: () => ({ remove() {} }) }, useWindowDimensions: () => ({ width, height: 844, fontScale }), Animated: { Value: class { setValue() {} }, View: host('AnimatedView'), timing: () => ({ start() {}, stop() {} }), sequence: () => ({}), loop: () => ({ start() {}, stop() {} }) }, Platform: { OS: 'android' }, AppState: appState,
    AccessibilityInfo: { isScreenReaderEnabled: async () => false, isReduceMotionEnabled: async () => true, addEventListener: () => ({ remove() {} }) },
    Alert: { alert(title, message, buttons) { pendingAlert = buttons; } }, Linking: { openSettings: async () => {} } });
  let owner = 'test-user', epoch = 0;
  const authListeners = new Set();
  const auth = fn => fn({ isAuthenticated: true, user: { id: owner } });
  auth.subscribe = fn => { authListeners.add(fn); return () => authListeners.delete(fn); };
  const colors = load('theme/colors.ts').colors;
  const core = load('features/assistant/core.ts', { '../../types': load('types/index.ts') });
  const types = load('types/index.ts');
  const contracts = load('features/assistant/contracts.ts');
  const selection = load('features/assistant/selection.ts', { '@/types': types, './core': core, './contracts': contracts });
  const queries = load('features/assistant/queries.ts', { '@/types': types, './core': core, './contracts': contracts, './selection': selection });
  const sessionTools = { captureSession: () => ({ owner, epoch }), assertSession(session) { if (session.owner !== owner || session.epoch !== epoch) throw new Error('Session changed'); } };
  auth.getState = () => ({ isAuthenticated: true, user: { id: owner } });
  const drafts = load('features/assistant/drafts.ts', { react: React, '@/store/useAuthStore': { useAuthStore: auth }, '@/services/assistantSession': sessionTools, '@/types': types, '@/utils/helpers': { generateId: () => 'synthetic-submission' }, './selection': selection, './contracts': contracts });
  rn.FlatList = ({ data, renderItem, ListHeaderComponent }) => React.createElement('FlatList', {}, ListHeaderComponent, data.map((item,index) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item,index }))));
  const uiDeps = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn, '@expo/vector-icons': { Ionicons: host('Icon') }, '@/theme/ThemeContext': { useTheme: () => ({ colors }) } };
  const layer = load('components/assistant/AssistantLayer.tsx', uiDeps);
  const dock = load('components/assistant/AssistantDock.tsx', uiDeps);
  const table = load('components/assistant/AnswerList.tsx', { ...uiDeps, react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn, '@/theme/ThemeContext': { useTheme: () => ({ colors }) }, '@/features/assistant/queries': queries, '@/types': types });
  const Screen = load('components/assistant/AssistantExperience.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn,
    'expo-router': { useLocalSearchParams: () => ({ mode, listen }), useRouter: () => Object.fromEntries(['navigate', 'setParams', 'back', 'replace'].map(name => [name, value => calls.navigation.push([name, value])])) },
    '@expo/vector-icons': { Ionicons: host('Icon') }, 'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') },
    'expo-audio': { RecordingPresets: { HIGH_QUALITY: {} }, AudioModule: { getRecordingPermissionsAsync: async () => ({ granted: permissionAlreadyGranted, canAskAgain: permissionMayAskInitially }), requestRecordingPermissionsAsync: async () => { calls.permission++; if (permissionBackground) { appState.currentState = 'background'; lifecycle('background'); await Promise.resolve(); if (!permissionReturnsInBackground) { appState.currentState = 'active'; lifecycle('active'); } } if (permissionWait) await permissionWait; return { granted: permission, canAskAgain }; } },
      setAudioModeAsync: async () => {}, useAudioRecorder: (_, cb) => { nativeEvent = cb; return recorder; },
      useAudioRecorderState: () => ({ durationMillis: 1000, metering: -20 }), useAudioPlayerStatus: () => ({}) },
    'expo-file-system/legacy': {}, 'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async () => {} }, '@/store/useAuthStore': { useAuthStore: auth }, '@/theme/ThemeContext': { useTheme: () => ({ colors }) },
    '@/services/assistantSession': sessionTools,
    '@/services/assistant': { unavailable,
      capabilities: async () => { if (++capabilityCalls === 1 && firstCapabilityFailure) throw new Error('Cold start'); return { ...unavailable, interpret: cloudAvailable, interpret_contracts: cloudV3Response ? [1,2,3] : cloudV2Response ? [1,2] : [1], scopes, consented: scopes.length > 0, transcription_providers: cloudAvailable ? ['groq'] : [], speech_providers: sarvamAvailable || personalUsable ? ['sarvam'] : [], sarvam_application_available: sarvamAvailable, sarvam_personal_key: { setup_available: personalSetup, configured: personalConfigured, usable: personalUsable, updated_at: null } }; },
      saveSarvamKey: async (_, key, signal) => { calls.savedKey = key; calls.keySignal = signal; if (keyWait) await keyWait; personalConfigured = true; personalUsable = true; },
      removeSarvamKey: async () => { calls.removedKey = (calls.removedKey || 0) + 1; personalConfigured = false; personalUsable = false; },
      setConsent: async (session, next) => { (calls.consentOwners ||= []).push(session.owner); calls.consent.push([...next]); if (consentFailure) throw new Error('Unavailable'); scopes = [...next]; },
      interpret: async (_, text) => { calls.interpret.push(text); if (cloudFailure) throw new Error('Quota or network unavailable'); return core.command('low_stock'); },
      interpretExpanded: async (_,text) => { calls.interpret.push(text); return contracts.validateSpecification(cloudV2Response); },
      interpretPlan: async (_,text,previous) => { calls.interpret.push(text); (calls.planRequests ||= []).push({ text, previous }); return contracts.validatePlan(cloudV3Response); },
      transcribe: async () => { calls.cloudAudio++; if (audioFailure) throw new Error('Online transcription unavailable'); return { transcript }; },
      speak: async () => { calls.cloudAudio++; throw new Error('Speech must stay local'); },
    }, '@/features/assistant/sarvam': load('features/assistant/sarvam.ts'),
    '@/components/assistant/SarvamKeySettings': load('components/assistant/SarvamKeySettings.tsx', { ...uiDeps, './VoiceSetup': { VoiceButton } }),
    '@/features/assistant/core': core,
    '@/features/assistant/contracts': contracts, '@/features/assistant/queries': queries, '@/features/assistant/drafts': drafts, '@/features/assistant/selection': selection, '@/types': types,
    '@/components/assistant/AnswerList': table, '@/components/assistant/AssistantDock': dock, '@/components/assistant/AssistantLayer': layer, '@/utils/inventoryPdfExport': { exportInventoryPdf: async () => { calls.inventoryPdf = (calls.inventoryPdf || 0) + 1; return { shared: true }; } },
    '@/features/assistant/cloudSpeech': { playSarvamSpeech: async (session, text, pace, signal, onStatus, source, onPlaybackStarted) => { (calls.sarvamSpeech ||= []).push({ text, pace, signal, source }); onStatus('Reading aloud with Sarvam…'); if (sarvamPlayback) await sarvamPlayback(signal, onPlaybackStarted); } },
    '@/features/assistant/narration': load('features/assistant/narration.ts'),
    '@/features/assistant/preferences': { permittedSpeechProvider, defaults: { ...prefs, enabled: false }, loadPreferences: async () => ({ ...prefs }), savePreferences: async (owner, next) => { (calls.preferenceSaveOwners ||= []).push(owner); if (preferenceSaveWait) await preferenceSaveWait; Object.assign(prefs, next); } },
    '@/features/assistant/snapshot': { cachedCategoryNames: () => [], cachedItemNames: () => inventoryItems ? inventoryItems.filter(i=>i.isActive).map(i=>i.name) : [inventoryName], categorySnapshot: async () => { calls.categories = (calls.categories || 0) + 1; return categories; }, inventorySnapshot: async () => { calls.stock++; return { items: inventoryItems || [{ id: 'g', name: inventoryName, quantity: 18, minimumStock: 5, unit: 'pairs', isActive: true }], timestamp: Date.now(), stale: false }; } },
    '@/features/assistant/audioFiles': { rememberAudio: async () => { if (rememberBackground) { appState.currentState = 'background'; lifecycle('background'); } }, discardAudio: async () => {} },
    '@/features/assistant/capture': load('features/assistant/capture.ts'),
    '@/features/assistant/offlineVoice': { pocketVoiceSupported: pocketBuild, pocketOutputCheckSupported: pocketBuild, pocketVoice: {
      status: async () => ({ ready: pocketReady, supported: pocketBuild, bytes: 208767942, name: 'Alba' }),
      download: async () => { calls.pocketDownloads = (calls.pocketDownloads || 0) + 1; if (pocketDownloadWait) await pocketDownloadWait; pocketReady = true; },
      remove: async () => { pocketReady = false; }, progress: () => ({ remove() {} }), licences: async () => 'file:///licences.zip',
      speak: async (text, pace) => { (calls.pocketSpeech ||= []).push({ text, pace }); if (pocketSpeech) return await pocketSpeech(); },
      checkOutput: async () => { calls.outputChecks = (calls.outputChecks || 0) + 1; return pocketOutput ? await pocketOutput() : { output: 'Phone speaker', volumePercent: 60, frames: 12000, audioSeconds: 0.5 }; },
      diagnostics: async () => pocketDiagnostics,
    }, offlineSupported: true, liveCaptureSupported: liveCapture, createLiveRecorder: () => Object.assign(recorder, { configure() {}, subscribe(listener) { liveListener = listener; return { remove() { liveListener = null; } }; } }), offlineVoice: { status: async () => ({ ready, bytes: 100 }),
      download: async () => { ready = true; }, remove: async () => { ready = false; }, deviceStatus: async () => ({ ready: deviceReady, name: 'English' }), progress: () => ({ remove() {} }), cancel() {},
      transcribe: async () => { calls.transcribe++; return { transcript }; }, speak: async text => { calls.deviceSpeech = (calls.deviceSpeech || 0) + 1; (calls.deviceTexts ||= []).push(text); } } },
    '@/features/assistant/policy': load('features/assistant/policy.ts'), '@/features/assistant/readiness': load('features/assistant/readiness.ts'),
    '@/features/assistant/providers': load('features/assistant/providers.ts', { './policy': policy, './sarvam': load('features/assistant/sarvam.ts') }),
    '@/components/assistant/VoiceSetup': mode ? load('components/assistant/VoiceSetup.tsx', {
      react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn,
      '@expo/vector-icons': { Ionicons: host('Icon') }, '@/theme/ThemeContext': { useTheme: () => ({ colors }) },
      '@/features/assistant/policy': policy, '@/features/assistant/core': core, '@/features/assistant/notices': { offlineSpeechNotice: 'Offline model licence', pocketSpeechNotice: 'Pocket model licence' },
      '@/features/assistant/narration': load('features/assistant/narration.ts'),
      '@/features/assistant/providers': load('features/assistant/providers.ts', { './policy': policy, './sarvam': load('features/assistant/sarvam.ts') }),
    }) : { default: host('VoiceSetup'), VoiceButton },
  }).default;
  let tree;
  const render = props => React.createElement(layer.AssistantLayerProvider, {}, React.createElement(Screen, props));
  await act(async () => { tree = create(render({ embedded, active: true, screenKey: 'dashboard' })); });
  const find = label => tree.root.findAll(node => typeof node.type === 'string' && (node.props.accessibilityLabel === label || node.props.label === label || (node.type === 'TouchableOpacity' && node.findAllByType('Text').some(t => t.children.join('') === label))))[0];
  return { calls, prefs, recorder, tree, find, drafts, sessionTools,
    switchAccount: async () => { await act(async () => { const old = owner; owner = 'other-user'; epoch++; scopes = []; for (const listener of [...authListeners]) listener({ isAuthenticated:true, user:{ id:owner } }, { isAuthenticated:true, user:{ id:old } }); tree.update(render({ embedded, active:true, screenKey:'dashboard' })); }); },
    withdrawRemotely: () => { scopes = []; },
    confirm: async () => { await act(async () => { await pendingAlert.at(-1).onPress(); }); },
    editKey: async value => { await act(async () => { find('Personal Sarvam API key').props.onChangeText(value); }); },
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


test('Alba selection and new downloads are unavailable; previous selections use device voice', async () => {
  const h = await harness({ mode: 'settings', pocketBuild: true, pocketReady: true, selectedPocket: true, spokenReplies: true });
  try {
    assert.equal(h.find('Use Alba voice'), undefined);
    assert.equal(h.find('Download Alba voice pack'), undefined);
    assert.equal(h.find('Use Alba & read answers aloud'), undefined);
    await h.press('Preview voice');
    assert.equal(h.calls.deviceSpeech, 1); assert.equal(h.calls.pocketSpeech?.length || 0, 0);
    assert.equal(h.calls.cloudAudio, 0); assert.equal(h.calls.sarvamSpeech?.length || 0, 0);
    await h.press('Remove Alba voice pack'); await h.confirm();
    assert.equal(h.prefs.microphone, true); assert.equal(h.prefs.spokenReplies, true);
  } finally { await h.dispose(); }
});

test('Sarvam narration asks for its own consent and preserves microphone and Groq settings', async () => {
  const h = await harness({ mode: 'settings', sarvamAvailable: true, cloudAvailable: true, cloudConsented: true, onlineListening: true, audioConsented: true });
  try {
    await h.press('Use Sarvam English voice');
    assert.equal(h.prefs.speechProvider, 'device'); assert.equal(h.calls.consent.length, 0);
    await h.confirm();
    assert.deepEqual(h.calls.consent[0], ['groq_text', 'groq_audio', 'sarvam_speech']);
    assert.equal(h.prefs.speechProvider, 'sarvam'); assert.equal(h.prefs.inputProvider, 'groq');
    assert.equal(h.prefs.microphone, true); assert.equal(h.prefs.cloud, true);
    assert.equal(h.prefs.spokenReplies, false);
    await h.press('Preview voice'); assert.equal(h.calls.sarvamSpeech.length, 1);
    assert.equal(h.calls.cloudAudio, 0); assert.equal(h.calls.stock, 0);
    assert.equal(h.find('Sarvam listening'), undefined); assert.equal(h.find('Kokoro speech'), undefined);
  } finally { await h.dispose(); }
});

test('Sarvam preview works without a device voice or recognition pack', async () => {
  const h = await harness({ mode: 'settings', sarvamAvailable: true, sarvamConsented: true, selectedSarvam: true, deviceReady: false, ready: false });
  try {
    await h.press('Relaxed pace'); await h.press('Preview voice');
    assert.equal(h.calls.sarvamSpeech[0].pace, 0.9); assert.equal(h.calls.deviceSpeech || 0, 0);
    assert.equal(h.calls.permission, 0); assert.equal(h.calls.record, 0);
  } finally { await h.dispose(); }
});

test('online speech unavailable or unconsented never uploads an answer', async () => {
  for (const flags of [{ sarvamAvailable: false, sarvamConsented: true }, { sarvamAvailable: true, sarvamConsented: false }]) {
    const h = await harness({ mode: 'settings', selectedSarvam: true, ...flags });
    try { assert.equal(h.find('Preview voice').props.disabled, true); assert.equal(h.calls.sarvamSpeech?.length || 0, 0); }
    finally { await h.dispose(); }
  }
});

test('failed Sarvam narration keeps the verified answer and does not switch providers', async () => {
  const h = await harness({ embedded: false, selectedSarvam: true, sarvamAvailable: true, sarvamConsented: true, spokenReplies: true,
    sarvamPlayback: async () => { throw new Error('Sarvam speech timed out.'); } });
  try {
    await h.typeQuestion('How many hand gloves are left?'); await h.press('Show answer');
    assert.ok(h.tree.root.findAllByType('Text').some(n => n.children.join('').includes('18 pairs remaining')));
    assert.ok(h.tree.root.findAllByType('Text').some(n => n.children.join('').includes('Sarvam speech timed out.')));
    assert.equal(h.calls.sarvamSpeech.length, 1); assert.equal(h.calls.deviceSpeech || 0, 0);
    assert.equal(h.calls.pocketSpeech?.length || 0, 0); assert.equal(h.calls.stock, 1);
  } finally { await h.dispose(); }
});

test('Sarvam preview stays busy until playback completes and stops on background', async () => {
  let finish; const waiting = new Promise(resolve => { finish = resolve; });
  const h = await harness({ mode: 'settings', selectedSarvam: true, sarvamAvailable: true, sarvamConsented: true, sarvamPlayback: () => waiting });
  try {
    await h.press('Preview voice'); assert.equal(h.find('Preview voice').props.disabled, true);
    await h.background(); assert.equal(h.calls.sarvamSpeech[0].signal.aborted, true);
    await act(async () => { finish(); await waiting; });
    assert.equal(h.find('Preview voice').props.disabled, false);
    assert.ok(!h.tree.root.findAllByType('Text').some(n => n.children.join('') === 'Sarvam voice playback completed.'));
  } finally { finish(); await h.dispose(); }
});

test('a second question cancels earlier speech and uses a new non-aborted turn', async () => {
  let finish; const waiting = new Promise(resolve => { finish = resolve; }); let first = true;
  const h = await harness({ selectedSarvam: true, sarvamAvailable: true, sarvamConsented: true, spokenReplies: true,
    sarvamPlayback: async () => { if (first) { first = false; await waiting; } } });
  try {
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); await h.press('Send question');
    assert.equal(h.calls.sarvamSpeech.length, 1);
    await h.press('Ask another question'); assert.equal(h.calls.sarvamSpeech[0].signal.aborted, true);
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); await h.press('Send question');
    assert.equal(h.calls.record, 2); assert.equal(h.calls.sarvamSpeech.length, 2);
    assert.equal(h.calls.sarvamSpeech[1].signal.aborted, false); assert.equal(h.calls.stock, 2);
    await act(async () => { finish(); await waiting; });
  } finally { finish(); await h.dispose(); }
});

test('withdrawing all cloud consent returns narration to device voice', async () => {
  const h = await harness({ mode: 'settings', selectedSarvam: true, sarvamAvailable: true, sarvamConsented: true, spokenReplies: true,
    cloudAvailable: true, cloudConsented: true, onlineListening: true, audioConsented: true });
  try {
    await h.press('Withdraw all cloud consent');
    assert.equal(h.prefs.speechProvider, 'device'); assert.equal(h.prefs.spokenReplies, true);
    assert.equal(h.prefs.inputProvider, 'offline'); assert.equal(h.prefs.audioOptIn, false);
    assert.deepEqual(h.calls.consent.at(-1), []); assert.equal(h.calls.sarvamSpeech?.length || 0, 0);
  } finally { await h.dispose(); }
});

test('sound check uses no speech model, cloud call or inventory fetch', async () => {
  const h = await harness({ mode: 'settings', pocketBuild: true });
  try {
    await h.press('Check audio output'); assert.equal(h.calls.outputChecks, 1);
    assert.equal(h.calls.stock, 0); assert.equal(h.calls.pocketDownloads || 0, 0);
    assert.equal(h.calls.sarvamSpeech?.length || 0, 0); assert.equal(h.calls.pocketSpeech?.length || 0, 0);
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

test('voice setup separates listening, understanding and narration controls', async () => {
  const h = await harness({ mode: 'settings', cloudAvailable: true, sarvamAvailable: true });
  try {
    const headings = h.tree.root.findAll(n => n.type === 'Text' && n.props.accessibilityRole === 'header').map(n => n.children.join(''));
    assert.deepEqual(headings, ['Assistant', 'Listening · speech to text', 'Understanding · text to task', 'Spoken replies']);
    await h.press('Use Sarvam English voice'); await h.confirm();
    await h.press('Relaxed pace'); assert.equal(h.prefs.speechPace, 0.9);
    assert.equal(h.prefs.cloud, false); assert.equal(h.prefs.audioOptIn, false);
    await h.press('Enable Groq understanding'); await h.confirm();
    assert.equal(h.prefs.cloud, true); assert.equal(h.prefs.inputProvider, 'offline'); assert.equal(h.prefs.speechProvider, 'sarvam');
    assert.deepEqual(h.calls.consent.at(-1), ['sarvam_speech', 'groq_text']);
  } finally { await h.dispose(); }
});


test('saving a personal key is encrypted-storage confirmation, never narration or Groq opt-in', async () => {
  const h = await harness({ mode: 'settings', personalSetup: true });
  try {
    await h.editKey('synthetic-personal-key');
    await h.press('Save personal key');
    assert.equal(h.calls.savedKey, undefined);
    await h.confirm();
    assert.equal(h.calls.savedKey, 'synthetic-personal-key');
    assert.equal(h.find('Personal Sarvam API key').props.value, '');
    assert.equal(h.prefs.sarvamKeySource, 'personal');
    assert.equal(h.prefs.speechProvider, 'device');
    assert.equal(h.prefs.spokenReplies, false);
    assert.equal(h.calls.consent.length, 0);
    assert.equal(h.calls.sarvamSpeech?.length || 0, 0);
    assert.equal(JSON.stringify(h.prefs).includes('synthetic-personal-key'), false);
    await h.press('Use Sarvam English voice'); await h.confirm();
    assert.deepEqual(h.calls.consent.at(-1), ['sarvam_speech']);
    assert.equal(h.prefs.inputProvider, 'offline'); assert.equal(h.prefs.cloud, false);
    await h.press('Test personal key & voice');
    assert.equal(h.calls.sarvamSpeech.at(-1).source, 'personal');
    assert.equal(h.prefs.spokenReplies, false);
  } finally { await h.dispose(); }
});

test('personal key replacement and removal stay scoped; removal selects device instead of shared billing', async () => {
  const h = await harness({ mode: 'settings', personalSetup: true, personalConfigured: true, personalUsable: true, personalSource: true, selectedSarvam: true, sarvamAvailable: true, sarvamConsented: true });
  try {
    await h.editKey('synthetic-replacement-key'); await h.press('Replace personal key'); await h.confirm();
    assert.equal(h.calls.savedKey, 'synthetic-replacement-key');
    await h.press('Remove personal key'); await h.confirm();
    assert.equal(h.calls.removedKey, 1); assert.equal(h.prefs.speechProvider, 'device');
    assert.equal(h.prefs.sarvamKeySource, 'personal');
    await h.press('Use application Sarvam account');
    assert.equal(h.prefs.sarvamKeySource, 'application');
  } finally { await h.dispose(); }
});

test('missing personal key never uses the available application voice', async () => {
  const h = await harness({ personalSetup: true, personalSource: true, selectedSarvam: true, sarvamAvailable: true, sarvamConsented: true, spokenReplies: true });
  try {
    await h.press('Start voice recording'); await h.press('Stop recording and review transcript'); await h.press('Send question');
    assert.equal(h.calls.sarvamSpeech?.length || 0, 0);
    assert.equal(h.calls.deviceSpeech || 0, 0);
    assert.ok(h.tree.root.findAllByType('Text').some(n => n.children.join('').includes('Shared credits were not used')));
  } finally { await h.dispose(); }
});

test('backgrounding clears unsaved key input and cancels an open save confirmation', async () => {
  const h = await harness({ mode: 'settings', personalSetup: true });
  try {
    await h.editKey('synthetic-personal-key'); await h.press('Save personal key');
    await h.background(); await h.foreground(); await h.confirm();
    assert.equal(h.calls.savedKey, undefined);
    assert.equal(h.find('Personal Sarvam API key').props.value, '');
  } finally { await h.dispose(); }
});

test('stale save and removal confirmations cannot act after leaving voice setup', async () => {
  for (const remove of [true, false]) {
    const h = await harness({ mode: 'settings', personalSetup: true, personalConfigured: remove, personalUsable: remove });
    if (!remove) await h.editKey('synthetic-personal-key');
    await h.press(remove ? 'Remove personal key' : 'Save personal key');
    await h.dispose(); await h.confirm();
    assert.equal(h.calls.savedKey, undefined); assert.equal(h.calls.removedKey, undefined);
  }
});

test('background cancels key save response and cannot enable voice from a late save', async () => {
  let finish; const waiting = new Promise(resolve => { finish = resolve; });
  const h = await harness({ mode: 'settings', personalSetup: true, keyWait: waiting });
  try {
    await h.editKey('synthetic-personal-key'); await h.press('Save personal key'); await h.confirm();
    await h.background(); assert.equal(h.calls.keySignal.aborted, true);
    finish(); await act(async () => { await Promise.resolve(); });
    assert.equal(h.prefs.sarvamKeySource, undefined); assert.equal(h.prefs.speechProvider, 'device');
  } finally { await h.dispose(); }
});

const visibleTexts = h => h.tree.root.findAllByType('Text').map(n => n.children.join(''));
test('opted-in offline fallback reads the same verified answer once after a Sarvam failure', async () => {
  const h = await harness({ embedded: false, selectedSarvam: true, sarvamAvailable: true, sarvamConsented: true, spokenReplies: true, speechFallback: 'device',
    sarvamPlayback: async () => { throw new Error('Sarvam speech timed out.'); } });
  try {
    await h.typeQuestion('How many hand gloves are left?'); await h.press('Show answer');
    const texts = visibleTexts(h);
    assert.ok(texts.some(t => t.includes('18 pairs remaining')));
    assert.equal(h.calls.sarvamSpeech.length, 1, 'no second online (paid) request');
    assert.equal(h.calls.deviceSpeech, 1);
    assert.equal(h.calls.deviceTexts[0], h.calls.sarvamSpeech[0].text, 'the same validated short answer');
    assert.ok(texts.some(t => t.includes('Read aloud with Device voice (offline) because Sarvam was unavailable.')));
    assert.ok(!texts.some(t => t.includes('Sarvam speech timed out.')));
    assert.equal(h.calls.sarvamSpeech[0].source, 'application', 'billing source unchanged');
    assert.equal(h.calls.stock, 1); assert.equal(h.calls.pocketSpeech?.length || 0, 0);
  } finally { await h.dispose(); }
});

test('the fallback never repeats an answer Sarvam had started reading', async () => {
  const h = await harness({ embedded: false, selectedSarvam: true, sarvamAvailable: true, sarvamConsented: true, spokenReplies: true, speechFallback: 'device',
    sarvamPlayback: async (_, started) => { started(); throw new Error('Audio playback did not finish. Please retry or select device voice.'); } });
  try {
    await h.typeQuestion('How many hand gloves are left?'); await h.press('Show answer');
    assert.equal(h.calls.deviceSpeech || 0, 0);
    assert.ok(visibleTexts(h).some(t => t.includes('Audio playback did not finish.')));
  } finally { await h.dispose(); }
});

test('an unavailable fallback voice is reported honestly and nothing is read', async () => {
  const h = await harness({ embedded: false, selectedSarvam: true, sarvamAvailable: true, sarvamConsented: true, spokenReplies: true, speechFallback: 'device', deviceReady: false,
    sarvamPlayback: async () => { throw new Error('Sarvam speech timed out.'); } });
  try {
    await h.typeQuestion('How many hand gloves are left?'); await h.press('Show answer');
    assert.equal(h.calls.deviceSpeech || 0, 0);
    assert.ok(visibleTexts(h).some(t => t.includes('Sarvam speech timed out.') && t.includes('not ready on this phone')));
    assert.ok(visibleTexts(h).some(t => t.includes('18 pairs remaining')));
  } finally { await h.dispose(); }
});

test('Stop during Sarvam narration never starts the offline fallback', async () => {
  const h = await harness({ embedded: false, selectedSarvam: true, sarvamAvailable: true, sarvamConsented: true, spokenReplies: true, speechFallback: 'device',
    sarvamPlayback: signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Speech cancelled.')), { once: true })) });
  try {
    await h.typeQuestion('How many hand gloves are left?'); await h.press('Show answer');
    await h.press('Cancel / stop speech');
    assert.equal(h.calls.sarvamSpeech[0].signal.aborted, true); assert.equal(h.calls.deviceSpeech || 0, 0);
  } finally { await h.dispose(); }
});

test('choosing a fallback previews that voice first, saves it only afterwards, and can turn it off', async () => {
  const h = await harness({ mode: 'settings', selectedSarvam: true, sarvamAvailable: true, sarvamConsented: true });
  try {
    assert.equal(h.find('Use an offline voice when online speech is unavailable').props.value, false, 'off by default');
    assert.equal(h.find('Preview & use device voice'), undefined);
    await h.toggle('Use an offline voice when online speech is unavailable', true);
    assert.equal(h.prefs.speechFallback, undefined, 'not saved before a preview');
    await h.press('Preview & use device voice');
    assert.equal(h.calls.deviceSpeech, 1); assert.equal(h.prefs.speechFallback, 'device');
    assert.equal(h.prefs.speechProvider, 'sarvam', 'the online voice choice is unchanged');
    assert.equal(h.find('Preview & use Alba'), undefined, 'Alba is not offered while paused');
    await h.toggle('Use an offline voice when online speech is unavailable', false);
    assert.equal(h.prefs.speechFallback, undefined);
    assert.equal(h.calls.sarvamSpeech?.length || 0, 0, 'choosing a fallback sends nothing online');
  } finally { await h.dispose(); }
});

const planInventory = [
  { id:'a', name:'Ambu Bag', quantity:1, minimumStock:1, unit:'units', isActive:true, isCritical:false, version:2, categoryId:'e' },
  { id:'g', name:'Hand gloves', quantity:2, minimumStock:5, unit:'pairs', isActive:true, isCritical:false, version:3, categoryId:'w', supplierName:'Good Supplier' },
  { id:'m', name:'Masks', quantity:0, minimumStock:4, unit:'boxes', isActive:true, isCritical:false, version:1, categoryId:'w', supplierName:'Good Supplier' },
  { id:'s', name:'Saline', quantity:10, minimumStock:5, unit:'bottles', isActive:true, isCritical:false, version:1, categoryId:'f' },
  { id:'v', name:'Ventilator circuit', quantity:3, minimumStock:2, unit:'units', isActive:true, isCritical:true, version:1, categoryId:'e' },
];
const texts = h => h.tree.root.findAllByType('Text').map(n => n.children.join(''));
const hasText = (h, part) => texts(h).some(t => t.includes(part));

test('a comparison question is answered on the phone with filters, units, status text and a reason per row', async () => {
  const h = await harness({ embedded:false, inventoryItems:planInventory });
  try {
    await h.typeQuestion('How many items have quantity less than 3? Show their names, quantities and status.'); await h.press('Show answer');
    assert.equal(h.calls.interpret.length, 0); assert.equal(h.calls.stock, 1);
    assert.ok(hasText(h, 'Filters understood: quantity < 3'));
    for (const name of ['Ambu Bag', 'Hand gloves', 'Masks']) assert.ok(hasText(h, name), name);
    assert.ok(!hasText(h, 'Saline'));
    assert.ok(hasText(h, 'Why: Quantity 2 is less than 3'));
    assert.ok(hasText(h, 'Out of stock') && hasText(h, 'Low stock'), 'status is text, not colour alone');
    const row = h.tree.root.findAll(n => typeof n.type === 'string' && /^2\. Hand gloves/.test(n.props.accessibilityLabel || ''))[0];
    assert.match(row.props.accessibilityLabel, /2 pairs\. Low stock\. Why: Quantity 2 is less than 3/);
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()), null, 'a question never creates a draft');
    // Refinements are offered only when they change the list; the follow-up narrows the rows on screen.
    // Ambu Bag is critical equipment by the name rule, so "Only critical" would change this list too.
    assert.ok(h.find('Only out of stock') && h.find('Only critical') && h.find('Draft these items'));
    await h.press('Only out of stock');
    assert.ok(hasText(h, 'quantity < 3 → within the previous results · out of stock'));
    assert.ok(hasText(h, 'Masks') && !hasText(h, 'Hand gloves'));
  } finally { await h.dispose(); }
});

test('version 3 is negotiated and exclusions cannot be silently downgraded on older servers', async () => {
  const question = 'Which supplies are getting short, apart from the gloves?';
  const plan = { version:3, intent:'inventory_query', selection:{ scope:'inventory', sort:'priority', any_of:[{ item_queries:[], stock:['low','out'], quantity:[], critical:null, category:null, supplier:null, brand:null, missing_supplier:false }],
    exclude:[{ item_queries:['gloves'], stock:[], quantity:[], critical:null, category:null, supplier:null, brand:null, missing_supplier:false }] }, draft:null, clarify_reason:null };
  const h = await harness({ embedded:false, inventoryItems:planInventory, cloudAvailable:true, cloudConsented:true, cloudV3Response:plan });
  try {
    await h.typeQuestion(question); await h.press('Show answer');
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls.planRequests)), [{ text:question, previous:false }]);
    assert.ok(hasText(h, 'Consider ordering now') && hasText(h, 'Excluded by your request: Hand gloves'));
  } finally { await h.dispose(); }
  const old = await harness({ embedded:false, inventoryItems:planInventory, cloudAvailable:true, cloudConsented:true,
    cloudV2Response:{ version:2, intent:'inventory_query', draft_mode:null, query:{ status:'attention', category:null, supplier:null, brand:null, missing_supplier:false, item_queries:[], sort:'none', previous:false }, lines:[], include_low:false, include_out:false } });
  try {
    await old.typeQuestion(question); await old.press('Show answer');
    assert.equal(old.calls.planRequests, undefined); assert.deepEqual(old.calls.interpret, []);
    assert.ok(hasText(old, 'This request needs interpretation contract 3'));
    assert.equal(old.calls.stock, 0); assert.equal(old.drafts.getDraft(old.sessionTools.captureSession()), null);
  } finally { await old.dispose(); }
});

test('a mixed draft shows explicit and suggested quantities and saves nothing', async () => {
  const h = await harness({ embedded:false, inventoryItems:planInventory });
  try {
    await h.typeQuestion('Two units of Ambu Bag, plus the other low-stock and out-of-stock items; prepare an order draft.'); await h.press('Show answer');
    const draft = h.drafts.getDraft(h.sessionTools.captureSession());
    assert.deepEqual(JSON.parse(JSON.stringify(draft.rows.map(r => [r.item.id, r.quantity, r.source]))), [['a', 2, 'spoken'], ['g', 3, 'suggested'], ['m', 4, 'suggested']]);
    assert.equal(draft.attempt, undefined, 'no submission was started');
    assert.ok(hasText(h, '3 lines ready · 1 from your request, 2 suggested. Nothing has been saved.'));
    assert.ok(hasText(h, 'Explicit · Your request'));
    assert.ok(hasText(h, 'Suggested · brings stock from 2 to its minimum of 5'));
    assert.deepEqual(h.calls.navigation, []);
    // A follow-up changes the one line in focus only after an explicit choice.
    await h.press('Ask another question');
    await h.typeQuestion('Add five more'); await h.press('Show answer');
    assert.ok(hasText(h, 'Choose the draft item to change'));
    const choice = h.tree.root.findAll(n => n.type === 'Button' && String(n.props.label).startsWith('Hand gloves'))[0];
    await act(async () => { await choice.props.onPress(); });
    const edited = h.drafts.getDraft(h.sessionTools.captureSession());
    assert.equal(edited.rows.find(r => r.item.id === 'g').quantity, 8);
    assert.equal(edited.attempt, undefined);
  } finally { await h.dispose(); }
});

test('critical is clarified when a category is named critical, then answered from the chosen meaning', async () => {
  const h = await harness({ embedded:false, inventoryItems:planInventory, categories:[{ id:'e', name:'Critical care' }, { id:'w', name:'Wound care' }] });
  try {
    await h.typeQuestion('Prepare a draft for critical items that are low or out of stock.'); await h.press('Show answer');
    assert.ok(hasText(h, '“Critical” could mean critical equipment or one of your categories'));
    assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()), null);
    await h.press('Critical equipment · marked ★ or named like a ventilator');
    const draft = h.drafts.getDraft(h.sessionTools.captureSession());
    assert.deepEqual(JSON.parse(JSON.stringify(draft.rows.map(r => [r.item.id, r.quantity, r.source]))), [['a', 1, 'suggested']]);
    assert.ok(hasText(h, 'Suggested · 1 backup for critical equipment'));
  } finally { await h.dispose(); }
});

test('voice setup never shows a blocked choice as working and keeps choices separate from consent', async () => {
  const h = await harness({ mode:'settings', selectedSarvam:true, sarvamAvailable:true, sarvamConsented:false, cloudAvailable:true, cloudConsented:true });
  try {
    assert.ok(hasText(h, 'Selected: Sarvam English · online · Needs your consent · Sends the short answer text for speech.'));
    assert.equal(h.find('Preview voice').props.disabled, true);
    assert.ok(hasText(h, 'Selected: On this phone, then Groq online · Ready'));
    // Choosing on-phone understanding changes this account's choice only; server consent is withdrawn separately.
    await h.press('Use on-phone understanding only');
    assert.equal(h.prefs.cloud, false); assert.equal(h.calls.consent.length, 0);
    assert.ok(hasText(h, 'Selected: On this phone only · Ready'));
    await h.press('Enable Groq understanding');
    assert.equal(h.prefs.cloud, true, 'existing consent is reused without a second disclosure'); assert.equal(h.calls.consent.length, 0);
    assert.ok(hasText(h, 'Selected: Offline · Moonshine on this phone · Ready'));
    assert.ok(hasText(h, 'Paused'), 'Alba stays paused in normal builds');
  } finally { await h.dispose(); }
});

for (const action of ['Enable Groq understanding', 'Enable Groq online listening', 'Use Sarvam English voice']) {
  for (const stale of ['account change', 'background', 'leave setup']) test(`${action}: a stale confirmation after ${stale} cannot grant consent`, async () => {
    const h = await harness({ mode:'settings', cloudAvailable:true, sarvamAvailable:true });
    try {
      await h.press(action);
      if (stale === 'account change') await h.switchAccount();
      else if (stale === 'background') { await h.background(); await h.foreground(); }
      else await h.focus(false);
      await h.confirm();
      assert.deepEqual(h.calls.consent, []);
      assert.equal(h.prefs.cloud, false); assert.equal(h.prefs.audioOptIn, false); assert.equal(h.prefs.speechProvider, 'device');
    } finally { await h.dispose(); }
  });
}

test('adding cloud consent re-reads current scopes and cannot restore a remotely withdrawn scope', async () => {
  const h = await harness({ mode:'settings', cloudAvailable:true, cloudConsented:true, sarvamAvailable:true });
  try {
    await h.press('Use Sarvam English voice'); h.withdrawRemotely(); await h.confirm();
    assert.deepEqual(h.calls.consent, [['sarvam_speech']]);
  } finally { await h.dispose(); }
});

test('stale speech-pack removal confirmation cannot run in a new account', async () => {
  const h = await harness({ mode:'settings', ready:true });
  try {
    await h.press('Remove speech pack'); await h.switchAccount(); await h.confirm();
    assert.ok(hasText(h, 'English speech pack downloaded and verified.'));
  } finally { await h.dispose(); }
});

test('settings provider buttons stay individually accessible; configured Sarvam is not labelled live verified', async () => {
  const h = await harness({ mode:'settings', sarvamAvailable:true, sarvamConsented:true, selectedSarvam:true, width:320, fontScale:1.6 });
  try {
    assert.ok(hasText(h, 'Selected: Sarvam English · online · Configured · preview to verify'));
    for (const label of ['Use device voice', 'Use Sarvam English voice', 'Preview voice', 'Enable Groq understanding']) {
      let parent = h.find(label).parent;
      while (parent) { assert.notEqual(parent.props.accessible, true, `${label} cannot be inside an accessible grouping view`); parent = parent.parent; }
    }
  } finally { await h.dispose(); }
});

for (const question of [
  'Could you identify supplies with fewer than three units left for me?',
  'Would you find critical supplies running short?',
  'Please assemble a purchase draft for those from the previous results.',
  'Can you order the low stock from supplier Good Supplier?',
]) test(`an older cloud contract cannot drop conditions: ${question}`, async () => {
  const h = await harness({ embedded:false, cloudAvailable:true, cloudConsented:true,
    cloudV2Response:{version:2,intent:'inventory_query',draft_mode:null,query:{status:'low',category:null,supplier:null,brand:null,missing_supplier:false,item_queries:[],sort:'none',previous:false},lines:[],include_low:false,include_out:false} });
  try {
    await h.typeQuestion(question); await h.press('Show answer');
    assert.deepEqual(h.calls.interpret, []);
    assert.ok(hasText(h, 'interpretation contract 3'));
    assert.equal(h.calls.stock, 0); assert.equal(h.drafts.getDraft(h.sessionTools.captureSession()), null);
  } finally { await h.dispose(); }
});

for (const dimensions of [{width:320,fontScale:1}, {width:390,fontScale:1.6}]) test(`answer rows retain long units and stack at ${dimensions.width}px / ${dimensions.fontScale} text`, async () => {
  const unit = 'boxes of twelve individually wrapped pieces';
  const h = await harness({ embedded:false, ...dimensions, inventoryItems:[{id:'long',name:'Sterile procedure kit with extra long recorded inventory name',quantity:2,minimumStock:4,unit,isActive:true,isCritical:true}] });
  try {
    await h.typeQuestion('Show all inventory items'); await h.press('Show answer');
    assert.ok(hasText(h, unit)); assert.ok(!texts(h).includes('QTY'), 'narrow table switches to labelled stacked facts');
    for (const node of h.tree.root.findAllByType('Text').filter(n => n.children.includes(unit))) assert.equal(node.props.numberOfLines, undefined);
  } finally { await h.dispose(); }
});


test('delayed preference saving cannot withdraw cloud consent from a different account', async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const h = await harness({ mode:'settings', cloudAvailable:true, cloudConsented:true, preferenceSaveWait:waiting });
  try {
    await h.press('Withdraw all cloud consent');
    assert.deepEqual(h.calls.preferenceSaveOwners, ['test-user']);
    assert.deepEqual(h.calls.consent, []);
    await h.switchAccount();
    await act(async () => { release(); await waiting; });
    assert.deepEqual(h.calls.consentOwners || [], [], 'no withdrawal request is sent for either account after the original session becomes stale');
  } finally { release(); await h.dispose(); }
});
