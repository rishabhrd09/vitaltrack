/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

const host = name => {
  const Component = ({ children, ...props }) => React.createElement(name, props, children);
  Component.displayName = name;
  return Component;
};
function load(file, dependencies = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name in dependencies) return dependencies[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error(`Unmocked dependency: ${name}`);
  } });
  return module.exports;
}

async function harness(initial) {
  let items = initial ? [initial] : [];
  const updates = [], creates = [], alerts = [];
  const mutation = record => ({ isPending: false, mutate: data => record.push(data) });
  const rn = Object.fromEntries(['View', 'Text', 'ScrollView', 'TextInput', 'TouchableOpacity', 'KeyboardAvoidingView', 'Image', 'ActivityIndicator'].map(n => [n, host(n)]));
  Object.assign(rn, { StyleSheet: { create: x => x }, Platform: { OS: 'android' }, Alert: { alert: (...args) => alerts.push(args) } });
  const Screen = load('app/item/[id].tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn,
    'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') },
    '@expo/vector-icons': { Ionicons: host('Icon') },
    'expo-router': { useRouter: () => ({}), useLocalSearchParams: () => ({ id: 'item-1' }) },
    'expo-image-picker': {}, '@/theme/ThemeContext': { useTheme: () => ({ colors: {} }) },
    '@/theme/spacing': load('theme/spacing.ts'), '@/utils/helpers': { COMMON_UNITS: ['pieces'] },
    '@/utils/sanitize': load('utils/sanitize.ts', { '@/utils/logger': { logger: { warn() {} } } }),
    '@/hooks/useServerData': { useItems: () => ({ data: items }), useCategories: () => ({ data: [{ id: 'cat-1', name: 'Supplies' }] }) },
    '@/hooks/useServerMutations': { useCreateItem: () => mutation(creates), useUpdateItem: () => mutation(updates), useDeleteItem: () => mutation([]) },
    '@/hooks/usePendingItems': { usePendingItemIds: () => new Set() },
    '@/store/useAuthStore': { useAuthStore: () => false }, '@/hooks/useNetworkStatus': { useNetworkStatus: () => ({ isOnline: true }) },
    '@/utils/serverErrors': { handleMutationError() {} }, '@/utils/navigation': { safeBack() {} }, '@/utils/toast': { toast: { info() {} } },
  }).default;
  let tree;
  await act(async () => { tree = create(React.createElement(Screen)); });
  return { updates, creates, alerts,
    refresh: async item => { items = [item]; await act(async () => tree.update(React.createElement(Screen))); },
    save: async () => { const button = tree.root.findAllByType('TouchableOpacity').find(n => n.findAllByType('Text').some(t => t.children.join('') === 'Save')); await act(async () => button.props.onPress()); },
    dispose: async () => { await act(async () => tree.unmount()); },
  };
}
const original = { id: 'item-1', categoryId: 'cat-1', name: 'Gauze', quantity: 10, minimumStock: 2, unit: 'pieces', version: 4, isActive: true };

test('a refetch cannot pair stale form stock with the newer server version', async () => {
  const h = await harness(original);
  try {
    await h.refresh({ ...original, quantity: 25, version: 5 });
    await h.save();
    assert.equal(h.updates.length, 1);
    assert.equal(h.updates[0].quantity, 10);
    assert.equal(h.updates[0].version, 4); // Server CAS must reject this stale edit.
  } finally { await h.dispose(); }
});

test('a form opened before the item loaded cannot overwrite it with defaults', async () => {
  const h = await harness();
  try {
    await h.refresh(original);
    await h.save();
    assert.equal(h.updates.length, 0);
    assert.equal(h.alerts[0][0], 'Item details not loaded');
  } finally { await h.dispose(); }
});

test('a normally loaded form sends its stock and version unchanged', async () => {
  const h = await harness(original);
  try {
    await h.save();
    assert.equal(h.updates[0].version, 4);
    assert.equal(h.updates[0].quantity, 10);
    assert.equal(h.creates.length, 0);
  } finally { await h.dispose(); }
});

test('an item name containing only markup cannot be saved as empty text', async () => {
  const h = await harness({ ...original, name: '<b></b>' });
  try {
    await h.save();
    assert.equal(h.updates.length, 0);
    assert.equal(h.creates.length, 0);
    assert.match(h.alerts[0][1], /must contain text/);
  } finally { await h.dispose(); }
});

test('the real item form preserves legitimate name and contact punctuation', async () => {
  const h = await harness({ ...original, name: "O'Neil & Sons", supplierContact: 'orders_team@example.com' });
  try {
    await h.save();
    assert.equal(h.updates[0].name, "O'Neil & Sons");
    assert.equal(h.updates[0].supplierContact, 'orders_team@example.com');
  } finally { await h.dispose(); }
});
