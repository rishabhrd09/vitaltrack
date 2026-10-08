/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
const query = require('@tanstack/react-query');
global.IS_REACT_ACT_ENVIRONMENT = true;
class ApiClientError extends Error { constructor(message, status) { super(message); this.status = status; } }
function load(file, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, Promise, require: name => { if (name in dependencies) return dependencies[name]; throw new Error(name); } });
  return module.exports;
}
function feedbackHarness() {
  const dialogs = [], toasts = [];
  const feedback = load('utils/mutationFeedback.ts', {
    '@/services/api': { ApiClientError }, '@/utils/toast': { toast: { success() {}, error: (...args) => toasts.push(args) } },
    '@/store/useResultDialogStore': { useResultDialogStore: { getState: () => ({ enqueue: value => dialogs.push(value) }) } },
  });
  return { feedback, dialogs, toasts };
}

for (const status of [0, 502, 503, 504]) test(`uncertain write ${status} never claims that data was not saved`, () => {
  const h = feedbackHarness();
  h.feedback.dispatchMutationFailure({ name: 'Gauze', action: 'update', startedAt: Date.now(), error: new ApiClientError('Connection failed', status) });
  assert.match(h.dialogs[0].body, /may have saved/);
  assert.doesNotMatch(h.dialogs[0].body, /were not saved/);
});

for (const status of [0, 409]) test(`real item mutation reconciles an active cache after ${status}`, async () => {
  const h = feedbackHarness();
  const qc = new query.QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(['items'], [{ id: 'i', name: 'Gauze', quantity: 1 }]);
  let reads = 0, mutation;
  const hooks = load('hooks/useServerMutations.ts', {
    '@tanstack/react-query': query, './useServerData': { queryKeys: { items: ['items'], categories: ['categories'], orders: ['orders'], activities: ['activities'] } },
    '@/services/items': { itemService: { update: async () => { throw new ApiClientError('Conflict or lost response', status); } } },
    '@/services/categories': {}, '@/services/orders': {}, '@/utils/mutationFeedback': h.feedback,
  });
  function Screen() {
    query.useQuery({ queryKey: ['items'], staleTime: Infinity, queryFn: async () => { reads++; return [{ id: 'i', name: 'Gauze', quantity: 9 }]; } });
    mutation = hooks.useUpdateItem();
    return null;
  }
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(query.QueryClientProvider, { client: qc }, React.createElement(Screen))); });
    await act(async () => { await mutation.mutateAsync({ id: 'i', name: 'Gauze', quantity: 2, version: 1 }).catch(() => {}); });
    assert.equal(reads, 1);
    assert.equal(qc.getQueryData(['items'])[0].quantity, 9);
  } finally { if (tree) await act(async () => tree.unmount()); qc.clear(); }
});
