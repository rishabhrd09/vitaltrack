/* eslint-env node */
// Run the real auth service and API client with a recording fetch and in-memory SecureStore.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const compile = (file) => ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const response = (status, data = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => 'application/json' }, json: async () => data });

function harness(initialAccess, { pendingLogout, timeout = false } = {}) {
  const stored = new Map([['vitaltrack_access_token', initialAccess], ['vitaltrack_refresh_token', 'R1']]);
  const calls = [];
  const load = (file, dependencies, extra = {}) => {
    const mod = { exports: {} };
    vm.runInNewContext(compile(file), {
      exports: mod.exports, module: mod, AbortController, TypeError, Date, Map,
      setTimeout: (fn, ms) => setTimeout(fn, timeout && ms === 30_000 ? 5 : ms), clearTimeout, ...extra,
      require: (name) => { if (name in dependencies) return dependencies[name]; throw new Error(`Unexpected dependency: ${name}`); },
    }, { filename: file });
    return mod.exports;
  };
  const api = load('services/api.ts', {
    'expo-secure-store': {
      getItemAsync: async (key) => stored.get(key) || null,
      setItemAsync: async (key, value) => stored.set(key, value),
      deleteItemAsync: async (key) => stored.delete(key),
    },
    '@/utils/logger': { logger: new Proxy({}, { get: () => () => {} }) },
    '@/store/useAuthStore': { useAuthStore: { getState: () => ({ isAuthenticated: false }) } },
  }, {
    process: { env: {} }, __DEV__: false,
    fetch: async (url, options) => {
      const endpoint = url.replace(/^.*\/api\/v1/, '');
      calls.push({ endpoint, auth: options.headers?.Authorization, body: options.body && JSON.parse(options.body) });
      if (endpoint === '/auth/logout' && pendingLogout) return pendingLogout(options);
      if (endpoint === '/auth/refresh') return response(200, { access_token: 'A2', refresh_token: 'R2' });
      const valid = ['Bearer A1', 'Bearer A2'].includes(options.headers.Authorization);
      return response(valid ? 200 : 401, { message: 'ok' });
    },
  });
  const { authService } = load('services/auth.ts', { './api': api });
  return { authService, calls, stored, tokenStorage: api.tokenStorage };
}

test('logout after access-token expiry also revokes the rotated refresh token (F-9)', async () => {
  const { authService, calls, stored } = harness('expired-access');
  await authService.logout();
  await new Promise(resolve => setImmediate(resolve));
  const logouts = calls.filter((c) => c.endpoint === '/auth/logout');
  // 401 → isolated refresh revokes R1 by rotation → logout revokes R2.
  assert.deepEqual(logouts.map((c) => c.body.refresh_token), ['R1', 'R2']);
  assert.equal(logouts.at(-1).auth, 'Bearer A2');
  assert.equal(stored.size, 0);
});

test('logout clears local tokens before a stalled server revocation completes', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness('A1', { pendingLogout: () => pending });
  await h.authService.logout();
  assert.equal(h.stored.size, 0);
  await h.tokenStorage.setTokens('new-login-access', 'new-login-refresh');
  release(response(200));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.stored.get('vitaltrack_access_token'), 'new-login-access');
  assert.equal(h.stored.get('vitaltrack_refresh_token'), 'new-login-refresh');
});

test('unreachable revocation times out without restoring credentials', async () => {
  let aborted = false;
  const h = harness('A1', { timeout: true, pendingLogout: options => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('Aborted')); });
  }) });
  await h.authService.logout();
  assert.equal(h.stored.size, 0);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(aborted, true);
  assert.equal(h.stored.size, 0);
});

test('logout with a valid access token sends exactly one request', async () => {
  const { authService, calls, stored } = harness('A1');
  await authService.logout();
  assert.deepEqual(calls.map((c) => c.endpoint), ['/auth/logout']);
  assert.equal(calls[0].body.refresh_token, 'R1');
  assert.equal(stored.size, 0);
});
