/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { QueryClient } = require('@tanstack/react-query');

async function harness(options = {}) {
  const qc = new QueryClient();
  qc.setQueryData(['items'], [{ id: 'old-owner-item' }]);
  const credentials = new Map([['access', 'old-access'], ['refresh', 'old-refresh']]);
  let release, loginCalls = 0, registerCalls = 0, diskCleared = 0;
  const clearing = new Promise(resolve => { release = resolve; });
  const dependencies = {
    zustand: require('zustand'), 'zustand/middleware': require('zustand/middleware'),
    'expo-secure-store': { getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} },
    '@react-native-async-storage/async-storage': { default: { removeItem: async () => { diskCleared++; } } },
    '@/services/auth': { authService: {
      logout: async () => { if (!options.immediateLogout) await clearing; credentials.clear(); },
      getProfile: options.getProfile || (async () => ({ id: 'old-owner' })),
      login: async () => { loginCalls++; credentials.set('access', 'new-access'); return { user: { id: 'new-owner' } }; },
      register: async () => { registerCalls++; },
    } },
    '@/services/api': { tokenStorage: { getAccessToken: async () => credentials.get('access'), clearTokens: async () => credentials.clear() }, ApiClientError: class extends Error {} },
    '@/utils/logger': { logger: new Proxy({}, { get: () => () => {} }) },
    '@/providers/QueryProvider': { queryClient: qc, CACHE_STORAGE_KEY: 'cache' },
    './useAppStore': { useAppStore: { getState: () => ({ resetUIState() {} }) } },
  };
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../store/useAuthStore.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports: mod.exports, module: mod, Date, AbortController, setTimeout: options.setTimeout || (() => 0), clearTimeout: options.clearTimeout || (() => {}), require: name => { if (name in dependencies) return dependencies[name]; throw new Error(name); } });
  await new Promise(resolve => setImmediate(resolve));
  const store = mod.exports.useAuthStore;
  store.setState({ user: { id: 'old-owner' }, isAuthenticated: true });
  return { store, qc, credentials, release, calls: () => ({ loginCalls, registerCalls, diskCleared }) };
}

test('login and registration cannot race local logout cleanup; the next session survives', async () => {
  const h = await harness();
  try {
    const logout = h.store.getState().logout();
    assert.equal(h.store.getState().user, null);
    assert.equal(h.store.getState().isAuthenticated, false);
    assert.equal(h.store.getState().isLoggingOut, true);
    assert.equal(await h.store.getState().login('new-user', 'password'), false);
    assert.equal(await h.store.getState().register({}), false);
    assert.equal(h.calls().loginCalls, 0); assert.equal(h.calls().registerCalls, 0);
    h.release(); await logout;
    assert.equal(h.credentials.size, 0);
    assert.equal(h.qc.getQueryData(['items']), undefined);
    assert.equal(h.calls().diskCleared, 1);
    assert.equal(await h.store.getState().login('new-user', 'password'), true);
    assert.equal(h.store.getState().user.id, 'new-owner');
    assert.equal(h.credentials.get('access'), 'new-access');
  } finally { h.release(); h.qc.clear(); }
});


test('an old initialization result cannot replace a newly logged-in account', async () => {
  let resolve;
  const h = await harness({ immediateLogout: true, getProfile: () => new Promise(r => { resolve = r; }) });
  try {
    const initialize = h.store.getState().initialize();
    await new Promise(r => setImmediate(r));
    await h.store.getState().logout();
    await h.store.getState().login('new-user', 'password');
    resolve({ id: 'old-owner' });
    await initialize;
    assert.equal(h.store.getState().user.id, 'new-owner');
    assert.equal(h.credentials.get('access'), 'new-access');
  } finally { h.release(); h.qc.clear(); }
});

test('cold-start retry is cancelled on logout and late retry results are ignored', async () => {
  let id = 0, calls = 0, resolveRetry;
  const timers = new Map();
  const h = await harness({ immediateLogout: true,
    setTimeout: (fn, ms) => { const n = ++id; timers.set(n, { fn: () => { timers.delete(n); return fn(); }, ms }); return n; }, clearTimeout: n => timers.delete(n),
    getProfile: () => { calls++; return calls === 1 ? new Promise(() => {}) : new Promise(r => { resolveRetry = r; }); },
  });
  try {
    const initialize = h.store.getState().initialize();
    await new Promise(r => setImmediate(r));
    [...timers.values()].find(t => t.ms === 8000).fn();
    await initialize;
    const retry = [...timers.values()].find(t => t.ms === 5000);
    assert.ok(retry);
    const pending = retry.fn();
    await h.store.getState().logout();
    await h.store.getState().login('new-user', 'password');
    resolveRetry({ id: 'old-owner' }); await pending;
    assert.equal(h.store.getState().user.id, 'new-owner');
    assert.equal(h.store.getState().isBackendColdStarting, false);
    assert.equal([...timers.values()].some(t => t.ms === 5000), false);
  } finally { h.release(); h.qc.clear(); }
});

test('a stale initialization rejection cannot clear newer credentials', async () => {
  let reject;
  const h = await harness({ immediateLogout: true, getProfile: () => new Promise((_, r) => { reject = r; }) });
  try {
    const initialize = h.store.getState().initialize(); await new Promise(r => setImmediate(r));
    await h.store.getState().logout(); await h.store.getState().login('new-user', 'password');
    reject(Object.assign(new Error('Unauthorized'), { status: 401 })); await initialize;
    assert.equal(h.store.getState().user.id, 'new-owner'); assert.equal(h.credentials.get('access'), 'new-access');
  } finally { h.release(); h.qc.clear(); }
});
