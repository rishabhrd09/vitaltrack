const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: name => {
    if (name in dependencies) return dependencies[name];
    throw new Error('Unexpected dependency: ' + name);
  }, Date, Set, Map, WeakMap, AbortController, setTimeout, clearTimeout });
  return mod.exports;
}
const types = load('types/index.ts');
const core = load('features/assistant/core.ts', { '../../types': types });
const contracts = load('features/assistant/contracts.ts');
const queries = load('features/assistant/queries.ts', { '@/types': types, './core': core, './contracts': contracts });
const captureTools = load('features/assistant/capture.ts');
const item = (id, name = 'Hand gloves', quantity = 18) => ({ id, name, quantity, minimumStock: 5, unit: 'pairs', isActive: true, isCritical: false });
const read = (query, fields = ['quantity', 'supplier']) => ({ intent: 'read_item', item_query: query, reference: 'named', fields });

for (const text of ['show low stock', 'summary', 'close', 'stop speaking', 'out of stock']) {
  test('whole command: ' + text, () => assert.ok(core.parseLocal(text)));
}
for (const text of ['do not show low stock', 'show low stock except gloves', 'how many gloves did we order last month?', 'set gloves to 20', 'delete gloves', 'send an order']) {
  test('unsafe/negated/historical scope: ' + text, () => {
    assert.ok(['unsupported_action', 'clarify'].includes(core.parseLocal(text)?.intent));
  });
}
test('same-item compound reads include both fields, other actions never partially execute', () => {
  assert.deepEqual(Array.from(core.parseLocal('how many gloves are left and where do we normally order them').fields), ['quantity', 'supplier']);
  assert.equal(core.parseLocal('show low stock then order gloves').intent, 'unsupported_action');
  assert.equal(core.parseLocal('how many gloves are left and who supplies masks'), null);
});
test('known quantity and absent supplier remain distinct', () => {
  const answer = core.answerIntent(read('hand gloves'), [item('a')], 100);
  assert.match(answer.text, /18 pairs/);
  assert.match(answer.text, /not recorded/);
  assert.equal(answer.resolvedId, 'a');
});
test('zero is valid; missing or invalid quantity is never zero', () => {
  assert.match(core.answerIntent(read('hand gloves'), [item('a', 'Hand gloves', 0)], 100).text, /0 pairs/);
  assert.match(core.answerIntent(read('hand gloves'), [{ ...item('a'), quantity: undefined }], 100).text, /incomplete/);
});
test('duplicate names and approximate names always require a choice', () => {
  assert.equal(core.answerIntent(read('hand gloves'), [item('a'), item('b')], 100).choices.length, 2);
  assert.equal(core.answerIntent(read('gloves'), [item('a')], 100).choices.length, 1);
});
test('follow-up uses previous ID, never guesses another item', () => {
  const intent = { ...read(null), reference: 'previous' };
  assert.equal(core.answerIntent(intent, [item('a')], 100).resolvedId, undefined);
  assert.equal(core.answerIntent(intent, [item('a')], 100, 'a').resolvedId, 'a');
});
test('stock lists match dashboard helper edge cases and exclude inactive items', () => {
  const items = [item('one', 'Gloves', 1), item('zero', 'Mask', 0), { ...item('hidden', 'Inactive', 0), isActive: false }];
  const low = core.answerIntent(core.command('low_stock'), items, 100);
  const out = core.answerIntent(core.command('out_of_stock'), items, 100);
  assert.equal(low.items.length, 1);
  assert.equal(out.items.length, 1);
  assert.equal(low.items[0].id, 'one');
});
test('speech uses the answer and explicitly identifies stale facts', () => {
  const answer = core.answerIntent(read('hand gloves'), [item('a')], 100, undefined, true);
  assert.ok(core.speechText(answer).endsWith(answer.text));
  assert.match(core.speechText(answer), /Last known/);
});
for (const question of core.commandExamples) {
  test('published command example is covered: ' + question, () => {
    const intent = queries.parseExpanded(question) || core.parseLocal(question);
    assert.ok(intent, question);
    assert.ok(!['clarify', 'unsupported_action'].includes(intent.intent), question);
  });
}
test('product words are not mistaken for commands and size qualifiers are not lost', () => {
  assert.equal(core.parseLocal('How many dressing set are left?').item_query, 'dressing set');
  assert.equal(core.parseLocal('quantity of 5 ml syringes').item_query, '5 ml syringes');
  assert.equal(core.parseLocal('how many gloves are left in our stock?').item_query, 'gloves');
  assert.equal(core.parseLocal('how many gloves left?').item_query, 'gloves');
  assert.equal(core.parseLocal('stock of gloves').item_query, 'gloves');
  assert.equal(core.parseLocal('what is the stock status of gloves').fields.includes('status'), true);
});
test('near spelling and singular suggestions require explicit choice even if unique', () => {
  for (const query of ['hand glove', 'hand glovse', 'hand glovs']) {
    const result = core.answerIntent(read(query), [item('a')], 100);
    assert.equal(result.resolvedId, undefined);
  }
  const result = core.answerIntent(read('hand glove'), [item('a')], 100);
  assert.equal(result.choices.length, 1);
  assert.equal(core.answerIntent(read('5 ml syringe'), [item('a', '10 ml syringes')], 100).choices.length, 0);
});
test('multiple item reads never silently become one item', () => {
  for (const q of ['how many gloves are left and who supplies masks', 'show low stock and summary', 'quantity of gloves or masks']) assert.equal(core.parseLocal(q), null);
});
test('unknown tools and model-supplied facts are rejected', () => {
  assert.throws(() => core.validateIntent({ ...read('gloves'), quantity: 99 }));
  assert.throws(() => core.validateIntent({ ...read('gloves'), intent: 'update_stock' }));
  assert.throws(() => core.validateIntent({ ...core.command('summary'), item_query: 'gloves' }));
});
test('session epoch invalidates old arrays even when the same account logs in again', () => {
  let state = { isAuthenticated: true, user: { id: 'a' } };
  let listener;
  const session = load('services/assistantSession.ts', { '@/store/useAuthStore': { useAuthStore: { getState: () => state, subscribe: fn => { listener = fn; } } } });
  const first = session.captureSession(), items = [item('a')];
  session.stampSnapshot(items, first);
  assert.equal(session.ownsSnapshot(items, first), true);
  const previous = state; state = { ...state, isAuthenticated: false }; listener(state, previous);
  const loggedOut = state; state = { ...state, isAuthenticated: true }; listener(state, loggedOut);
  assert.throws(() => session.assertSession(first));
  assert.equal(session.ownsSnapshot(items, session.captureSession()), false);
});

function snapshotHarness({ fresh = false, owned = true, invalidated = false, mutating = 0, failure = false, online = true } = {}) {
  let fetches = 0, validSession = true;
  const data = [item('stock')], next = [item('stock', 'Hand gloves', 23)];
  let state = { data, dataUpdatedAt: Date.now() - (fresh ? 0 : 60_000), isInvalidated: invalidated };
  const reader = load('features/assistant/snapshot.ts', {
    '@/services/categories': { categoryService: { getAll: async () => ({ categories: [], total: 0 }) } },
    '@tanstack/react-query': { onlineManager: { isOnline: () => online } },
    '@/providers/QueryProvider': { queryClient: {
      isMutating: () => mutating,
      getQueryState: () => state,
      fetchQuery: async options => {
        fetches++;
        if (failure) throw new Error('Offline');
        const result = await options.queryFn({ signal: new AbortController().signal });
        state = { data: result, dataUpdatedAt: Date.now(), isInvalidated: false };
        return result;
      },
    }},
    '@/services/items': { itemService: { getAll: async () => ({ items: next }) } },
    '@/services/assistantSession': {
      assertSession: () => { if (!validSession) throw new Error('Session changed'); },
      ownsSnapshot: value => value === next || owned,
    },
  });
  return { reader, fetches: () => fetches, expire: () => { validSession = false; } };
}
test('fresh account-owned data needs zero inventory requests', async () => {
  const h = snapshotHarness({ fresh: true });
  const result = await h.reader.inventorySnapshot({}, new AbortController().signal);
  assert.equal(result.stale, false); assert.equal(h.fetches(), 0);
});
test('stale and unowned data use targeted refresh', async () => {
  for (const options of [{}, { fresh: true, owned: false }, { fresh: true, invalidated: true }]) {
    const h = snapshotHarness(options);
    const result = await h.reader.inventorySnapshot({}, new AbortController().signal);
    assert.equal(result.items[0].quantity, 23); assert.equal(h.fetches(), 1);
  }
});
test('offline fallback must be owned, complete and not invalidated', async () => {
  const safe = snapshotHarness({ failure: true });
  assert.equal((await safe.reader.inventorySnapshot({}, new AbortController().signal)).stale, true);
  for (const options of [{ owned: false }, { invalidated: true }]) {
    const h = snapshotHarness({ ...options, failure: true });
    await assert.rejects(h.reader.inventorySnapshot({}, new AbortController().signal));
  }
});
test('known-offline mode returns marked data immediately without a refresh attempt', async () => {
  const h = snapshotHarness({ online: false });
  assert.equal((await h.reader.inventorySnapshot({}, new AbortController().signal)).stale, true);
  assert.equal(h.fetches(), 0);
  await assert.rejects(h.reader.inventorySnapshot({}, new AbortController().signal, true), /Offline/);
  for (const options of [{ owned: false }, { invalidated: true }]) {
    const unsafe = snapshotHarness({ online: false, ...options });
    await assert.rejects(unsafe.reader.inventorySnapshot({}, new AbortController().signal), /Offline/);
    assert.equal(unsafe.fetches(), 0);
  }
});
test('voice preferences default offline, remain per account, and never migrate old cloud consent', async () => {
  const store = new Map([['carekosh-voice-settings-v1:a', JSON.stringify({ cloud: true })]]);
  // Text consent and the fresh, separate audio opt-in must survive per account.
  const preferences = load('features/assistant/preferences.ts', { '@react-native-async-storage/async-storage': { default: {
    getItem: async key => store.get(key), setItem: async (key, value) => store.set(key, value),
  } }, './policy': { CLOUD_TEXT_ENABLED: true, CLOUD_TRANSCRIPTION_ENABLED: true, CLOUD_VOICE_ENABLED: false } });
  const a = await preferences.loadPreferences('a');
  assert.equal(a.cloud, false); assert.equal(a.inputProvider, 'offline'); assert.equal(a.speechProvider, 'device');
  await preferences.savePreferences('a', { ...a, cloud: true, inputProvider: 'sarvam' });
  assert.equal((await preferences.loadPreferences('a')).inputProvider, 'offline');
  await preferences.savePreferences('a', { ...a, audioOptIn: true, inputProvider: 'groq' });
  assert.equal((await preferences.loadPreferences('a')).inputProvider, 'groq');
  assert.equal((await preferences.loadPreferences('b')).cloud, false);
  store.set('carekosh-voice-settings-v2:c', JSON.stringify({ inputProvider: 'untrusted-url', speechProvider: 'auto' }));
  const c = await preferences.loadPreferences('c');
  assert.equal(c.inputProvider, 'offline'); assert.equal(c.speechProvider, 'device');
});
test('pending writes, cancelled turns and changed sessions cannot return stock', async () => {
  const pending = snapshotHarness({ mutating: 1 });
  await assert.rejects(pending.reader.inventorySnapshot({}, new AbortController().signal));
  assert.equal(pending.fetches(), 0);
  const h = snapshotHarness({ fresh: true });
  const abort = new AbortController(); abort.abort();
  await assert.rejects(h.reader.inventorySnapshot({}, abort.signal));
  h.expire();
  await assert.rejects(h.reader.inventorySnapshot({}, new AbortController().signal));
});

function itemsHarness(pages, sessionChanges = false) {
  let calls = 0, current = true;
  const service = load('services/items.ts', {
    './api': { api: { get: async () => { if (sessionChanges) current = false; return pages[calls++]; } }, ApiClientError: Error },
    '@/utils/logger': { logger: { info() {} } },
    './assistantSession': { captureSession: () => ({}), assertSession: () => { if (!current) throw new Error('Changed'); }, stampSnapshot() {} },
  }).itemService;
  return { service, calls: () => calls };
}
test('inventory pagination rejects duplicate IDs, changing totals and partial results', async () => {
  for (const pages of [
    [{ items: [item('a')], total: 2 }, { items: [item('a')], total: 2 }],
    [{ items: [item('a')], total: 2 }, { items: [item('b')], total: 3 }],
    [{ items: [item('a')], total: 2 }, { items: [], total: 2 }],
  ]) {
    await assert.rejects(itemsHarness(pages).service.getAll({ limit: 999 }));
  }
});
test('inventory pagination refuses results from a previous login', async () => {
  await assert.rejects(itemsHarness([{ items: [item('a')], total: 1 }], true).service.getAll({ limit: 999 }));
});
test('complete item pagination preserves totals', async () => {
  const h = itemsHarness([{ items: [item('a')], total: 2 }, { items: [item('b')], total: 2 }]);
  assert.equal((await h.service.getAll({ limit: 999 })).items.length, 2);
});

for (const text of ['Please show low stock', 'Could you please show me low stock items?', 'CareKosh, show low stock, please']) {
  test('courtesy wrapper stays local: ' + text, () => assert.equal(core.parseLocal(text)?.intent, 'low_stock'));
}
test('polite phrasing preserves exact item matching and does not remove negation', () => {
  assert.equal(core.parseLocal('Could you tell me how many hand gloves are left?')?.item_query, 'hand gloves');
  assert.equal(core.parseLocal('Please don’t show low stock')?.intent, 'clarify');
  assert.notEqual(core.parseLocal('If I ask you to show low stock, close the app')?.intent, 'close');
  assert.notEqual(core.parseLocal('Could you show low stock and out of stock')?.intent, 'low_stock');
});
test('missing thresholds/quantity cannot hide a recorded supplier', () => {
  const partial = { ...item('a'), quantity: undefined, minimumStock: undefined, supplierName: 'Synthetic Supplier' };
  const result = core.answerIntent(read('hand gloves'), [partial], 100);
  assert.match(result.text, /Quantity information is incomplete/);
  assert.match(result.text, /Synthetic Supplier/);
  const quantity = core.answerIntent(read('hand gloves', ['quantity']), [{ ...partial, quantity: 18 }], 100);
  assert.match(quantity.text, /18 pairs/);
});

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function captureHarness({ prepare = async () => {}, stop = async () => {}, remember = async () => {}, restore = async () => {} } = {}) {
  const calls = [], discarded = [];
  const recorder = {
    uri: 'file:///cache/synthetic.m4a',
    isRecording: false,
    prepareToRecordAsync: async () => { calls.push('prepare'); await prepare(); },
    record: () => { calls.push('record'); recorder.isRecording = true; },
    stop: async () => { calls.push('stop'); try { await stop(); } finally { recorder.isRecording = false; } },
  };
  const capture = new captureTools.MicrophoneCapture(recorder, remember, async uri => { discarded.push(uri); }, () => {}, restore);
  return { capture, calls, discarded, recorder };
}
test('cancel during preparation keeps microphone locked until cleanup completes', async () => {
  const wait = deferred(), preparing = deferred();
  const h = captureHarness({ prepare: () => { preparing.resolve(); return wait.promise; } });
  const start = h.capture.start(async () => {});
  await preparing.promise; h.capture.cancel();
  assert.equal(await h.capture.start(async () => {}), false);
  wait.resolve(); assert.equal(await start, false);
  assert.deepEqual(h.calls, ['prepare', 'stop']);
  assert.equal(h.discarded.length, 1); assert.equal(h.capture.phase, 'idle');
});
test('permission failure never records or leaves microphone locked', async () => {
  const h = captureHarness();
  await assert.rejects(h.capture.start(async () => { throw new Error('Denied'); }));
  assert.deepEqual(h.calls, []); assert.equal(h.capture.phase, 'idle');
});
test('registration failure stops/discards prepared audio', async () => {
  const h = captureHarness({ remember: async () => { throw new Error('Storage'); } });
  await assert.rejects(h.capture.start(async () => {}));
  assert.deepEqual(h.calls, ['prepare', 'stop']);
  assert.equal(h.discarded.length, 1); assert.equal(h.capture.phase, 'idle');
});
test('Finish and timeout cannot stop twice; Cancel during stop discards the take', async () => {
  const wait = deferred(); const h = captureHarness({ stop: () => wait.promise });
  assert.equal(await h.capture.start(async () => {}), true);
  const finished = h.capture.finish();
  assert.equal(await h.capture.finish(), null);
  h.capture.cancel();
  assert.equal(await h.capture.start(async () => {}), false);
  wait.resolve(); assert.equal(await finished, null);
  assert.deepEqual(h.calls, ['prepare', 'record', 'stop']);
  assert.equal(h.discarded.length, 1); assert.equal(h.capture.phase, 'idle');
});
test('normal take returns its own URI and permits the next take', async () => {
  const h = captureHarness();
  await h.capture.start(async () => {});
  assert.equal(await h.capture.finish(), 'file:///cache/synthetic.m4a');
  assert.equal(h.discarded.length, 0);
  assert.equal(await h.capture.start(async () => {}), true);
  await h.capture.finish();
});
test('native stop failure is cleaned up and never hands audio to transcription', async () => {
  const h = captureHarness({ stop: async () => { throw new Error('Interrupted'); } });
  await h.capture.start(async () => {});
  await assert.rejects(h.capture.finish());
  assert.equal(h.discarded.length, 1); assert.equal(h.capture.phase, 'idle');
});
test('microphone meter is bounded and is not a speech-rejection gate', () => {
  assert.equal(captureTools.microphoneLevel(-160).percent, 0);
  assert.equal(captureTools.microphoneLevel(10).percent, 100);
  assert.match(captureTools.microphoneLevel(undefined).message, /unavailable/);
  assert.match(captureTools.microphoneLevel(-60).message, /quiet/);
  assert.match(captureTools.microphoneLevel(-1).message, /loud/);
});
test('audio-mode cleanup completes before a new take is permitted', async () => {
  const wait = deferred(), restoring = deferred();
  const h = captureHarness({ restore: () => { restoring.resolve(); return wait.promise; } });
  await h.capture.start(async () => {});
  const finished = h.capture.finish();
  await restoring.promise;
  assert.equal(await h.capture.start(async () => {}), false);
  wait.resolve(); await finished;
  assert.equal(h.capture.phase, 'idle');
});

test('native duration stop before JS Finish still hands the recording to transcription', async () => {
  const h = captureHarness();
  await h.capture.start(async () => {});
  h.recorder.isRecording = false; // Android already released its MediaRecorder.
  h.recorder.stop = async () => { throw new Error('Recorder already released'); };
  assert.equal(await h.capture.finish(), 'file:///cache/synthetic.m4a');
  assert.equal(h.discarded.length, 0);
  assert.equal(h.capture.phase, 'idle');
});

test('native start no-op never reports Listening and cleans up prepared recording', async () => {
  const h = captureHarness();
  h.recorder.record = () => {};
  await assert.rejects(h.capture.start(async () => {}), /microphone did not start/);
  assert.equal(h.capture.phase, 'idle');
  assert.equal(h.discarded.length, 1);
  assert.deepEqual(h.calls, ['prepare', 'stop']);
});

test('cleanup of an unstarted recorder preserves the useful startup error', async () => {
  const h = captureHarness({ stop: async () => { throw new Error('Nothing to stop'); } });
  h.recorder.record = () => { throw new Error('Microphone is unavailable'); };
  await assert.rejects(h.capture.start(async () => {}), /Microphone is unavailable/);
  assert.equal(h.capture.phase, 'idle');
  assert.equal(h.discarded.length, 1);
});

const readiness = load('features/assistant/readiness.ts');
test('microphone setup identifies each prerequisite, including disabled preferences', () => {
  const ready = { loaded: true, supported: true, modelChecked: true, modelReady: true, enabled: true, microphone: true };
  assert.equal(readiness.microphoneReadiness(ready), null);
  for (const [key, message] of [['loaded', /Checking/], ['modelChecked', /Checking/], ['supported', /Android/], ['modelReady', /Download/], ['enabled', /Turn on/], ['microphone', /tap-to-talk/]]) {
    assert.match(readiness.microphoneReadiness({ ...ready, [key]: false }), message);
  }
});
test('10-second answers never auto-dismiss choices, active work, pinned answers or screen readers', () => {
  assert.equal(readiness.ANSWER_VISIBLE_MS, 10_000);
  const eligible = { hasAnswer: true, hasChoices: false, keptOpen: false, busy: false, recording: false, screenReader: false };
  assert.equal(readiness.canDismissAnswer(eligible), true);
  assert.equal(readiness.canDismissAnswer({ ...eligible, hasAnswer: false }), false);
  for (const key of ['hasChoices', 'keptOpen', 'busy', 'recording', 'screenReader']) assert.equal(readiness.canDismissAnswer({ ...eligible, [key]: true }), false);
});

test('voice setup persists across module reloads and stays isolated between accounts', async () => {
  const disk = new Map();
  const dependencies = {
    '@react-native-async-storage/async-storage': { default: { getItem: async k => disk.get(k), setItem: async (k, v) => disk.set(k, v) } },
    './policy': { CLOUD_VOICE_ENABLED: false },
  };
  const first = load('features/assistant/preferences.ts', dependencies);
  await first.savePreferences('owner-a', { ...first.defaults, enabled: true, microphone: true, spokenReplies: true });
  const restarted = load('features/assistant/preferences.ts', dependencies);
  const restored = await restarted.loadPreferences('owner-a');
  assert.equal(restored.enabled, true); assert.equal(restored.microphone, true); assert.equal(restored.spokenReplies, true);
  assert.equal(restored.cloud, false);
  assert.equal((await restarted.loadPreferences('owner-b')).microphone, false);
});

test('full stock read pipeline paginates, verifies ownership and derives answer statistics from fetched rows', async () => {
  const session = load('services/assistantSession.ts', { '@/store/useAuthStore': { useAuthStore: {
    getState: () => ({ isAuthenticated: true, user: { id: 'owner-a' } }), subscribe: () => () => {},
  } } });
  const rows = Array.from({ length: 101 }, (_, i) => item(String(i), `Test item ${i}`, i === 100 ? 0 : 18));
  rows[0].quantity = 2;
  rows[1].isActive = false;
  rows[100].supplierName = 'Synthetic Supplier';
  const urls = [];
  const service = load('services/items.ts', {
    './api': { api: { get: async (url, requiresAuth, signal) => {
      assert.equal(requiresAuth, true); assert.equal(signal.aborted, false); urls.push(url);
      return { items: urls.length === 1 ? rows.slice(0, 100) : rows.slice(100), total: 101 };
    } }, ApiClientError: Error },
    '@/utils/logger': { logger: { info() {} } }, './assistantSession': session,
  }).itemService;
  let state;
  const reader = load('features/assistant/snapshot.ts', {
    '@/services/categories': { categoryService: { getAll: async () => ({ categories: [], total: 0 }) } },
    '@tanstack/react-query': { onlineManager: { isOnline: () => true } },
    '@/providers/QueryProvider': { queryClient: {
      isMutating: () => 0, getQueryState: () => state,
      fetchQuery: async options => { const data = await options.queryFn({ signal: new AbortController().signal }); state = { data, dataUpdatedAt: Date.now(), isInvalidated: false }; return data; },
    } }, '@/services/items': { itemService: service }, '@/services/assistantSession': session,
  });
  const snapshot = await reader.inventorySnapshot(session.captureSession(), new AbortController().signal);
  assert.deepEqual(urls, ['/items?page=1&pageSize=100', '/items?page=2&pageSize=100']);
  assert.equal(snapshot.items.length, 101);
  const result = core.answerIntent(core.parseLocal('give me a stock summary'), snapshot.items, snapshot.timestamp);
  assert.deepEqual(Array.from(result.statistics, s => [s.label, s.value]), [['Active items', 100], ['Low stock', 1], ['Out of stock', 1]]);
  const combined = core.answerIntent(core.parseLocal('how many Test item 100 are left and who supplies them'), snapshot.items, snapshot.timestamp);
  assert.match(combined.text, /0 pairs/); assert.match(combined.text, /Synthetic Supplier/);
  await reader.inventorySnapshot(session.captureSession(), new AbortController().signal);
  assert.equal(urls.length, 2, 'fresh verified data avoids redundant requests');
});
