/**
 * VitalTrack Mobile - Create Order Screen
 * Professional Cart Design with +/- Quantity Controls and Enhanced PDF Export
 */

import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  AppState,
  FlatList,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import type { Item } from '@/types';
import { isOutOfStock, isLowStock, isCriticalEquipment } from '@/types';
import { exportOrderPdf } from '@/utils/orderPdfExport';
import { useAuthStore } from '@/store/useAuthStore';
import { captureSession, assertSession, ownsSnapshot } from '@/services/assistantSession';
import { inventorySnapshot } from '@/features/assistant/snapshot';
import { useOrderDraft, getDraft, changeDraft, writeDraft, suggestedQuantity, recheckDraft, beginSubmission, markSaved, releaseRejectedSubmission, clearSavedDraft, type CartItem } from '@/features/assistant/drafts';
import { capabilities } from '@/services/assistant';
import { ApiClientError } from '@/services/api';
import { useItems } from '@/hooks/useServerData';
import { useCreateOrder } from '@/hooks/useServerMutations';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { safeBack } from '@/utils/navigation';


export default function CreateOrderScreen() {
  const { colors } = useTheme();
  const { mode } = useLocalSearchParams();
  const owner = useAuthStore(s => s.isAuthenticated ? s.user?.id : undefined);
  const { isOnline } = useNetworkStatus();

  const { data: items = [], isSuccess, isFetching } = useItems();
  const createOrderMutation = useCreateOrder();

  const draft = useOrderDraft();
  const cartItems = draft && draft.session.owner === owner ? draft.rows : [];
  const isInitialized = !!draft?.initialized && draft.session.owner === owner;
  const setCartItems = (update: (rows: CartItem[]) => CartItem[]) => {
    try { changeDraft(update); } catch (e) { Alert.alert('Draft locked', e instanceof Error ? e.message : 'Review this submission first.'); }
  };
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const dialogEpoch = useRef(0);
  const mounted = useRef(true);
  const preflight = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const lifecycle = AppState.addEventListener('change', state => {
      if (state !== 'active') { dialogEpoch.current++; preflight.current?.abort(); }
    });
    return () => { mounted.current = false; preflight.current?.abort(); lifecycle.remove(); };
  }, [owner]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Initialize Cart based on mode
  // Emergency Order: critical items with stock <= 1 + all out of stock (critical first)
  // Regular Order: out of stock + emergency backup items + low stock (critical first)
  useEffect(() => {
    if (isInitialized || !isSuccess || isFetching || !owner) return;
    const session = captureSession();
    if (!ownsSnapshot(items, session)) return;
    const activeItems = items.filter(item => item.isActive);

    const initialCart: CartItem[] = [];
    const addedIds = new Set<string>();

    // Helper to add item to cart
    const addToCart = (item: Item) => {
      if (addedIds.has(item.id)) return;
      addedIds.add(item.id);
      const qty = suggestedQuantity(item) ?? 1;
      initialCart.push({ item, quantity: qty, source: suggestedQuantity(item) === null ? 'manual' : 'suggested' });
    };

    if (mode === 'emergency') {
      // Emergency Order: Critical items with exactly 1 stock first, then all out of stock
      activeItems
        .filter((item) => isCriticalEquipment(item) && item.quantity === 1)
        .forEach(addToCart);
      activeItems
        .filter((item) => isOutOfStock(item))
        .forEach(addToCart);
    } else {
      // Regular Order: Out of stock first (critical at top)
      activeItems
        .filter((item) => isOutOfStock(item))
        .sort((a, b) => Number(isCriticalEquipment(b)) - Number(isCriticalEquipment(a)))
        .forEach(addToCart);

      // Then emergency backup items (critical with stock <= 1)
      activeItems
        .filter((item) => isCriticalEquipment(item) && item.quantity === 1)
        .forEach(addToCart);

      // Then low stock items (critical at top)
      activeItems
        .filter((item) => isLowStock(item))
        .sort((a, b) => Number(isCriticalEquipment(b)) - Number(isCriticalEquipment(a)))
        .forEach(addToCart);
    }

    writeDraft(session, initialCart);
  }, [items, mode, isInitialized, isSuccess, isFetching, owner]);

  // ============================================================================
  // QUANTITY CONTROLS
  // ============================================================================
  const updateQuantity = (itemId: string, newQty: number) => {
    // Allow 0 or greater - user can type any number
    setCartItems(prev => prev.map(ci =>
      ci.item.id === itemId ? { ...ci, quantity: Math.min(999999, Math.max(0, newQty)), source: 'manual' as const } : ci
    ));
  };

  const toggleSelection = (itemId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const removeSelectedItems = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      'Remove Selected',
      `Remove ${selectedIds.size} item(s) from order?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setCartItems(prev => prev.filter(ci => !selectedIds.has(ci.item.id)));
            setSelectedIds(new Set());
          }
        }
      ]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === cartItems.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all
      const allIds = new Set(cartItems.map(ci => ci.item.id));
      setSelectedIds(allIds);
    }
  };

  const incrementQuantity = (itemId: string) => {
    setCartItems(prev => prev.map(ci =>
      ci.item.id === itemId ? { ...ci, quantity: Math.min(999999, ci.quantity + 1), source: 'manual' as const } : ci
    ));
  };

  const decrementQuantity = (itemId: string) => {
    setCartItems(prev => prev.map(ci =>
      ci.item.id === itemId && ci.quantity > 1 ? { ...ci, quantity: ci.quantity - 1, source: 'manual' as const } : ci
    ));
  };

  const removeItem = (itemId: string) => {
    Alert.alert("Remove Item", "Remove this item from the order?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: 'destructive', onPress: () => {
          setCartItems(prev => prev.filter(ci => ci.item.id !== itemId));
          setSelectedIds(prev => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });
        }
      }
    ]);
  };

  const addItemToCart = (item: Item) => {
    if (cartItems.find(ci => ci.item.id === item.id)) return;
    setCartItems(prev => [...prev, { item, quantity: suggestedQuantity(item) ?? 1, source: 'manual' }]);
  };

  const totalItems = cartItems.length;
  const totalUnits = cartItems.reduce((sum, ci) => sum + ci.quantity, 0);

  // The only commitment entry point is this review screen's touch button.
  const generatePDF = () => {
    if (saveLock.current || saving) return;
    let session;
    try { session = captureSession(); } catch { return; }
    const reviewed = getDraft(session);
    if (!reviewed) return;
    const dialog = ++dialogEpoch.current;
    // Dialog callbacks belong to the account and draft displayed when opened.
    // A later login or edit must require a new touch review.
    const confirm = (includePhotos: boolean) => {
      try {
        assertSession(session);
        const current = getDraft(session);
        if (!mounted.current || AppState.currentState !== 'active' || dialog !== dialogEpoch.current || current?.revision !== reviewed.revision || current?.attempt !== reviewed.attempt) return;
      } catch { return; }
      void handleCreateAndExport(includePhotos);
    };
    const hasImages = cartItems.some(ci => ci.item.imageUri);
    Alert.alert(draft?.attempt?.saved ? 'Re-export saved order' : draft?.attempt ? 'Retry same submission' : 'Confirm order & export PDF',
      draft?.attempt?.saved ? 'This exports the same saved order. No new order will be created.' : draft?.attempt ? 'The server may already have saved this order. This retries the same request with its original submission ID.' : 'This saves an order. It does not increase stock or send anything to a supplier. Review your quantities before confirming.',
      [{ text: 'Cancel', style: 'cancel' }, { text: hasImages ? 'Confirm · table only' : 'Confirm', onPress: () => confirm(false) },
        ...(hasImages ? [{ text: 'Confirm · with photos', onPress: () => confirm(true) }] : [])]);
  };
  async function handleCreateAndExport(includePhotos: boolean) {
    if (saveLock.current || !mounted.current || AppState.currentState !== 'active') return;
    saveLock.current = true; setSaving(true);
    let session;
    try { session = captureSession(); } catch { saveLock.current = false; setSaving(false); return; }
    const abort = new AbortController(); preflight.current = abort;
    try {
      const current = getDraft(session);
      if (!current) throw new Error('Your draft is no longer available.');
      let order = current.attempt?.saved;
      if (!order) {
        if (!isOnline) throw new Error('Connect to the internet to confirm an order. Your draft is retained.');
        if (!current.attempt) {
          const backend = await capabilities(session, abort.signal);
          if (!backend.order_review_guard) throw new Error('This backend does not support reviewed-order checks yet. Deploy the matching backend before confirming this draft.');
          const snapshot = await inventorySnapshot(session, abort.signal, true);
          assertSession(session);
          if (snapshot.stale) throw new Error('A fresh inventory check is required before confirming.');
          const checked = recheckDraft(current.rows, snapshot.items);
          if (!mounted.current || abort.signal.aborted) return;
          if (getDraft(session)?.revision !== current.revision) throw new Error('The draft changed during review. Review it again.');
          if (checked.changes.length) {
            writeDraft(session, checked.rows);
            Alert.alert('Inventory changed — review again', checked.changes.join('\n') + '\nNo order has been saved. Your order quantities are unchanged.');
            return;
          }
        }
        assertSession(session);
        if (!mounted.current || abort.signal.aborted) return;
        const request = beginSubmission(session, current.rows);
        // Unknown outcomes retain this exact request/localId; a definitive 4xx
        // rejection can unlock editing. The existing hook's Retry also uses it.
        order = await createOrderMutation.mutateAsync(request);
        assertSession(session); markSaved(session, order);
      }
      if (!mounted.current || abort.signal.aborted) return;
      assertSession(session);
      const result = await exportOrderPdf({ id: order.orderId, items: order.items, createdAt: order.createdAt }, includePhotos, () => { assertSession(session); if (!mounted.current || abort.signal.aborted) throw new Error('Export cancelled. Re-export the saved order when you return.'); });
      if (!mounted.current || abort.signal.aborted) return;
      Alert.alert('Order saved', result.shared ? 'PDF generated and the share sheet opened. Stock is unchanged.' : 'PDF generated. Sharing is unavailable on this device. Stock is unchanged.');
      clearSavedDraft(session); safeBack();
    } catch (e) {
      try {
        assertSession(session);
        if (e instanceof ApiClientError && [400,401,403,404,409,422].includes(e.status)) releaseRejectedSubmission(session);
        const saved = getDraft(session)?.attempt?.saved;
        if (mounted.current && !abort.signal.aborted) Alert.alert(saved ? 'Order saved — PDF unavailable' : 'Order not confirmed', saved
          ? 'The same saved order is retained. Tap Re-export saved order, or use Recent Orders. No second order will be created.'
          : (e instanceof Error ? e.message : 'Please retry. Your draft and submission ID are retained.'));
      } catch { /* account changed; never show the previous account's details */ }
    } finally { saveLock.current = false; if (mounted.current) setSaving(false); }
  }

  // ============================================================================
  // RENDER CART ITEM - 2-Row Layout for full name visibility
  // ============================================================================
  const renderCartItem = ({ item: cartItem }: { item: CartItem }) => (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
      {/* TOP ROW: Full Name + Checkbox */}
      <View style={styles.cardTopRow}>
        <Text style={[styles.itemNameFull, { color: colors.textPrimary }]}>
          {cartItem.item.name}
        </Text>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => toggleSelection(cartItem.item.id)}
        >
          <Ionicons
            name={selectedIds.has(cartItem.item.id) ? 'checkbox' : 'square-outline'}
            size={24}
            color={selectedIds.has(cartItem.item.id) ? colors.accentBlue : colors.textTertiary}
          />
        </TouchableOpacity>
      </View>

      {/* BOTTOM ROW: Image, Meta, Quantity, Remove */}
      <View style={styles.cardBottomRow}>
        {/* Item Image */}
        {cartItem.item.imageUri ? (
          <Image source={{ uri: cartItem.item.imageUri }} style={styles.itemThumb} />
        ) : (
          <View style={[styles.itemThumbPlaceholder, { backgroundColor: colors.bgTertiary }]}>
            <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
          </View>
        )}

        {/* Brand/Supplier */}
        <View style={styles.cardMeta}>
          <Text style={[styles.itemMeta, { color: colors.textTertiary }]} numberOfLines={1}>
            {cartItem.item.brand || 'No brand'}
          </Text>
          <Text style={[styles.itemMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {cartItem.item.supplierName || 'Not recorded'}
          </Text>
          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
            Stock: {cartItem.item.quantity} {cartItem.item.unit} · {cartItem.source}
          </Text>
        </View>

        {/* Quantity Controls */}
        <View style={styles.qtyControls}>
          <TouchableOpacity
            style={[styles.qtyBtn, { backgroundColor: colors.bgTertiary }]}
            onPress={() => decrementQuantity(cartItem.item.id)}
          >
            <Ionicons name="remove" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <TextInput
            style={[styles.qtyInput, { color: colors.textPrimary, borderColor: colors.borderPrimary, backgroundColor: colors.bgTertiary }]}
            editable={!saving && !draft?.attempt}
            accessibilityLabel={`Order quantity for ${cartItem.item.name} in ${cartItem.item.unit}`}
            value={cartItem.quantity === 0 ? '' : cartItem.quantity.toString()}
            keyboardType="numeric"
            onChangeText={(text) => {
              if (text === '') {
                updateQuantity(cartItem.item.id, 0);
              } else {
                const num = parseInt(text.replace(/[^0-9]/g, ''));
                if (!isNaN(num)) {
                  updateQuantity(cartItem.item.id, num);
                }
              }
            }}
            onBlur={() => {
              if (cartItem.quantity === 0) {
                updateQuantity(cartItem.item.id, 1);
              }
            }}
            selectTextOnFocus
            textAlign="center"
          />

          <TouchableOpacity
            style={[styles.qtyBtn, { backgroundColor: colors.accentBlueBg }]}
            onPress={() => incrementQuantity(cartItem.item.id)}
          >
            <Ionicons name="add" size={16} color={colors.accentBlue} />
          </TouchableOpacity>
        </View>

        {/* Remove Button */}
        <TouchableOpacity style={styles.removeBtn} onPress={() => removeItem(cartItem.item.id)}>
          <Ionicons name="trash-outline" size={18} color="#A65D5D" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderPrimary }]}>
        <TouchableOpacity onPress={() => safeBack()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Create Order</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textTertiary }]}>
            {totalItems} items • {totalUnits} units
          </Text>
        </View>

        {/* Bulk Remove Button when items selected */}
        {selectedIds.size > 0 ? (
          <TouchableOpacity onPress={removeSelectedItems} style={[styles.bulkRemoveBtn, { backgroundColor: '#A65D5D20' }]}>
            <Ionicons name="trash" size={18} color="#A65D5D" />
            <Text style={{ color: '#A65D5D', fontWeight: '600', marginLeft: 4 }}>{selectedIds.size}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.iconBtn}>
            <Ionicons name="add-circle" size={28} color={colors.accentBlue} />
          </TouchableOpacity>
        )}
      </View>

      {/* Select All Toggle Bar */}
      {cartItems.length > 0 && (
        <View style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingHorizontal: 16,
          paddingBottom: 8,
          marginBottom: 4
        }}>
          <TouchableOpacity
            onPress={toggleSelectAll}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Ionicons
              name={selectedIds.size === cartItems.length ? "checkbox" : "square-outline"}
              size={20}
              color={colors.accentBlue}
            />
            <Text style={{ marginLeft: 6, color: colors.accentBlue, fontWeight: '600' }}>
              {selectedIds.size === cartItems.length ? "Deselect All" : "Select All"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CART LIST */}
      <FlatList
        data={cartItems}
        keyExtractor={ci => ci.item.id}
        renderItem={renderCartItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No items in order</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
              Tap the + button to add items
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.accentBlue }]}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>+ Add Items</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* FOOTER */}
      <View style={[styles.footer, { backgroundColor: colors.bgCard, borderTopColor: colors.borderPrimary }]}>
        <TouchableOpacity style={styles.cancelLink} onPress={() => safeBack()}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.md }}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: colors.accentBlue, opacity: totalItems === 0 ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={draft?.attempt?.saved ? 'Re-export saved order' : draft?.attempt ? 'Retry same submission' : 'Confirm order & export PDF'}
          onPress={generatePDF}
          disabled={totalItems === 0 || saving || !isInitialized}
        >
          <Ionicons name="cart-outline" size={18} color="white" />
          <Text style={styles.exportText}>{saving ? 'Checking / saving…' : draft?.attempt?.saved ? 'Re-export saved order' : draft?.attempt ? 'Retry same submission' : 'Confirm order & export PDF'}</Text>
        </TouchableOpacity>
      </View>

      {/* ADD ITEM MODAL */}
      <AddItemModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        items={items.filter(item => item.isActive)}
        currentCartIds={new Set(cartItems.map(ci => ci.item.id))}
        onAdd={addItemToCart}
      />
    </SafeAreaView>
  );
}

// ============================================================================
// ADD ITEM MODAL
// ============================================================================
function AddItemModal({
  visible,
  onClose,
  items,
  currentCartIds,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  items: Item[];
  currentCartIds: Set<string>;
  onAdd: (item: Item) => void;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');

  const availableItems = items.filter(item => {
    if (currentCartIds.has(item.id)) return false;
    if (search.trim()) {
      return item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.brand?.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.bgPrimary }]}>
        {/* Modal Header */}
        <View style={[styles.modalHeader, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderPrimary }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: colors.accentBlue, fontSize: fontSize.md }}>Done</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add Items</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* Search */}
        <View style={[styles.searchContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search items..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Items List */}
        <FlatList
          data={availableItems}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.modalItem, { borderBottomColor: colors.borderPrimary }]}
              onPress={() => {
                onAdd(item);
                onClose();
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalItemName, { color: colors.textPrimary }]}>{item.name}</Text>
                <Text style={[styles.modalItemMeta, { color: colors.textTertiary }]}>
                  {item.quantity} {item.unit} • {item.brand || 'No brand'}
                </Text>
              </View>
              <Ionicons name="add-circle" size={28} color={colors.accentBlue} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyModal}>
              <Text style={{ color: colors.textTertiary }}>No items available</Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  headerSubtitle: { fontSize: fontSize.sm, marginTop: 2 },

  listContent: { padding: spacing.md, paddingBottom: 120 },
  card: {
    flexDirection: 'column',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  itemThumb: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.md,
  },
  itemThumbPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: { flex: 1 },
  itemName: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  itemMeta: { fontSize: fontSize.sm, marginTop: 2 },

  // 2-Row Layout Styles
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  itemNameFull: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    lineHeight: 22,
    marginRight: spacing.sm,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardMeta: {
    flex: 1,
  },

  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyInput: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    paddingVertical: 0,
  },
  removeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bulkRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginTop: spacing.md },
  emptySubtitle: { fontSize: fontSize.md, marginTop: spacing.xs },
  emptyBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  cancelLink: { padding: spacing.sm },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  exportText: { color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.md },

  // Modal Styles
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: fontSize.md },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalItemName: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  modalItemMeta: { fontSize: fontSize.sm, marginTop: 2 },
  emptyModal: { padding: spacing.xxl, alignItems: 'center' },
});
