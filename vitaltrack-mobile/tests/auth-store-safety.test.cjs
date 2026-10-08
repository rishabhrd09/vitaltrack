/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { QueryClient } = require('@tanstack/react-query');

async function harness() {
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
      logout: async () => { await clearing; credentials.clear(); },
      login: async () => { loginCalls++; credentials.set('access', 'new-access'); return { user: { id: 'new-owner' } }; },
      register: async () => { registerCalls++; },
    } },
    '@/services/api': { tokenStorage: { clearTokens: async () => credentials.clear() }, ApiClientError: class extends Error {} },
    '@/utils/logger': { logger: new Proxy({}, { get: () => () => {} }) },
    '@/providers/QueryProvider': { queryClient: qc, CACHE_STORAGE_KEY: 'cache' },
    './useAppStore': { useAppStore: { getState: () => ({ resetUIState() {} }) } },
  };
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../store/useAuthStore.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports: mod.exports, module: mod, Date, setTimeout: () => 0, require: name => { if (name in dependencies) return dependencies[name]; throw new Error(name); } });
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
