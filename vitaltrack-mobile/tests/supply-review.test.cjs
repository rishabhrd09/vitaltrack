/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, deps = {}) {
  const module = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2021 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) { if (name in deps) return deps[name]; throw new Error('Unexpected import ' + name); },
    Map, Set, Date, JSON, Number, Error, Promise, AbortController, setTimeout, clearTimeout, setInterval, clearInterval });
  return module.exports;
}
const contracts = load('features/supplyReview/contracts.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fixture = () => ({ id: id(1), version: 1, status: 'awaiting_review', created_at: '2026-11-04T10:00:00Z', expires_at: '2099-01-01T00:00:00Z', snapshot_at: '2026-11-04T10:00:01Z', supply_revision: 5,
  proposal: { id: id(2), version: 1, expires_at: '2099-01-01T00:00:00Z', lines: [{ item_id: id(3), item_version: 4, name: 'Synthetic gloves', unit: 'pairs', supplier_name: 'Synthetic supplier',
    on_hand: 2, minimum_stock: 5, known_inbound: 1, target_quantity: 5, order_quantity: 2, reasons: ['Target 5, stock 2, known inbound 1: order 2 pairs.'] }] }, questions: [], excluded: [], order_id: null });
const clone = value => JSON.parse(JSON.stringify(value));

test('supply contract rejects malformed facts and expired or unclear confirmation', () => {
  const run = contracts.readRun(fixture()); assert.equal(contracts.canConfirm(run), true);
  for (const patch of [{ id: '../../orders' }, { version: 0 }, { status: 'save_stock' }, { status: 'completed' }, { snapshot_at: 'invalid' }, { proposal: null }]) assert.throws(() => contracts.readRun({ ...fixture(), ...patch }));
  for (const value of [-1, Infinity, 2.3, true]) {
    const bad = fixture(); bad.proposal.lines[0].on_hand = value; assert.throws(() => contracts.readRun(bad));
  }
  const duplicate = fixture(); duplicate.proposal.lines.push(duplicate.proposal.lines[0]); assert.throws(() => contracts.readRun(duplicate));
  assert.equal(contracts.canConfirm({ ...run, expires_at: '2000-01-01' }), false);
  assert.equal(contracts.canConfirm({ ...run, status: 'stale' }), false);
  assert.equal(contracts.canConfirm({ ...run, proposal: { ...run.proposal, lines: [] } }), false);
  assert.throws(() => contracts.readCapabilities({ enabled: true, contract_version: 2, ttl_seconds: 900, max_items: 500 }));
});

test('saved-review history is bounded metadata, not duplicated proposals', () => {
  const summary = (({ id, version, status, created_at, expires_at, order_id }) => ({ id, version, status, created_at, expires_at, order_id }))(fixture());
  const rows = contracts.readRuns({ runs: [summary] }); assert.equal(rows[0].proposal, undefined);
  assert.throws(() => contracts.readRuns({ runs: [summary, summary] }));
  assert.throws(() => contracts.readRuns({ runs: Array.from({ length: 21 }, (_, n) => ({ ...summary, id: id(n + 20) })) }));
});

test('missing units remain readable clarification facts and blank optional suppliers stay valid', () => {
  const missing = { ...fixture(), status: 'needs_input', proposal: null, questions: [{ item_id: id(3), name: 'Synthetic supply', unit: '', code: 'unit_mismatch', message: 'Record a unit before including this supply, or leave it out.' }] };
  assert.equal(contracts.readRun(missing).questions[0].unit, ''); assert.equal(contracts.canConfirm(contracts.readRun(missing)), false);
  const ready = fixture(); ready.proposal.lines[0].supplier_name = ''; assert.equal(contracts.readRun(ready).proposal.lines[0].supplier_name, '');
  ready.proposal.lines[0].unit = ''; assert.throws(() => contracts.readRun(ready));
});

test('supply HTTP wiring sends immutable confirmation identity and never retries a failed write', async () => {
  let active = true, fail = false; const calls = [];
  class ApiClientError extends Error { constructor(status) { super('failed'); this.status = status; } }
  const service = load('services/supplyReview.ts', { '@/features/supplyReview/contracts': contracts,
    './assistantSession': { assertSession: () => { if (!active) throw new Error('Session changed'); } },
    './api': { ApiClientError, api: { assistantRequest: async (url, options, ready) => {
      ready(); calls.push({ url, ...options }); if (fail) throw new Error('Unknown save'); return fixture();
    } } },
  }).supplyReview;
  const signal = new AbortController().signal, session = { owner: 'a', epoch: 0 };
  await service.confirm(session, fixture(), id(10), signal);
  assert.deepEqual(JSON.parse(calls[0].body), { expected_run_version: 1, proposal_id: id(2), proposal_version: 1, idempotency_key: id(10) });
  assert.equal(calls[0].url, '/supply-reviews/' + id(1) + '/confirm');
  fail = true; await assert.rejects(service.confirm(session, fixture(), id(10), signal), /Unknown save/); assert.equal(calls.length, 2);
  active = false; await assert.rejects(service.get(session, id(1), signal), /Session changed/); assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.url.startsWith('/supply-reviews/')));
});

async function screen({ server = { run: null }, params = {}, failConfirm = false, enabled = true, supported = true, online = true, appState = 'active', pendingAfterSwitch = false } = {}) {
  let owner = 'owner-a', epoch = 0, appListener, alert, tree; const calls = { posts: [], gets: 0, navigation: [], paintedAfterSwitch: [] }, router = { setParams(next) { Object.assign(params, next); }, push(route) { calls.navigation.push(route); } };
  const session = { captureSession: () => ({ owner, epoch }), assertSession: s => { if (s.owner !== owner || s.epoch !== epoch) throw new Error('Session changed'); } };
  const host = name => ({ children, ...props }) => { if (name === 'Text' && owner === 'owner-b') calls.paintedAfterSwitch.push(JSON.stringify(children)); return React.createElement(name, props, children); };
  const rn = Object.fromEntries(['View', 'Text', 'TouchableOpacity', 'TextInput', 'ActivityIndicator', 'ScrollView'].map(n => [n, host(n)]));
  rn.AppState = { currentState: appState, addEventListener: (_, fn) => { appListener = fn; return { remove() {} }; } };
  rn.Alert = { alert: (title, message, buttons) => { alert = { title, message, buttons }; } };
  const summaries = () => server.run ? [(({ id, version, status, created_at, expires_at, order_id }) => ({ id, version, status, created_at, expires_at, order_id }))(server.run)] : [];
  const api = {
    capabilities: async () => ({ enabled, contract_version: 1, max_items: 500, ttl_seconds: 900, has_history: !!server.run, ...(supported ? {} : { supported: false }) }), list: async () => { calls.gets++; return summaries(); },
    start: async () => { calls.posts.push('start'); server.run = fixture(); return clone(server.run); },
    get: async (_s, key) => { calls.gets++; if (pendingAfterSwitch && _s.owner !== 'owner-a') return new Promise(() => {}); assert.equal(key, server.run.id); return clone(server.run); },
    confirm: async (_s, run, key) => { calls.posts.push({ type: 'confirm', run: clone(run), key }); server.run = { ...run, status: 'completed', version: run.version + 1, order_id: 'ORD-SYNTHETIC' }; if (failConfirm) throw new Error('Response lost'); return clone(server.run); },
    refresh: async (_s, run) => { calls.posts.push('refresh'); server.run = { ...fixture(), version: run.version + 1 }; return clone(server.run); },
    cancel: async (_s, run) => { calls.posts.push('cancel'); return { ...run, status: 'cancelled' }; },
    answer: async () => { calls.posts.push('answers'); return fixture(); },
  };
  const theme = { useTheme: () => ({ colors: load('theme/colors.ts').colors }) };
  const proposal = load('components/supplyReview/ProposalReview.tsx', { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn, '@/theme/ThemeContext': theme }).default;
  let uuid = 20;
  const Component = load('components/supplyReview/SupplyReviewExperience.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn,
    'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') }, 'expo-crypto': { randomUUID: () => id(uuid++) },
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => params, useFocusEffect: cb => React.useEffect(cb, [cb]) },
    '@/theme/ThemeContext': theme, '@/store/useAuthStore': { useAuthStore: fn => fn({ isAuthenticated: true, user: { id: owner } }) },
    '@/services/assistantSession': session, '@/services/supplyReview': { supplyReview: api }, '@/features/supplyReview/contracts': contracts,
    '@/hooks/useNetworkStatus': { useNetworkStatus: () => ({ isOnline: online }) }, '@/providers/QueryProvider': { queryClient: { invalidateQueries: async () => {} } },
    '@/utils/navigation': { safeBack() {} }, './ProposalReview': proposal,
  }).default;
  const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
  await act(async () => { tree = create(React.createElement(Component)); await flush(); });
  const button = label => tree.root.findAll(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label)[0];
  return { server, calls, tree, alert: () => alert, text: () => tree.root.findAllByType('Text').map(n => n.children.join('')).join(' '), button,
    press: async label => { const b = button(label); assert.ok(b, label); assert.ok(!b.props.disabled, label); await act(async () => { b.props.onPress(); await flush(); }); },
    confirm: async () => { await act(async () => { alert.buttons.find(b => b.text === 'Confirm order').onPress(); await flush(); }); },
    background: async () => { await act(async () => { rn.AppState.currentState = 'background'; appListener('background'); await flush(); }); },
    switchOwner: async () => { await act(async () => { owner = 'owner-b'; epoch++; tree.update(React.createElement(Component)); await flush(); }); },
    dispose: async () => { await act(async () => tree.unmount()); },
  };
}

test('rendered review displays server quantities and recovers a lost confirmation response without another POST', async () => {
  const h = await screen({ failConfirm: true });
  try {
    await h.press('Review to recorded minimum');
    assert.match(h.text(), /Proposed order · 2 pairs/); assert.match(h.text(), /Known inbound/);
    await h.press('Confirm reviewed order'); await h.confirm();
    assert.match(h.text(), /ORD-SYNTHETIC/); assert.match(h.text(), /original order was saved/);
    assert.equal(h.calls.posts.filter(p => p.type === 'confirm').length, 1);
    assert.equal(h.button('Confirm reviewed order'), undefined);
  } finally { await h.dispose(); }
});

test('a fresh screen recovers owned server history after process death without replaying a write', async () => {
  const server = { run: fixture() }, h = await screen({ server });
  try {
    const label = h.tree.root.findAll(n => n.type === 'TouchableOpacity' && String(n.props.accessibilityLabel).startsWith('awaiting review'))[0].props.accessibilityLabel;
    await h.press(label); assert.match(h.text(), /Proposed order · 2 pairs/); assert.deepEqual(h.calls.posts, []);
  } finally { await h.dispose(); }
});

test('backgrounding or account change makes an open confirmation inert', async () => {
  for (const action of ['background', 'switchOwner']) {
    const h = await screen({ server: { run: fixture() }, params: { run: id(1) } });
    try {
      await h.press('Confirm reviewed order'); await h[action](); await h.confirm();
      assert.equal(h.calls.posts.filter(p => p.type === 'confirm').length, 0);
    } finally { await h.dispose(); }
  }
});

test('the first render after an account switch cannot paint the previous owner proposal before effects run', async () => {
  const h = await screen({ pendingAfterSwitch: true, server: { run: fixture() }, params: { run: id(1) } });
  try {
    assert.match(h.text(), /Synthetic gloves/); await h.switchOwner();
    assert.equal(h.calls.paintedAfterSwitch.some(t => t.includes('Synthetic gloves') || t.includes('Synthetic supplier')), false);
    assert.equal(h.text().includes('Synthetic gloves'), false);
  } finally { await h.dispose(); }
});

test('paused reviews still recover the completed order, while unsupported servers receive no history request', async () => {
  const completed = { ...fixture(), status: 'completed', order_id: 'ORD-RECOVERED' };
  const h = await screen({ enabled: false, server: { run: completed }, params: { run: id(1) } });
  try { assert.match(h.text(), /ORD-RECOVERED/); assert.ok(h.calls.gets >= 2); assert.deepEqual(h.calls.posts, []); }
  finally { await h.dispose(); }
  const old = await screen({ enabled: false, supported: false });
  try { assert.equal(old.calls.gets, 0); assert.equal(old.button('Review to recorded minimum').props.disabled, true); }
  finally { await old.dispose(); }
});

test('initially unknown Android lifecycle permits status recovery but never a mutation', async () => {
  const h = await screen({ appState: null, params: { run: id(1) }, server: { run: fixture() } });
  try { assert.match(h.text(), /Proposed order/); await h.press('Confirm reviewed order'); await h.confirm(); assert.deepEqual(h.calls.posts, []); }
  finally { await h.dispose(); }
});

test('expired, empty and offline proposals cannot be confirmed', async () => {
  for (const opts of [{ online: false }, { patch: { expires_at: '2000-01-01' } }, { patch: { proposal: { ...fixture().proposal, lines: [] } } }]) {
    const h = await screen({ ...opts, params: { run: id(1) }, server: { run: { ...fixture(), ...opts.patch } } });
    try { assert.equal(h.button('Confirm reviewed order').props.disabled, true); assert.deepEqual(h.calls.posts, []); }
    finally { await h.dispose(); }
  }
});

test('standard low stock and explicit backup attention are separate facts', () => {
  const types = load('types/index.ts');
  const row = { quantity: 1, minimumStock: 1, isCritical: true, name: 'Synthetic equipment' };
  assert.equal(types.isLowStock(row), false); assert.equal(types.needsEmergencyBackup(row), true); assert.equal(types.needsAttention(row), true);
  assert.equal(types.isLowStock({ ...row, minimumStock: 2 }), true);
  assert.equal(types.needsEmergencyBackup({ ...row, isCritical: false, name: 'Ambu bag' }), false);
});

test('profile keeps history reachable when paused and discards a late capability after switching account', async () => {
  let owner = 'owner-a', finish, tree;
  const colors = load('theme/colors.ts').colors, host = name => ({ children, ...props }) => React.createElement(name, props, children);
  const response = new Promise(resolve => { finish = resolve; });
  const Component = load('components/supplyReview/SupplyReviewEntry.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': { Text: host('Text'), TouchableOpacity: host('TouchableOpacity') },
    'expo-router': { useRouter: () => ({ push() {} }) }, '@/theme/ThemeContext': { useTheme: () => ({ colors }) },
    '@/store/useAuthStore': { useAuthStore: fn => fn({ isAuthenticated: true, user: { id: owner } }) },
    '@/services/assistantSession': { captureSession: () => ({ owner, epoch: 0 }), assertSession: s => { if (s.owner !== owner) throw new Error('Session changed'); } },
    '@/services/supplyReview': { supplyReview: { capabilities: async s => s.owner === 'owner-a' ? response : { enabled: false, has_history: true } } },
  }).default;
  await act(async () => { tree = create(React.createElement(Component)); await Promise.resolve(); });
  await act(async () => { owner = 'owner-b'; tree.update(React.createElement(Component)); for (let i = 0; i < 10; i++) await Promise.resolve(); });
  const text = () => tree.root.findAllByType('Text').map(n => n.children.join('')).join(' ');
  assert.match(text(), /Supply review history/);
  await act(async () => { finish({ enabled: true, has_history: true }); for (let i = 0; i < 10; i++) await Promise.resolve(); });
  assert.match(text(), /Supply review history/); assert.equal(text().includes('Current stock, incoming orders'), false);
  await act(async () => tree.unmount());
});
