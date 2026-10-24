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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import type { Item } from '@/types';
import { isOutOfStock, isLowStock, isCriticalEquipment } from '@/types';
import { exportOrderPdf, type OrderPdfStage } from '@/utils/orderPdfExport';
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

type SaveStage = 'checking_backend' | 'checking_stock' | 'saving_order' | 'preparing' | 'rendering' | 'sharing';
const progressCopy: Record<SaveStage, { title: string; detail: string }> = {
  checking_backend: { title: 'Connecting to the server', detail: 'Checking that reviewed orders are supported. Your draft is retained.' },
  checking_stock: { title: 'Checking current stock', detail: 'Refreshing inventory before saving. Your order quantities will not change.' },
  saving_order: { title: 'Saving your order', detail: 'Waiting for the server confirmation. A slow connection can take up to 90 seconds; retry will use this same submission.' },
  preparing: { title: 'Order saved · preparing PDF', detail: 'Preparing the document. Your saved order is available in Recent Orders.' },
  rendering: { title: 'Order saved · creating PDF', detail: 'Generating the document on this phone. A PDF failure will not save a second order.' },
  sharing: { title: 'Order saved · share PDF', detail: 'Finish or dismiss the share sheet to continue. You can leave this screen and re-export from Recent Orders.' },
};

export default function CreateOrderScreen() {
  const { colors } = useTheme();
  const { mode } = useLocalSearchParams();
  const router = useRouter();
  const owner = useAuthStore(s => s.isAuthenticated ? s.user?.id : undefined);
  const { isOnline } = useNetworkStatus();

  const { data: items = [], isSuccess, isFetching } = useItems();
  const createOrderMutation = useCreateOrder({ feedback: 'screen' });

  const draft = useOrderDraft();
  const cartItems = draft && draft.session.owner === owner ? draft.rows : [];
  const isInitialized = !!draft?.initialized && draft.session.owner === owner;
  const setCartItems = (update: (rows: CartItem[]) => CartItem[]) => {
    if (saveLock.current) return;
    try { changeDraft(update); } catch (e) { Alert.alert('Draft locked', e instanceof Error ? e.message : 'Review this submission first.'); }
  };
  const [saveStage, setSaveStage] = useState<SaveStage | null>(null);
  const saving = saveStage !== null;
  const draftLocked = saving || !!draft?.attempt;
  const saveLock = useRef(false);
  const dialogEpoch = useRef(0);
  const mounted = useRef(true);
  const preflight = useRef<AbortController | null>(null);
  const emergencyPrompted = useRef(false);
  const leavingSavedOrder = useRef(false);
  const [orderNotice, setOrderNotice] = useState<string>();
  useEffect(() => {
    mounted.current = true;
    emergencyPrompted.current = false;
    leavingSavedOrder.current = false;
    setOrderNotice(undefined);
    const lifecycle = AppState.addEventListener('change', state => {
      if (state !== 'active') { dialogEpoch.current++; preflight.current?.abort(); }
    });
    return () => { mounted.current = false; preflight.current?.abort(); lifecycle.remove(); };
  }, [owner]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(draft && draft.session.owner === owner ? draft.rows.map(row => row.item.id) : []);
    setSelectedIds(previous => [...previous].every(id => ids.has(id)) ? previous : new Set([...previous].filter(id => ids.has(id))));
  }, [draft, owner]);

  // Initialize Cart based on mode
  // Emergency Order: exactly the dashboard's active critical items with stock <= 1.
  // Regular Order: out of stock + emergency backup items + low stock (critical first)
  useEffect(() => {
    if (leavingSavedOrder.current || !isSuccess || isFetching || !owner) return;
    if (isInitialized && (mode !== 'emergency' || emergencyPrompted.current)) return;
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
      // Keep the card's count and its review action scoped to the same equipment.
      activeItems
        .filter((item) => isCriticalEquipment(item) && item.quantity <= 1)
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

    if (mode === 'emergency') {
      emergencyPrompted.current = true;
      const existing = getDraft(session);
      const note = 'Critical equipment with one or no units in stock. Review each order quantity before saving.';
      if (isInitialized && existing) {
        const dialog = ++dialogEpoch.current;
        const choose = (choice: 'keep' | 'replace' | 'merge') => {
          try {
            assertSession(session);
            const current = getDraft(session);
            if (!mounted.current || AppState.currentState !== 'active' || dialog !== dialogEpoch.current || current?.revision !== existing.revision || current?.attempt !== existing.attempt) return;
            if (choice === 'keep') { setOrderNotice(current.attempt ? 'Your previous submission is retained. Finish or check it before starting an emergency order.' : 'Your current draft is retained. Emergency items have not replaced it.'); return; }
            if (current.attempt) return;
            if (choice === 'replace') writeDraft(session, initialCart);
            else {
              const present = new Set(current.rows.map(row => row.item.id));
              writeDraft(session, [...current.rows, ...initialCart.filter(row => !present.has(row.item.id))], true, current.origin);
            }
            setOrderNotice(choice === 'merge' ? 'Missing emergency items were added. Existing order quantities were kept.' : note);
          } catch { /* stale dialogs never replace another account or edited draft */ }
        };
        if (existing.attempt) {
          setOrderNotice('Your previous submission is retained. Retry it or re-export the saved order before starting an emergency order.');
          Alert.alert('Existing submission retained', 'This order may already be saved. Emergency items cannot replace a submitted order.', [{ text: 'Keep current order', onPress: () => choose('keep') }]);
        } else {
          Alert.alert('Emergency order · existing draft', `You already have ${existing.rows.length} draft items. Keep them, replace them with the ${initialCart.length} emergency items, or add only missing emergency items. No order is saved by this choice.`, [
            { text: 'Keep current draft', style: 'cancel', onPress: () => choose('keep') },
            { text: 'Replace draft', style: 'destructive', onPress: () => choose('replace') },
            { text: 'Add missing items', onPress: () => choose('merge') },
          ]);
        }
        return;
      }
      setOrderNotice(note);
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

  // A confirmed order need not hold the cart hostage to a native PDF/share UI.
  // This touch-only action retires only a SAVED local draft; unknown outcomes stay locked.
  const finishSavedOrder = () => {
    try {
      if (!mounted.current || AppState.currentState !== 'active' || !draft?.attempt?.saved) return;
      // Bind this touch to the exact account/epoch and saved draft it displayed.
      const session = draft.session;
      assertSession(session);
      if (getDraft(session) !== draft) return;
      leavingSavedOrder.current = true;
      dialogEpoch.current++;
      preflight.current?.abort();
      clearSavedDraft(session);
      router.replace('/(tabs)/orders');
    } catch { /* a stale account/lifecycle callback cannot retire another draft */ }
  };

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
    saveLock.current = true; setSaveStage('checking_backend');
    let session;
    try { session = captureSession(); } catch { saveLock.current = false; setSaveStage(null); return; }
    const abort = new AbortController(); preflight.current = abort;
    let firstRequest: ReturnType<typeof beginSubmission> | undefined;
    let submissionRequest: ReturnType<typeof beginSubmission> | undefined;
    try {
      const current = getDraft(session);
      if (!current) throw new Error('Your draft is no longer available.');
      submissionRequest = current.attempt?.request;
      let order = current.attempt?.saved;
      if (!order) {
        if (!isOnline) throw new Error('Connect to the internet to confirm an order. Your draft is retained.');
        if (!current.attempt) {
          setSaveStage('checking_backend');
          const backend = await capabilities(session, abort.signal);
          if (!backend.order_review_guard) throw new Error('This backend does not support reviewed-order checks yet. Deploy the matching backend before confirming this draft.');
          setSaveStage('checking_stock');
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
        const alreadySubmitted = !!getDraft(session)?.attempt;
        const request = beginSubmission(session, current.rows);
        submissionRequest = request;
        if (!alreadySubmitted) firstRequest = request;
        // A retry's rejection cannot prove an earlier unknown request never
        // committed. Only this exact first request can unlock on a definitive 4xx.
        setSaveStage('saving_order');
        order = await createOrderMutation.mutateAsync(request);
        assertSession(session);
        // Another screen may have completed this attempt and started a new
        // cart while this response was in flight. Retain a late result only
        // for its exact original request, never the current unrelated draft.
        if (getDraft(session)?.attempt?.request !== request) return;
        markSaved(session, order);
      }
      if (!mounted.current || abort.signal.aborted) return;
      const confirmedOrder = order;
      const requestForExport = submissionRequest;
      const assertExportReady = () => {
        assertSession(session);
        const attempt = getDraft(session)?.attempt;
        if (!mounted.current || abort.signal.aborted || !requestForExport || attempt?.request !== requestForExport || attempt.saved?.id !== confirmedOrder.id) throw new Error('Export cancelled. Re-export the saved order from Recent Orders.');
      };
      assertExportReady();
      const result = await exportOrderPdf({ id: confirmedOrder.orderId, items: confirmedOrder.items, createdAt: confirmedOrder.createdAt }, includePhotos, assertExportReady, {
        signal: abort.signal,
        onStage: (stage: OrderPdfStage) => { try { assertExportReady(); setSaveStage(stage); } catch { /* an old export cannot update a new draft's progress */ } },
      });
      assertExportReady();
      Alert.alert('Order saved', result.shared ? 'PDF generated and the share sheet opened. Stock is unchanged.' : 'PDF generated. Sharing is unavailable on this device. Stock is unchanged.');
      assertExportReady();
      clearSavedDraft(session); safeBack();
    } catch (e) {
      try {
        assertSession(session);
        if (submissionRequest && getDraft(session)?.attempt?.request !== submissionRequest) return;
        if (mounted.current && AppState.currentState === 'active' && !abort.signal.aborted && firstRequest && getDraft(session)?.attempt?.request === firstRequest && e instanceof ApiClientError && [400,401,403,404,409,422].includes(e.status)) releaseRejectedSubmission(session);
        const saved = getDraft(session)?.attempt?.saved;
        const unknown = !saved && !!getDraft(session)?.attempt;
        if (mounted.current && !abort.signal.aborted) Alert.alert(saved ? 'Order saved — PDF unavailable' : unknown ? 'Save status unknown' : 'Order not confirmed', saved
          ? `${e instanceof Error ? e.message + '\n' : ''}The same saved order is retained. Tap Re-export saved order, or use Recent Orders. No second order will be created.`
          : `${e instanceof Error ? e.message : 'Please retry.'}${unknown ? '\nThe server may have saved this order. Check Recent Orders, or retry the same submission to check or finish it. Your original submission ID is retained.' : '\nYour draft is retained.'}`);
      } catch { /* account changed; never show the previous account's details */ }
    } finally { if (preflight.current === abort) preflight.current = null; saveLock.current = false; if (mounted.current) setSaveStage(null); }
  }

  // Keep item facts and editable quantities on separate full-width rows.
  // A long unit or supplier name must never squeeze the stock into a narrow column.
  const renderCartItem = ({ item: cartItem }: { item: CartItem }) => {
    const source = cartItem.source === 'spoken' ? 'From your request' : cartItem.source === 'suggested' ? 'Suggested' : 'Edited by you';
    const stockColor = isOutOfStock(cartItem.item) ? colors.statusRed : isLowStock(cartItem.item) ? colors.statusOrange : colors.textPrimary;
    const details = [cartItem.item.brand, cartItem.item.supplierName].filter(Boolean).join(' · ');
    return (
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
        <View style={styles.cardTopRow}>
          {cartItem.item.imageUri ? (
            <Image source={{ uri: cartItem.item.imageUri }} style={styles.itemThumb} />
          ) : (
            <View style={[styles.itemThumbPlaceholder, { backgroundColor: colors.accentBlueBg }]}>
              <Ionicons name="cube-outline" size={22} color={colors.accentBlue} />
            </View>
          )}
          <View style={styles.cardIdentity}>
            <Text style={[styles.itemNameFull, { color: colors.textPrimary }]}>{cartItem.item.name}</Text>
            {!!details && <Text style={[styles.itemMeta, { color: colors.textTertiary }]}>{details}</Text>}
          </View>
          <TouchableOpacity style={styles.checkbox} accessibilityRole="checkbox" accessibilityState={{ checked: selectedIds.has(cartItem.item.id), disabled: draftLocked }} accessibilityLabel={`Select ${cartItem.item.name}`} disabled={draftLocked} onPress={() => toggleSelection(cartItem.item.id)}>
            <Ionicons name={selectedIds.has(cartItem.item.id) ? 'checkbox' : 'square-outline'} size={24} color={selectedIds.has(cartItem.item.id) ? colors.accentBlue : colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.stockFacts, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.stockFact}>
            <Text style={[styles.factLabel, { color: colors.textTertiary }]}>CURRENT STOCK</Text>
            <Text style={[styles.factValue, { color: stockColor }]}>{cartItem.item.quantity} {cartItem.item.unit}</Text>
          </View>
          <View style={styles.stockFact}>
            <Text style={[styles.factLabel, { color: colors.textTertiary }]}>MINIMUM STOCK</Text>
            <Text style={[styles.factValue, { color: colors.textSecondary }]}>{cartItem.item.minimumStock} {cartItem.item.unit}</Text>
          </View>
        </View>

        <View style={styles.quantityHeading}>
          <Text style={[styles.quantityLabel, { color: colors.textSecondary }]}>Order quantity · {cartItem.item.unit}</Text>
          <View style={[styles.sourceBadge, { backgroundColor: colors.accentBlueBg }]}>
            <Text style={[styles.sourceText, { color: colors.accentBlue }]}>{source}</Text>
          </View>
        </View>
        <View style={styles.quantityActions}>
          <TouchableOpacity style={[styles.removeBtn, { backgroundColor: colors.statusRedBg, opacity: draftLocked ? 0.4 : 1 }]} accessibilityRole="button" accessibilityLabel={`Remove ${cartItem.item.name} from order`} disabled={draftLocked} onPress={() => removeItem(cartItem.item.id)}>
            <Ionicons name="trash-outline" size={19} color={colors.statusRed} />
          </TouchableOpacity>
          <View style={styles.qtyControls}>
            <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: colors.bgTertiary, opacity: draftLocked || cartItem.quantity <= 1 ? 0.4 : 1 }]} accessibilityRole="button" accessibilityLabel={`Decrease order quantity for ${cartItem.item.name}`} disabled={draftLocked || cartItem.quantity <= 1} onPress={() => decrementQuantity(cartItem.item.id)}>
              <Ionicons name="remove" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TextInput
              style={[styles.qtyInput, { color: colors.textPrimary, borderColor: colors.borderPrimary, backgroundColor: colors.bgSecondary }]}
              editable={!draftLocked}
              accessibilityLabel={`Order quantity for ${cartItem.item.name} in ${cartItem.item.unit}`}
              value={cartItem.quantity === 0 ? '' : cartItem.quantity.toString()}
              keyboardType="number-pad"
              maxLength={6}
              maxFontSizeMultiplier={1.4}
              onChangeText={(text) => {
                if (text === '') updateQuantity(cartItem.item.id, 0);
                else {
                  const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
                  if (!isNaN(num)) updateQuantity(cartItem.item.id, num);
                }
              }}
              onBlur={() => { if (cartItem.quantity === 0) updateQuantity(cartItem.item.id, 1); }}
              selectTextOnFocus textAlign="center"
            />
            <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: colors.accentBlueBg, opacity: draftLocked || cartItem.quantity >= 999999 ? 0.4 : 1 }]} accessibilityRole="button" accessibilityLabel={`Increase order quantity for ${cartItem.item.name}`} disabled={draftLocked || cartItem.quantity >= 999999} onPress={() => incrementQuantity(cartItem.item.id)}>
              <Ionicons name="add" size={20} color={colors.accentBlue} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top', 'bottom']}>
      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderPrimary }]}>
        <TouchableOpacity onPress={() => safeBack()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{draft?.attempt?.saved ? 'Saved order' : draft?.attempt ? 'Review submission' : 'Create Order'}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textTertiary }]}>
            {draft?.attempt?.saved ? `${draft.attempt.saved.orderId} · ` : ''}{totalItems} items • {totalUnits} units
          </Text>
        </View>

        {/* Bulk Remove Button when items selected */}
        {selectedIds.size > 0 ? (
          <TouchableOpacity disabled={draftLocked} onPress={removeSelectedItems} style={[styles.bulkRemoveBtn, { backgroundColor: '#A65D5D20' }]}>
            <Ionicons name="trash" size={18} color="#A65D5D" />
            <Text style={{ color: '#A65D5D', fontWeight: '600', marginLeft: 4 }}>{selectedIds.size}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity disabled={draftLocked} accessibilityLabel="Add items to order" onPress={() => setShowAddModal(true)} style={[styles.iconBtn, { opacity: draftLocked ? 0.4 : 1 }]}>
            <Ionicons name="add-circle" size={28} color={colors.accentBlue} />
          </TouchableOpacity>
        )}
      </View>

      {!!orderNotice && <View style={[styles.orderNotice, { backgroundColor: colors.accentBlueBg }]}><Ionicons name="information-circle-outline" size={19} color={colors.accentBlue} /><Text style={[styles.noticeText, { color: colors.textSecondary }]}>{orderNotice}</Text></View>}

      {/* Select All Toggle Bar */}
      {cartItems.length > 0 && (
        <View style={styles.selectionBar}>
          <Text style={[styles.selectionHint, { color: colors.textTertiary }]}>Review each quantity</Text>
          <TouchableOpacity disabled={draftLocked} accessibilityRole="button" accessibilityLabel={selectedIds.size === cartItems.length ? 'Deselect all order items' : 'Select all order items'} onPress={toggleSelectAll} style={styles.selectAll}>
            <Ionicons name={selectedIds.size === cartItems.length ? 'checkbox' : 'square-outline'} size={20} color={colors.accentBlue} />
            <Text style={{ color: colors.accentBlue, fontWeight: '600' }}>{selectedIds.size === cartItems.length ? 'Deselect all' : 'Select all'}</Text>
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

      {/* The footer separates saving from native PDF and interactive sharing. */}
      <View style={[styles.footer, { backgroundColor: colors.bgCard, borderTopColor: colors.borderPrimary }]}>
        {(saveStage || draft?.attempt) && (
          <View accessibilityLiveRegion="polite" style={[styles.progressCard, { backgroundColor: draft?.attempt?.saved ? colors.statusGreenBg : colors.accentBlueBg }]}>
            {saving ? <ActivityIndicator size="small" color={colors.accentBlue} /> : <Ionicons name={draft?.attempt?.saved ? 'checkmark-circle-outline' : 'time-outline'} size={22} color={draft?.attempt?.saved ? colors.statusGreen : colors.accentBlue} />}
            <View style={styles.progressBody}>
              <Text style={[styles.progressTitle, { color: colors.textPrimary }]}>{saveStage ? progressCopy[saveStage].title : draft?.attempt?.saved ? 'Order saved' : 'Submission retained'}</Text>
              <Text style={[styles.progressDetail, { color: colors.textSecondary }]}>{saveStage ? progressCopy[saveStage].detail : draft?.attempt?.saved ? 'Re-export, or tap Done to return to Orders and export later. Stock is unchanged.' : 'The outcome is unknown. Check Recent Orders, or retry using the original submission ID.'}</Text>
            </View>
          </View>
        )}
        <View style={styles.footerActions}>
          <TouchableOpacity style={styles.cancelLink} accessibilityRole="button" accessibilityLabel={draft?.attempt?.saved ? 'Done — view saved orders' : 'Leave order review'} onPress={draft?.attempt?.saved ? finishSavedOrder : () => safeBack()}>
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.md }}>{draft?.attempt?.saved ? 'Done' : saving ? 'Leave' : draft?.attempt ? 'Back' : 'Cancel'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: colors.accentBlue, opacity: totalItems === 0 || saving ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={draft?.attempt?.saved ? 'Re-export saved order' : draft?.attempt ? 'Retry same submission' : 'Confirm order & export PDF'}
            accessibilityState={{ disabled: totalItems === 0 || saving || !isInitialized, busy: saving }}
            onPress={generatePDF}
            disabled={totalItems === 0 || saving || !isInitialized}
          >
            {!saving && <Ionicons name={draft?.attempt?.saved ? 'document-text-outline' : 'cart-outline'} size={19} color="white" />}
            <Text style={styles.exportText}>{saveStage ? saveStage === 'checking_backend' ? 'Connecting…' : saveStage === 'checking_stock' ? 'Checking stock…' : saveStage === 'saving_order' ? 'Saving order…' : saveStage === 'sharing' ? 'Sharing PDF…' : 'Creating PDF…' : draft?.attempt?.saved ? 'Re-export saved order' : draft?.attempt ? 'Retry same submission' : 'Confirm & export PDF'}</Text>
          </TouchableOpacity>
        </View>
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
  headerSubtitle: { fontSize: fontSize.sm, marginTop: 2, textAlign: 'center' },

  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  card: { padding: spacing.lg, borderRadius: borderRadius.xl, borderWidth: 1, marginBottom: spacing.md },
  itemThumb: { width: 44, height: 44, borderRadius: borderRadius.md },
  itemThumbPlaceholder: { width: 44, height: 44, borderRadius: borderRadius.md, justifyContent: 'center', alignItems: 'center' },
  itemMeta: { fontSize: fontSize.sm, lineHeight: 18, marginTop: spacing.xs },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  cardIdentity: { flex: 1, minWidth: 0, paddingTop: 2 },
  itemNameFull: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, lineHeight: 23 },
  stockFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, padding: spacing.md, borderRadius: borderRadius.md },
  stockFact: { flex: 1, minWidth: 100 },
  factLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.7, marginBottom: spacing.xs },
  factValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, lineHeight: 21 },
  quantityHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  quantityLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, flexShrink: 1 },
  sourceBadge: { borderRadius: borderRadius.full, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  sourceText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  quantityActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn: { width: 44, height: 44, borderRadius: borderRadius.md, justifyContent: 'center', alignItems: 'center' },
  qtyInput: { width: 84, minHeight: 48, borderWidth: 1, borderRadius: borderRadius.md, fontSize: fontSize.lg, fontWeight: fontWeight.bold, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  removeBtn: { width: 44, height: 44, borderRadius: borderRadius.md, justifyContent: 'center', alignItems: 'center' },
  checkbox: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginRight: -spacing.sm },
  bulkRemoveBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md },
  selectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  selectionHint: { fontSize: fontSize.sm },
  orderNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.md },
  noticeText: { flex: 1, minWidth: 0, fontSize: fontSize.sm, lineHeight: 19 },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },

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

  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, gap: spacing.md },
  progressCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: borderRadius.md },
  progressBody: { flex: 1, minWidth: 0 },
  progressTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, lineHeight: 19 },
  progressDetail: { fontSize: fontSize.sm, lineHeight: 18, marginTop: 2 },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cancelLink: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  exportBtn: { flex: 1, minWidth: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: borderRadius.lg },
  exportText: { flexShrink: 1, textAlign: 'center', color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.md },

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
