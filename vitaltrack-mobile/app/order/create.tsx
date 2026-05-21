/**
 * VitalTrack Mobile - Create Order Screen
 * Professional Cart Design with +/- Quantity Controls and Enhanced PDF Export
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  FlatList,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { readAsStringAsync } from 'expo-file-system/legacy';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import type { Item } from '@/types';
import { isOutOfStock, isLowStock, isCriticalEquipment } from '@/types';
import { formatDate, now } from '@/utils/helpers';
import { escapeHtml, validateImageUri } from '@/utils/sanitize';
import { useItems } from '@/hooks/useServerData';
import { useCreateOrder } from '@/hooks/useServerMutations';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { safeBack } from '@/utils/navigation';
import { toast } from '@/utils/toast';

interface CartItem {
  item: Item;
  quantity: number;
}

export default function CreateOrderScreen() {
  const { colors } = useTheme();
  const { mode } = useLocalSearchParams();
  const { isOnline } = useNetworkStatus();

  const { data: items = [] } = useItems();
  const createOrderMutation = useCreateOrder();

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Initialize Cart based on mode
  // Emergency Order: critical items with stock <= 1 + all out of stock (critical first)
  // Regular Order: out of stock + emergency backup items + low stock (critical first)
  useEffect(() => {
    if (isInitialized) return;

    const initialCart: CartItem[] = [];
    const addedIds = new Set<string>();

    // Helper to add item to cart
    const addToCart = (item: Item) => {
      if (addedIds.has(item.id)) return;
      addedIds.add(item.id);
      const qty = Math.max(item.minimumStock - item.quantity, 1);
      initialCart.push({ item, quantity: qty });
    };

    if (mode === 'emergency') {
      // Emergency Order: Critical items with exactly 1 stock first, then all out of stock
      items
        .filter((item) => isCriticalEquipment(item) && item.quantity === 1)
        .forEach(addToCart);
      items
        .filter((item) => isOutOfStock(item))
        .forEach(addToCart);
    } else {
      // Regular Order: Out of stock first (critical at top)
      items
        .filter((item) => isOutOfStock(item))
        .sort((a, b) => Number(isCriticalEquipment(b)) - Number(isCriticalEquipment(a)))
        .forEach(addToCart);

      // Then emergency backup items (critical with stock <= 1)
      items
        .filter((item) => isCriticalEquipment(item) && item.quantity === 1)
        .forEach(addToCart);

      // Then low stock items (critical at top)
      items
        .filter((item) => isLowStock(item))
        .sort((a, b) => Number(isCriticalEquipment(b)) - Number(isCriticalEquipment(a)))
        .forEach(addToCart);
    }

    setCartItems(initialCart);
    setIsInitialized(true);
  }, [items, mode, isInitialized]);

  // ============================================================================
  // QUANTITY CONTROLS
  // ============================================================================
  const updateQuantity = (itemId: string, newQty: number) => {
    // Allow 0 or greater - user can type any number
    setCartItems(prev => prev.map(ci =>
      ci.item.id === itemId ? { ...ci, quantity: Math.max(0, newQty) } : ci
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
      ci.item.id === itemId ? { ...ci, quantity: ci.quantity + 1 } : ci
    ));
  };

  const decrementQuantity = (itemId: string) => {
    setCartItems(prev => prev.map(ci =>
      ci.item.id === itemId && ci.quantity > 1 ? { ...ci, quantity: ci.quantity - 1 } : ci
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
    setCartItems(prev => [...prev, { item, quantity: Math.max(item.minimumStock - item.quantity, 1) }]);
  };

  const totalItems = cartItems.length;
  const totalUnits = cartItems.reduce((sum, ci) => sum + ci.quantity, 0);

  // ============================================================================
  // Helper: Convert local image URI to base64 data URL for PDF embedding
  // ============================================================================
  const getBase64Image = async (uri: string): Promise<string> => {
    try {
      // Validate URI for security
      const validUri = validateImageUri(uri);
      if (!validUri) return '';

      // Skip if already a data URI
      if (validUri.startsWith('data:')) return validUri;

      let fileUri = validUri;
      if (!validUri.startsWith('file://') && !validUri.startsWith('content://')) {
        fileUri = validUri.startsWith('/') ? `file://${validUri}` : validUri;
      }

      const base64 = await readAsStringAsync(fileUri, { encoding: 'base64' });

      // Detect image type from extension
      const ext = validUri.split('.').pop()?.toLowerCase() || 'jpeg';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.log('Image conversion failed:', error);
      return '';
    }
  };

  // ============================================================================
  // PDF GENERATION - Two Options: Table Layout & Card Layout with Images
  // ============================================================================

  // Ask user if they want photos, then export
  const generatePDF = () => {
    if (cartItems.length === 0) {
      Alert.alert('No Items', 'Add items to the order first.');
      return;
    }
    const hasImages = cartItems.some(ci => ci.item.imageUri);
    if (hasImages) {
      Alert.alert(
        'Export PDF',
        'Include product photos in the PDF?',
        [
          { text: 'Table Only', onPress: () => handleCreateAndExport(false) },
          { text: 'With Photos', onPress: () => handleCreateAndExport(true) },
        ]
      );
    } else {
      handleCreateAndExport(false);
    }
  };

  const handleCreateAndExport = (includePhotos: boolean) => {
    if (!isOnline) {
      Alert.alert('Offline', 'Connect to WiFi to create orders.');
      return;
    }
    if (cartItems.length === 0) {
      Alert.alert('No Items', 'Add items to the order first.');
      return;
    }

    const orderItems = cartItems.map(ci => ({
      itemId: ci.item.id,
      name: ci.item.name,
      quantity: ci.quantity,
      currentStock: ci.item.quantity,
      minimumStock: ci.item.minimumStock,
      unit: ci.item.unit,
      brand: ci.item.brand,
      imageUri: ci.item.imageUri,
      purchaseLink: ci.item.purchaseLink,
      supplierName: ci.item.supplierName,
    }));

    // Order save feedback (toast / MutationResultDialog) is dispatched
    // HOOK-LEVEL inside useCreateOrder. See the matching commit on
    // app/item/[id].tsx for the full root-cause writeup — short version:
    // hook-level dispatch survives observer death AND suppresses the
    // duplicate global toast.
    //
    // PDF generation stays here because it requires the server-assigned
    // orderId from the response and uses the screen's cartItems closure.
    // We use mutateAsync().then() so the PDF fires when the order resolves,
    // independent of observer lifecycle. PDF success is silent (the order
    // dialog already covers that); PDF failure surfaces as a separate
    // toast pointing at the manual re-export path.
    createOrderMutation
      .mutateAsync({ items: orderItems })
      .then(async (createdOrder: any) => {
        const serverOrderId =
          createdOrder.orderId ||
          createdOrder.order_id ||
          createdOrder.id ||
          'ORD-UNKNOWN';
        try {
          await generateTablePDF(includePhotos, serverOrderId);
        } catch {
          toast.error('PDF export failed', {
            description: `Order ${serverOrderId} saved — re-export from Recent Orders`,
          });
        }
      })
      .catch(() => {
        // Order save itself failed — the hook-level onError already
        // dispatched the failure dialog. Nothing more to do here.
      });
    safeBack();
  };

  // Combined Table + optional Photo Reference PDF
  const generateTablePDF = async (includePhotos: boolean, orderId: string) => {
    try {
      const currentDate = formatDate(now());

      // Only process images if user wants photos
      const itemsWithImages = includePhotos
        ? await Promise.all(
            cartItems.map(async (ci) => ({
              ...ci,
              imageBase64: ci.item.imageUri ? await getBase64Image(ci.item.imageUri) : '',
            }))
          )
        : cartItems.map(ci => ({ ...ci, imageBase64: '' }));

      const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', -apple-system, sans-serif;
            padding: 28px;
            color: #2d3748;
            background: #fff;
            font-size: 15px;
            line-height: 1.5;
        }
        .header {
            text-align: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 3px solid #1e3a5f;
        }
        h1 { font-size: 28px; color: #1e3a5f; font-weight: 700; margin-bottom: 6px; }
        .order-id { font-size: 16px; color: #718096; }
        .meta { color: #a0aec0; font-size: 14px; }

        .summary-bar {
            display: flex;
            justify-content: center;
            gap: 40px;
            background: linear-gradient(135deg, #1e3a5f 0%, #2d5a7b 100%);
            color: white;
            padding: 16px 28px;
            border-radius: 10px;
            margin-bottom: 24px;
        }
        .summary-item { text-align: center; }
        .summary-value { font-size: 26px; font-weight: 700; }
        .summary-label { font-size: 11px; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.03em; }

        .section-title {
            font-size: 16px;
            font-weight: 700;
            color: #1e3a5f;
            margin: 20px 0 12px;
            padding-bottom: 6px;
            border-bottom: 1px solid #e2e8f0;
        }

        table { width: 100%; border-collapse: collapse; }
        th {
            background: #1e3a5f;
            color: #fff;
            padding: 12px 10px;
            text-align: left;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }
        th:first-child { width: 35px; text-align: center; }
        th.col-qty { text-align: center; width: 90px; }
        th.col-link { text-align: center; width: 50px; }
        td {
            padding: 12px 10px;
            border-bottom: 1px solid #edf2f7;
            font-size: 14px;
            vertical-align: middle;
            color: #4a5568;
        }
        tr:nth-child(even) { background: #fafbfc; }
        td:first-child { text-align: center; color: #a0aec0; font-size: 12px; }
        .item-name { font-weight: 600; color: #2d3748; font-size: 16px; }
        .qty { font-weight: 700; text-align: center; color: #1e3a5f; font-size: 15px; }
        .dim { color: #c0c8d0; font-style: italic; font-size: 13px; }
        .link-btn { color: #1e3a5f; text-decoration: none; font-size: 13px; font-weight: 600; }

        .footer {
            margin-top: 28px;
            text-align: center;
            font-size: 11px;
            color: #a0aec0;
            padding-top: 14px;
            border-top: 1px solid #edf2f7;
        }
        .footer b { color: #1e3a5f; }

        .img-section { page-break-before: always; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🛒 Purchase Order</h1>
        <div class="order-id">Order #${orderId}</div>
        <div class="meta">${currentDate}</div>
    </div>

    <div class="summary-bar">
        <div class="summary-item">
            <div class="summary-value">${totalItems}</div>
            <div class="summary-label">Items to Order</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${totalUnits}</div>
            <div class="summary-label">Total Units</div>
        </div>
    </div>

    <div class="section-title">📋 Order Summary</div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Item Name</th>
                <th>Brand</th>
                <th class="col-qty">Qty</th>
                <th>Supplier</th>
                <th class="col-link">Link</th>
            </tr>
        </thead>
        <tbody>
            ${cartItems.map((ci, idx) => `
                <tr>
                    <td>${idx + 1}</td>
                    <td><span class="item-name">${escapeHtml(ci.item.name)}</span></td>
                    <td>${escapeHtml(ci.item.brand) || '<span class="dim">—</span>'}</td>
                    <td class="qty">${ci.quantity} ${escapeHtml(ci.item.unit)}</td>
                    <td>${escapeHtml(ci.item.supplierName) || '<span class="dim">—</span>'}</td>
                    <td style="text-align:center">${ci.item.purchaseLink ? '<a href="' + encodeURI(ci.item.purchaseLink) + '" class="link-btn">🔗</a>' : '<span class="dim">—</span>'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="footer">Generated by <b>CareKosh</b> • Home ICU Inventory Management</div>

    ${itemsWithImages.filter(ci => ci.imageBase64).length > 0 ? `
    <div class="img-section">
        <div class="section-title">📸 Product Photos</div>
        <p style="color: #a0aec0; font-size: 12px; margin-bottom: 20px;">
            ${itemsWithImages.filter(ci => ci.imageBase64).length} items with photos
        </p>
        ${itemsWithImages.filter(ci => ci.imageBase64).map((ci, idx) => `
            <div style="page-break-inside: avoid; text-align: center; margin-bottom: 44px; padding: 16px;">
                <div style="margin-bottom: 6px;">
                    <span style="color: #a0aec0; font-size: 14px;">${idx + 1}.</span>
                    <span style="color: #1e3a5f; font-size: 22px; font-weight: 700;">${escapeHtml(ci.item.name)}</span>
                </div>
                <p style="color: #1e3a5f; font-size: 17px; font-weight: 600; margin-bottom: 14px;">
                    Order: ${ci.quantity} ${escapeHtml(ci.item.unit)}${ci.item.brand ? ' · ' + escapeHtml(ci.item.brand) : ''}
                </p>
                <img src="${ci.imageBase64}" style="max-width: 95%; max-height: 550px; object-fit: contain; border-radius: 8px; box-shadow: 0 2px 16px rgba(0,0,0,0.08);" />
            </div>
        `).join('')}
    </div>
    ` : ''}
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html });
      const FileSystem = await import('expo-file-system/legacy');
      const pdfDir = FileSystem.documentDirectory || '';
      const newUri = `${pdfDir}CareKosh-${orderId}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: newUri });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: `CareKosh Order ${orderId}` });
      }
    } catch (e) {
      console.error(e);
      Alert.alert("PDF Failed", "Order saved but PDF generation failed. You can export the PDF later from the Orders screen.");
    }
  };

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
            {cartItem.item.supplierName || 'No supplier'}
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
          onPress={generatePDF}
          disabled={totalItems === 0}
        >
          <Ionicons name="cart-outline" size={18} color="white" />
          <Text style={styles.exportText}>Create Order & Export PDF</Text>
        </TouchableOpacity>
      </View>

      {/* ADD ITEM MODAL */}
      <AddItemModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        items={items}
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
