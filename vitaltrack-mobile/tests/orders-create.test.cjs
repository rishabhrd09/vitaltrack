/* eslint-env node */
// Execute the real order service with a recording API, without Expo.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/orders.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness() {
  const posts = [];
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: mod.exports, module: mod, Date, Math, Map,
    require: name => {
      if (name === './api') return { api: { post: async (url, body) => { posts.push({ url, body }); return { id: 'server-order' }; } } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: 'orders.ts' });
  return { orderService: mod.exports.orderService, posts };
}

test('create sends the submission localId unchanged, so Retry reuses it', async () => {
  const h = harness();
  const variables = { items: [{ itemId: 'item-1', name: 'Gauze', quantity: 2 }], localId: '9b2f6a3e-4c1d-4e8a-9f70-2d5b8c1e0a47' };
  await h.orderService.create(variables);
  // Retry re-executes the mutation with the same variables object.
  await h.orderService.create(variables);
  assert.equal(h.posts.length, 2);
  for (const { url, body } of h.posts) {
    assert.equal(url, '/orders');
    assert.equal(body.localId, variables.localId);
    assert.deepEqual(body.items, variables.items);
  }
});
