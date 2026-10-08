/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness({ backupFails = false } = {}) {
  const reads = [], deletes = [], backups = [], backupPaths = [];
  let backupId = 0;
  class FixedDate extends Date {
    constructor() { super('2026-10-08T01:02:03.123Z'); }
  }
  const items = [{ id: 'new-on-server', name: 'Gauze', categoryId: 'cat', quantity: 9, version: 3 }];
  const categories = [{ id: 'cat', name: 'Supplies', updatedAt: '2026-10-08T01:02:03.456789Z' }];
  let signedIn = true;
  const session = { owner: 'owner', epoch: 1 };
  const mod = { exports: {} };
  const dependencies = {
    react: { useState: () => [false, () => {}] },
    '@tanstack/react-query': { useQueryClient: () => ({ resetQueries: async () => {}, refetchQueries: async () => {} }) },
    '@/services/items': { itemService: { getAll: async () => { reads.push('items'); return { items }; }, delete: async (...args) => deletes.push(['item', ...args]) } },
    '@/services/categories': { categoryService: { getAll: async () => { reads.push('categories'); return { categories }; }, delete: async (...args) => deletes.push(['category', ...args]) } },
    '@/services/api': { ApiClientError: class extends Error {} },
    '@/services/assistantSession': { captureSession: () => session, assertSession: () => { if (!signedIn) throw new Error('Session changed'); } },
    '@/data/seedData': { SEED_DATA: [], ESSENTIAL_ITEM_KEYWORDS: ['oxygen'] },
    './useServerData': { queryKeys: { items: ['items'], categories: ['categories'], activities: ['activities'] } },
    '@/utils/logger': { logger: { warn() {} } },
    '@/utils/helpers': { generateId: () => `backup-${++backupId}` },
    'expo-file-system/legacy': { documentDirectory: 'file:///documents/', writeAsStringAsync: async (file, json) => { if (backupFails) throw new Error('Disk full'); backupPaths.push(file); backups.push(JSON.parse(json)); } },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../hooks/useSeedInventory.ts'), 'utf8'), {
    fileName: 'useSeedInventory.ts', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports: mod.exports, module: mod, Date: FixedDate, require: name => { if (name in dependencies) return dependencies[name]; throw new Error(name); } });
  return { ...mod.exports, reads, deletes, backups, backupPaths, items, categories, logout: () => { signedIn = false; } };
}

test('Replace All deletes only the server data already saved in its backup', async () => {
  const h = harness();
  const { snapshot } = await h.prepareInventoryReset();
  assert.equal(h.backups.length, 1);
  assert.equal(h.backups[0].items[0].id, 'new-on-server');
  await h.deleteAllInventory(snapshot);
  assert.deepEqual(h.reads, ['items', 'categories']); // No second, different deletion snapshot.
  assert.deepEqual(h.deletes, [['item', 'new-on-server', 3], ['category', 'cat', true, '2026-10-08T01:02:03.456789Z']]);
});

test('a failed backup prevents the destructive operation from being prepared', async () => {
  const h = harness({ backupFails: true });
  await assert.rejects(h.prepareInventoryReset(), /Disk full/);
  assert.equal(h.deletes.length, 0);
});

test('two backups made at the same instant never overwrite the earlier file', async () => {
  const h = harness();
  const first = await h.prepareInventoryReset();
  h.items[0].quantity = 11;
  const second = await h.prepareInventoryReset();
  assert.notEqual(first.backupPath, second.backupPath);
  assert.equal(first.snapshot.items[0].quantity, 9);
  assert.equal(second.snapshot.items[0].quantity, 11);
  assert.equal(new Set(h.backupPaths).size, 2);
  assert.equal(h.backups[0].items[0].quantity, 9);
  assert.equal(h.backups[1].items[0].quantity, 11);
});

test('a reset cannot silently omit the item version check', async () => {
  const h = harness();
  delete h.items[0].version;
  await assert.rejects(h.prepareInventoryReset(), /versions could not be verified/);
  assert.equal(h.backups.length, 0); assert.equal(h.deletes.length, 0);
});

test('a reset cannot silently omit the category update-time check', async () => {
  const h = harness();
  delete h.categories[0].updatedAt;
  await assert.rejects(h.prepareInventoryReset(), /Category update times could not be verified/);
  assert.equal(h.backups.length, 0); assert.equal(h.deletes.length, 0);
});

test('Start Fresh preserves essential items and uses the backed-up versions', async () => {
  const h = harness();
  h.items.push({ id: 'essential', name: 'Oxygen cylinder', quantity: 5, version: 8 });
  const { snapshot } = await h.prepareInventoryReset();
  const result = await h.useStartFresh().startFresh(snapshot);
  assert.equal(result.deleted, 1); assert.equal(result.kept, 1);
  assert.deepEqual(h.deletes, [['item', 'new-on-server', 3]]);
  assert.equal(h.backups[0].items.length, 2);
});

test('an account change prevents a saved reset snapshot from deleting another account data', async () => {
  const h = harness();
  const { snapshot } = await h.prepareInventoryReset();
  h.logout();
  await assert.rejects(h.deleteAllInventory(snapshot), /Session changed/);
  assert.equal(h.deletes.length, 0);
});
