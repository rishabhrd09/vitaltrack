/* eslint-env node */
// Real dashboard/order components, synthetic data, recording callbacks; no server mutations.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.join(__dirname, '..');
function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name in dependencies) return dependencies[name];
    throw new Error('Unmocked dependency: ' + name);
  } });
  return module.exports;
}
const host = name => function Host({ children, ...props }) { return React.createElement(name, props, children); };
function environment({ width = 390, fontScale = 1 } = {}) {
  const colors = load('theme/colors.ts').colors;
  const native = Object.fromEntries(['View', 'Text', 'TouchableOpacity', 'ActivityIndicator', 'ScrollView', 'RefreshControl'].map(name => [name, host(name)]));
  Object.assign(native, { StyleSheet: { create: value => value, hairlineWidth: 1 }, useWindowDimensions: () => ({ width, height: 844, fontScale }), Alert: { alert() { throw new Error('Unexpected confirmation in render'); } } });
  return { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': native, '@expo/vector-icons': { Ionicons: host('Icon') }, '@/theme/ThemeContext': { useTheme: () => ({ colors }) }, '@/theme/spacing': load('theme/spacing.ts'), '@/types': load('types/index.ts') };
}
async function render(Component, props) {
  let tree; await act(async () => { tree = create(React.createElement(Component, props)); });
  return { tree,
    button: label => tree.root.findAllByType('TouchableOpacity').find(node => node.props.accessibilityLabel === label),
    text: () => tree.root.findAllByType('Text').map(node => node.children.filter(child => typeof child === 'string' || typeof child === 'number').join('')).join('\n'),
    async press(label) { const button = this.button(label); assert.ok(button, label); await act(async () => button.props.onPress()); },
    async dispose() { await act(async () => tree.unmount()); },
  };
}
const item = (id, name, quantity, unit = 'unit') => ({ id, name, quantity, unit, minimumStock: 2, isCritical: true, isActive: true });

test('emergency backup preserves critical counts, real units and item/order routing through expansion', async () => {
  const edited = []; let emergency = 0, generic = 0;
  const NeedsAttention = load('components/dashboard/NeedsAttention.tsx', { ...environment(), '@/hooks/usePendingItems': { usePendingItemIds: () => new Set() } }).default;
  const lows = Array.from({ length: 6 }, (_, i) => item('low-' + i, 'Critical reserve ' + i, 1, i === 0 ? 'cylinder' : 'pieces'));
  lows.push({ ...item('ordinary', 'Plain gauze', 1, 'packets'), isCritical: false });
  const h = await render(NeedsAttention, { lowStockItems: lows, outOfStockItems: [item('zero-a', 'Oxygen concentrator', 0), item('zero-b', 'Ambu bag', 0)], onOrderNow: () => generic++, onEmergencyOrder: () => emergency++, onEditItem: id => edited.push(id) });
  try {
    const rows = () => h.tree.root.findAllByType('TouchableOpacity').filter(node => /^Review .+, .+, (?:out of stock|low stock)$/.test(node.props.accessibilityLabel || ''));
    assert.equal(rows().length, 3); assert.ok(h.text().includes('2 out of stock')); assert.ok(h.text().includes('6 low reserve'));
    await h.press('Show all emergency backup items'); assert.equal(rows().length, 8);
    assert.ok(h.button('Review Critical reserve 0, 1 cylinder, low stock')); assert.equal(h.button('Review Plain gauze, 1 packets, low stock'), undefined);
    await h.press('Review Oxygen concentrator, 0 unit, out of stock'); assert.deepEqual(edited, ['zero-a']);
    await h.press('Review emergency order'); assert.equal(emergency, 1); assert.equal(generic, 0);
    await h.press('Show fewer emergency backup items'); assert.equal(rows().length, 3);
  } finally { await h.dispose(); }
});

test('emergency order retains the existing fallback and excludes noncritical low-stock items', async () => {
  const NeedsAttention = load('components/dashboard/NeedsAttention.tsx', { ...environment(), '@/hooks/usePendingItems': { usePendingItemIds: () => new Set() } }).default;
  let orders = 0;
  const h = await render(NeedsAttention, { lowStockItems: [item('ambu', 'Ambu bag', 1)], outOfStockItems: [], onOrderNow: () => orders++, onEditItem() {} });
  try { await h.press('Review emergency order'); assert.equal(orders, 1); } finally { await h.dispose(); }
  const ordinary = await render(NeedsAttention, { lowStockItems: [{ ...item('gauze', 'Gauze', 1), isCritical: false }], outOfStockItems: [], onOrderNow() {}, onEditItem() {} });
  try { assert.equal(ordinary.button('Review emergency order'), undefined); } finally { await ordinary.dispose(); }
});
const savedOrder = status => ({ id: 'server-1', orderId: 'ORD-20261024-0001', status, totalItems: 4, totalUnits: 10, exportedAt: '2026-10-24T10:00:00Z', items: Array.from({ length: 4 }, (_, i) => ({ id: 'row-' + i, name: 'Full item name ' + i, quantity: i + 1, unit: 'packets' })) });
const orderDeps = (extra = {}, viewport) => ({ ...environment(viewport), '@/utils/helpers': { formatDate: value => value }, '@/utils/orderPdfExport': { showPdfExportDialog() {} }, ...extra });

test('order card preserves actions, complete item data and exact PDF payload at large font', async () => {
  let received = 0, updated = 0, removed = 0; const exported = [];
  const OrderCard = load('components/orders/OrderCard.tsx', orderDeps({ '@/utils/orderPdfExport': { showPdfExportDialog: value => exported.push(value) } }, { width: 320, fontScale: 1.6 })).default;
  const order = savedOrder('pending');
  const h = await render(OrderCard, { order, onMarkReceived: () => received++, onUpdateStock: () => updated++, onDelete: () => removed++ });
  try {
    await h.press('Order ORD-20261024-0001, Pending'); assert.ok(h.text().includes('4 items • 10 units')); assert.equal(h.text().includes('Full item name 3'), false);
    await h.press('Show all items in order ORD-20261024-0001'); assert.ok(h.text().includes('Full item name 3'));
    await h.press('Mark order ORD-20261024-0001 as received'); assert.equal(received, 1); assert.equal(updated, 0);
    await h.press('Export PDF for order ORD-20261024-0001'); assert.equal(exported.length, 1);
    assert.equal(exported[0].id, order.orderId); assert.equal(exported[0].items, order.items); assert.equal(exported[0].createdAt, order.exportedAt);
    await h.press('Remove order ORD-20261024-0001'); assert.equal(removed, 1); assert.equal(order.status, 'pending'); assert.equal(order.items.length, 4);
  } finally { await h.dispose(); }
});

test('order card displays all supported server statuses and applies stock only for received orders', async () => {
  let updates = 0;
  const OrderCard = load('components/orders/OrderCard.tsx', orderDeps()).default;
  for (const [status, label] of Object.entries({ ordered: 'Ordered', received: 'Received', partially_received: 'Partly received', stock_updated: 'Stock Updated', declined: 'Declined', cancelled: 'Cancelled', completed: 'Completed' })) {
    const h = await render(OrderCard, { order: savedOrder(status), onMarkReceived() {}, onUpdateStock: () => updates++, onDelete() {} });
    try {
      await h.press(`Order ORD-20261024-0001, ${label}`);
      if (status === 'received') await h.press('Update stock from order ORD-20261024-0001'); else assert.equal(h.button('Update stock from order ORD-20261024-0001'), undefined);
    } finally { await h.dispose(); }
  }
  assert.equal(updates, 1);
});

test('orders header creates an order without a floating control covering card actions', async () => {
  const navigation = [];
  const OrdersScreen = load('app/(tabs)/orders.tsx', { ...environment({ width: 320, fontScale: 1.6 }),
    'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') }, 'expo-router': { useRouter: () => ({ push: value => navigation.push(value) }) },
    '@/components/orders/OrderCard': host('OrderCard'), '@/components/common/SkeletonLoader': { SkeletonLoader: host('SkeletonLoader') }, '@/components/common/StatusPill': host('StatusPill'),
    '@/hooks/useServerData': { useOrders: () => ({ data: [savedOrder('pending')], isLoading: false, refetch() {}, isRefetching: false }) },
    '@/hooks/useServerMutations': Object.fromEntries(['useUpdateOrderStatus', 'useApplyOrderToStock', 'useDeleteOrder'].map(key => [key, () => ({ mutateAsync: async () => {} })])),
    '@/hooks/useNetworkStatus': { useNetworkStatus: () => ({ isOnline: true }) }, '@/utils/serverErrors': { handleMutationError() {} },
  }).default;
  const h = await render(OrdersScreen);
  try { await h.press('Create order'); assert.deepEqual(navigation, ['/order/create']); assert.equal(h.tree.root.findAllByType('TouchableOpacity').length, 1); assert.equal(h.tree.root.findAllByType('OrderCard').length, 1); }
  finally { await h.dispose(); }
});

test('dashboard emergency action routes its critical-stock mode and ignores inactive inventory', async () => {
  const navigation = [];
  const deps = environment();
  const inventory = [item('zero', 'Oxygen concentrator', 0), item('one', 'Ambu bag', 1), { ...item('ordinary-zero', 'Plain gauze', 0, 'packets'), isCritical: false }, { ...item('ordinary-low', 'Plain wipes', 1, 'packets'), isCritical: false }, { ...item('inactive', 'Suction machine', 0), isActive: false }];
  const NeedsAttention = load('components/dashboard/NeedsAttention.tsx', { ...deps, '@/hooks/usePendingItems': { usePendingItemIds: () => new Set() } }).default;
  const dependencies = { ...deps,
    'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') }, 'expo-router': { useRouter: () => ({ push: value => navigation.push(value) }) },
    '@/store/useAuthStore': { useAuthStore: select => select({ user: { name: 'Synthetic owner' }, logout() {} }) },
    '@/hooks/useServerData': { useItems: () => ({ data: inventory, isLoading: false, refetch() {} }), useOrders: () => ({ data: [] }), useActivities: () => ({ data: [] }) },
    '@/hooks/useNetworkStatus': { useNetworkStatus: () => ({ isOnline: true }) }, '@/hooks/useForceSync': { useForceSync: () => async () => ({ itemCount: 4, categoryCount: 1 }) },
    '@/components/dashboard/NeedsAttention': NeedsAttention,
    '@/components/common/SkeletonLoader': { SkeletonLoader: host('SkeletonLoader') },
  };
  for (const name of ['VitalTrackTopBar', 'StatusPill', 'ProfileMenuSheet', 'ExportModal', 'HelpSupportDialog', 'AboutCareKoshDialog']) dependencies['@/components/common/' + name] = host(name);
  for (const name of ['StatsCard', 'ActivityList']) dependencies['@/components/dashboard/' + name] = host(name);
  const Dashboard = load('app/(tabs)/index.tsx', dependencies).default;
  const h = await render(Dashboard);
  try {
    const stats = h.tree.root.findAllByType('StatsCard');
    assert.equal(stats.find(node => node.props.title === 'Total Items').props.value, 4);
    assert.equal(stats.find(node => node.props.title === 'Out of Stock').props.value, 2);
    const rows = h.tree.root.findAllByType('TouchableOpacity').filter(node => /^Review .+, .+, (?:out of stock|low stock)$/.test(node.props.accessibilityLabel || ''));
    assert.equal(rows.length, 2); assert.equal(h.button('Review Suction machine, 0 unit in stock'), undefined);
    await h.press('Review emergency order');
    assert.deepEqual(JSON.parse(JSON.stringify(navigation)), [{ pathname: '/order/create', params: { mode: 'emergency' } }]);
  } finally { await h.dispose(); }
});
