/* eslint-env node */
// Load the real QueryProvider with the installed TanStack Query; stub only native modules.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const tanstack = require('@tanstack/react-query');

// Pass `storage` to use the real AsyncStorage persister on an in-memory store.
function load({ storage } = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../providers/QueryProvider.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const stubs = {
    react: React,
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    '@tanstack/react-query': tanstack,
    '@react-native-community/netinfo': { addEventListener: () => () => {} },
    '@tanstack/react-query-persist-client': { PersistQueryClientProvider: 'PersistQueryClientProvider' },
    '@tanstack/query-async-storage-persister': storage
      ? require('@tanstack/query-async-storage-persister')
      : { createAsyncStoragePersister: (options) => ({ options }) },
    '@react-native-async-storage/async-storage': storage || {},
    'expo-constants': { expoConfig: { version: 'test' } },
    '@/utils/toast': { toast: { error() {} } },
  };
  vm.runInNewContext(compiled, {
    module: mod, exports: mod.exports, Object, Promise, Error,
    require: (name) => { if (name in stubs) return stubs[name]; throw new Error('Unexpected dependency: ' + name); },
  }, { filename: 'QueryProvider.tsx' });
  return mod.exports;
}

test('offline saves fail fast instead of pausing silently (N-1)', async () => {
  const { queryClient } = load();
  assert.equal(queryClient.getDefaultOptions().mutations.networkMode, 'always');
  tanstack.onlineManager.setOnline(false);
  try {
    let calls = 0;
    const observer = new tanstack.MutationObserver(queryClient, {
      mutationFn: async () => { calls++; throw new Error('Network request failed'); },
    });
    await assert.rejects(observer.mutate({ id: 'item-1' }), /Network request failed/);
    assert.equal(calls, 1);
    assert.equal(queryClient.isMutating(), 0);
  } finally {
    tanstack.onlineManager.setOnline(true);
  }
});

test('mutations are never written to the persisted cache (N-1)', () => {
  const { QueryProvider } = load();
  const element = QueryProvider({ children: null });
  const { dehydrateOptions } = element.props.persistOptions;
  assert.equal(dehydrateOptions.shouldDehydrateMutation({ state: { isPaused: true, status: 'pending' } }), false);
  // Query persistence is unchanged: auth keys excluded, inventory kept.
  assert.equal(dehydrateOptions.shouldDehydrateQuery({ queryKey: ['items'], state: { data: [] } }), true);
  assert.equal(dehydrateOptions.shouldDehydrateQuery({ queryKey: ['me'], state: { data: {} } }), false);
});

test('a cache saved by an older build restores its data but not its saves (N-1)', async () => {
  const { persistQueryClientRestore } = require('@tanstack/query-persist-client-core');
  const memory = new Map();
  const storage = {
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => { memory.set(key, value); },
    removeItem: async (key) => { memory.delete(key); },
  };
  const { queryClient, QueryProvider, CACHE_STORAGE_KEY } = load({ storage });
  const { persistOptions } = QueryProvider({ children: null }).props;

  // What an older build could leave on disk: cached inventory plus a paused save.
  const older = new tanstack.QueryClient();
  older.setQueryData(['items'], [{ id: 'item-1', name: 'Gauze' }]);
  older.getMutationCache().build(older, { mutationKey: ['item-update'] }, {
    context: undefined, data: undefined, error: null, failureCount: 0, failureReason: null,
    isPaused: true, status: 'pending', variables: { id: 'item-1', quantity: 9 }, submittedAt: Date.now(),
  });
  memory.set(CACHE_STORAGE_KEY, JSON.stringify({
    buster: persistOptions.buster, timestamp: Date.now(), clientState: tanstack.dehydrate(older),
  }));

  // The app's real restore path: its AsyncStorage persister and options, same buster.
  try {
    await persistQueryClientRestore({ ...persistOptions, queryClient });
    assert.equal(queryClient.isMutating(), 0);
    assert.equal(queryClient.getMutationCache().getAll().length, 0);
    assert.deepEqual(queryClient.getQueryData(['items']), [{ id: 'item-1', name: 'Gauze' }]);
  } finally {
    // The restored query carries the app's 24 h gcTime; clear it so its timer
    // does not keep the test process alive.
    queryClient.clear();
  }
});

test('live saves are not touched by the restore guard', async () => {
  const { queryClient } = load();
  let finish;
  const observer = new tanstack.MutationObserver(queryClient, {
    mutationFn: () => new Promise((resolve) => { finish = resolve; }),
  });
  const pending = observer.mutate({ id: 'item-1' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queryClient.isMutating(), 1);
  finish('saved');
  assert.equal(await pending, 'saved');
  assert.equal(queryClient.isMutating(), 0);
});
