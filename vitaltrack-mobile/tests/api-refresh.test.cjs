/* eslint-env node */
// Execute the real client with deterministic transport/storage, without Expo.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/api.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (status, data = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => 'application/json' }, json: async () => data });
const tokens = { access_token: 'new-access', refresh_token: 'new-refresh' };

function harness(refresh, { timeout = false, protectedFetch } = {}) {
  const stored = new Map([['vitaltrack_access_token', 'old-access'], ['vitaltrack_refresh_token', 'old-refresh']]);
  const mod = { exports: {} };
  let refreshCalls = 0;
  const sandbox = {
    exports: mod.exports, module: mod, process: { env: {} }, __DEV__: false,
    AbortController, TypeError, Date, Map, clearTimeout,
    setTimeout: (fn, ms) => setTimeout(fn, timeout && ms === 30_000 ? 5 : ms),
    fetch: async (url, options) => {
      if (url.endsWith('/auth/refresh')) { refreshCalls++; return refresh(options); }
      if (protectedFetch) return protectedFetch(url, options);
      return response(options.headers.Authorization === 'Bearer new-access' ? 200 : 401, { ok: true });
    },
    require: name => {
      if (name === 'expo-secure-store') return {
        getItemAsync: async key => stored.get(key) || null,
        setItemAsync: async (key, value) => stored.set(key, value),
        deleteItemAsync: async key => stored.delete(key),
      };
      if (name === '@/utils/logger') return { logger: new Proxy({}, { get: () => () => {} }) };
      if (name === '@/store/useAuthStore') return { useAuthStore: { getState: () => ({ isAuthenticated: false }) } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compiled, sandbox, { filename: 'api.ts' });
  return { api: mod.exports.api, stored, refreshCalls: () => refreshCalls };
}

async function settled(promises) {
  let timer;
  try {
    return await Promise.race([
      Promise.allSettled(promises),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Requests did not settle')), 1500); }),
    ]);
  } finally { clearTimeout(timer); }
}

for (const status of [401, 503]) {
  test(`shared refresh ${status} settles every caller with appropriate credential retention`, async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const h = harness(() => pending);
    const outcomes = settled([h.api.get('/auth/me'), h.api.get('/items')]);
    await tick();
    assert.equal(h.refreshCalls(), 1);
    release(response(status));
    const results = await outcomes;
    assert.equal(results.every(result => result.status === 'rejected' && result.reason.status === status), true);
    assert.equal(h.stored.size, status === 401 ? 0 : 2);
  });
}

test('successful shared refresh rotates once and retries every waiting request', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness(() => pending);
  const outcomes = settled([h.api.get('/auth/me'), h.api.get('/items')]);
  await tick();
  release(response(200, tokens));
  assert.equal((await outcomes).every(result => result.status === 'fulfilled'), true);
  assert.equal(h.refreshCalls(), 1);
  assert.equal(h.stored.get('vitaltrack_refresh_token'), 'new-refresh');
});

test('network failure preserves credentials and releases the shared promise for recovery', async () => {
  let offline = true;
  const h = harness(async () => {
    if (offline) throw new TypeError('Network request failed');
    return response(200, tokens);
  });
  const results = await settled([h.api.get('/items'), h.api.get('/orders')]);
  assert.equal(results.every(result => result.status === 'rejected' && result.reason.status === 503), true);
  assert.equal(h.stored.size, 2);
  offline = false;
  assert.equal((await h.api.get('/items')).ok, true);
  assert.equal(h.refreshCalls(), 2);
});

test('a stalled refresh times out and settles all waiters without clearing credentials', async () => {
  const h = harness(options => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }), { timeout: true });
  const results = await settled([h.api.get('/items'), h.api.get('/orders')]);
  assert.equal(results.every(result => result.status === 'rejected' && result.reason.status === 503), true);
  assert.equal(h.stored.size, 2);
});

test('a late old-token 401 reuses the rotated access token without another refresh', async () => {
  let releaseLate;
  const late = new Promise(resolve => { releaseLate = resolve; });
  const h = harness(async () => response(200, tokens), {
    protectedFetch: async (url, options) => {
      if (options.headers.Authorization === 'Bearer new-access') return response(200, { ok: true });
      return url.endsWith('/late') ? late : response(401);
    },
  });
  const slow = h.api.get('/late');
  await tick();
  await h.api.get('/items');
  releaseLate(response(401));
  assert.equal((await slow).ok, true);
  assert.equal(h.refreshCalls(), 1);
});

function orderHarness(get) {
  const source = fs.readFileSync(path.join(__dirname, '../services/orders.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, module: mod, Map, require: () => ({ api: { get } }) });
  return mod.exports.orderService;
}

test('existing order-list contract includes the 101st order and preserves snapshots', async () => {
  const first = Array.from({ length: 100 }, (_, id) => ({ id: `order-${id}`, status: 'pending', items: [{ quantity: 2 }] }));
  const calls = [];
  const service = orderHarness(async url => {
    calls.push(url);
    return url.includes('page=1&')
      ? { orders: first, total: 101, page: 1, pageSize: 100, hasMore: true }
      : { orders: [{ id: 'oldest-order', status: 'received', items: [{ quantity: 4 }] }], total: 101, page: 2, pageSize: 100, hasMore: false };
  });
  const result = await service.getAll();
  assert.equal(result.orders.length, 101);
  assert.equal(result.orders[100].id, 'oldest-order');
  assert.equal(result.orders[100].items[0].quantity, 4);
  assert.equal(calls.length, 2);
});

test('later order-page failures reject instead of presenting incomplete history as complete', async () => {
  const service = orderHarness(async url => {
    if (!url.includes('page=1&')) throw new Error('Offline');
    return { orders: [{ id: 'first' }], total: 101, page: 1, pageSize: 100, hasMore: true };
  });
  await assert.rejects(() => service.getAll(), /Offline/);
});
