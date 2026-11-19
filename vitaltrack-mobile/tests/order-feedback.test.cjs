/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function harness() {
  const calls = { invalidated: [], success: [], failure: [] };
  const client = { invalidateQueries: ({ queryKey }) => { calls.invalidated.push(queryKey[0]); return Promise.resolve(); } };
  const deps = {
    '@tanstack/react-query': { useQueryClient: () => client, useMutation: config => config },
    './useServerData': { queryKeys: { orders: ['orders'], activities: ['activities'] } },
    '@/services/items': {}, '@/services/categories': {}, '@/services/orders': { orderService: {} },
    '@/utils/mutationFeedback': { isConnectionError: () => false, dispatchMutationSuccess: info => calls.success.push(info), dispatchMutationFailure: info => calls.failure.push(info) },
  };
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../hooks/useServerMutations.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, require(name) { if (name in deps) return deps[name]; throw new Error(name); } });
  return { calls, hook: mod.exports.useCreateOrder };
}

test('default order mutation feedback remains available for existing callers', () => {
  const h = harness(); const mutation = h.hook();
  mutation.onSuccess({ orderId: 'ORD-1' }, {}, { startedAt: 1 });
  mutation.onError(new Error('Offline'), { localId: 'same-submission' }, { startedAt: 1 });
  assert.deepEqual(h.calls.invalidated, ['orders', 'activities']);
  assert.equal(h.calls.success.length, 1); assert.equal(h.calls.failure.length, 1);
  assert.equal(h.calls.success[0].name, 'Order ORD-1'); assert.equal(typeof h.calls.failure[0].onRetry, 'function');
});

test('screen-owned order feedback refreshes server lists without covering the PDF/share flow with another dialog', () => {
  const h = harness(); const mutation = h.hook({ feedback: 'screen' });
  mutation.onSuccess({ orderId: 'ORD-1' }, {}, { startedAt: 1 });
  mutation.onError(new Error('Offline'), { localId: 'same-submission' }, { startedAt: 1 });
  assert.deepEqual(h.calls.invalidated, ['orders', 'activities']);
  assert.equal(h.calls.success.length, 0); assert.equal(h.calls.failure.length, 0);
});
