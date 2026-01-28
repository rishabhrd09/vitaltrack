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
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { readAsStringAsync } from 'expo-file-system/legacy';
import { useAppStore } from '@/store/useAppStore';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import type { Item, OrderItem } from '@/types';
import { isOutOfStock, isLowStock, isCriticalEquipment } from '@/types';
import { generateId, formatDate, now } from '@/utils/helpers';
import { escapeHtml, validateImageUri } from '@/utils/sanitize';

interface CartItem {
  item: Item;
  quantity: number;
}

export default function CreateOrderScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { mode } = useLocalSearchParams();

  const items = useAppStore((state) => state.items);
  const saveOrder = useAppStore((state) => state.saveOrder);
  const createOrderId = useAppStore((state) => state.createOrderId);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
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

  // Show format selection dialog
  const generatePDF = () => {
    if (cartItems.length === 0) return;
    Alert.alert(
      '📄 Export PDF Format',
      'Choose your preferred layout:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: '📊 Table (No Images)', onPress: () => generateTablePDF() },
        { text: '🖼️ Cards (With Images)', onPress: () => generateCardPDF() },
      ]
    );
  };

  // OPTION 1: Clean Table Layout (No Images) - Like the uploaded reference
  const generateTablePDF = async () => {
    setIsGenerating(true);
    try {
      const orderId = createOrderId();
      const currentDate = formatDate(now());

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { font-family: 'Segoe UI', -apple-system, sans-serif; padding: 25px; color: #1a1a1a; background: #fff; }
              .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid #3b5998; }
              h1 { font-size: 24px; color: #3b5998; margin-bottom: 5px; }
              .order-id { font-size: 14px; color: #666; }
              .meta { color: #888; font-size: 13px; }
              .summary { background: #f0f4ff; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; text-align: center; font-size: 14px; color: #3b5998; }
              table { width: 100%; border-collapse: collapse; }
              th { background: #3b5998; color: white; padding: 12px 10px; text-align: left; font-weight: 600; font-size: 13px; }
              th:first-child { width: 40px; text-align: center; }
              th:nth-child(4) { text-align: center; }
              th:last-child { text-align: center; }
              td { padding: 12px 10px; border-bottom: 1px solid #e8e8f0; font-size: 13px; vertical-align: middle; }
              tr:nth-child(even) { background: #f8f9fc; }
              td:first-child { text-align: center; color: #666; }
              td:nth-child(4) { text-align: center; font-weight: 700; color: #3b5998; }
              td:last-child { text-align: center; }
              .item-name { font-weight: 600; color: #1a1a1a; }
              .empty { color: #999; }
              .link-btn { color: #3b5998; text-decoration: none; font-size: 12px; }
              .footer { margin-top: 25px; text-align: center; font-size: 11px; color: #888; padding-top: 15px; border-top: 1px solid #e8e8f0; }
              .footer-brand { color: #3b5998; font-weight: 600; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>🛒 Purchase Order</h1>
              <div class="order-id">Order #${orderId}</div>
              <div class="meta">${currentDate}</div>
            </div>
            <div class="summary"><strong>${totalItems}</strong> Items to Order  •  <strong>${totalUnits}</strong> Total Units</div>
            <table>
              <thead>
                <tr><th>#</th><th>Item Name</th><th>Brand</th><th>Qty</th><th>Supplier</th><th>Link</th></tr>
              </thead>
              <tbody>
                ${cartItems.map((ci, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><span class="item-name">${escapeHtml(ci.item.name)}</span></td>
                    <td>${escapeHtml(ci.item.brand) || '<span class="empty">-</span>'}</td>
                    <td>${ci.quantity} ${escapeHtml(ci.item.unit)}</td>
                    <td>${escapeHtml(ci.item.supplierName) || '<span class="empty">-</span>'}</td>
                    <td>${ci.item.purchaseLink ? '<a href="' + encodeURI(ci.item.purchaseLink) + '" class="link-btn">🔗</a>' : '<span class="empty">-</span>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="footer">Generated by <span class="footer-brand">VitalTrack</span></div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: `Order ${orderId}` });
      }
      saveOrderToStore(orderId);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper to save order
  const saveOrderToStore = (orderId: string) => {
    const savedOrderItems: OrderItem[] = cartItems.map(ci => ({
      id: generateId(),
      orderId,
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
    saveOrder(savedOrderItems);
    router.back();
    Alert.alert("Order Created", "Your order has been saved and exported.");
  };

  // OPTION 2: Card Layout with Images
  const generateCardPDF = async () => {
    if (cartItems.length === 0) return;
    setIsGenerating(true);

    try {
      const orderId = createOrderId();
      const currentDate = formatDate(now());

      // Convert all images to base64 first
      const itemsWithImages = await Promise.all(
        cartItems.map(async (ci) => ({
          ...ci,
          imageBase64: ci.item.imageUri ? await getBase64Image(ci.item.imageUri) : '',
        }))
      );

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { 
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; 
                padding: 30px; 
                color: #1a1a1a; 
                background: #fff;
                line-height: 1.4;
              }
              .header { 
                text-align: center; 
                margin-bottom: 30px; 
                padding-bottom: 20px; 
                border-bottom: 3px solid #1e3a5f; 
              }
              h1 { 
                font-size: 28px; 
                color: #1e3a5f; 
                font-weight: 700;
                margin-bottom: 8px;
              }
              .order-id {
                font-size: 16px;
                color: #64748b;
                margin-bottom: 5px;
              }
              .meta { 
                color: #888; 
                font-size: 14px; 
              }
              .summary-bar {
                display: flex;
                justify-content: center;
                gap: 40px;
                background: linear-gradient(135deg, #1e3a5f 0%, #2d5a7b 100%);
                color: white;
                padding: 18px 30px;
                border-radius: 12px;
                margin-bottom: 30px;
              }
              .summary-item {
                text-align: center;
              }
              .summary-value {
                font-size: 28px;
                font-weight: 700;
              }
              .summary-label {
                font-size: 13px;
                opacity: 0.9;
              }
              /* Refined Professional Card Layout - 60/40 Split */
              .item-card { 
                display: flex; 
                flex-direction: row;
                margin-bottom: 25px; 
                border: 1px solid #e0e0e0; 
                border-radius: 12px; 
                overflow: hidden; 
                background: #fafafa;
                page-break-inside: avoid;
                min-height: 250px; /* Ensure ample vertical space */
              }
              .item-main { 
                flex: 0 0 60%; 
                padding: 20px; 
                display: flex;
                flex-direction: column;
                gap: 15px; /* Space between Name and Grid */
              }
              .item-name { 
                font-size: 18px; 
                font-weight: 700; 
                color: #1e3a5f;
                padding-bottom: 10px;
                border-bottom: 2px solid #f1f5f9;
              }
              .details-grid { 
                display: grid; 
                grid-template-columns: 1fr 1fr; 
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                overflow: hidden;
                background: #fff;
              }
              .detail-box { 
                padding: 12px; 
                border-right: 1px solid #e2e8f0;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                flex-direction: column;
                justify-content: center;
              }
              /* Remove borders for last column/row logic handled by grid container? No, simple CSS trick: */
              .detail-box:nth-child(2n) { border-right: none; }
              .detail-box:nth-child(n+3) { border-bottom: none; }
              
              .detail-label { 
                font-size: 11px; 
                color: #64748b; 
                text-transform: uppercase; 
                letter-spacing: 0.5px; 
                margin-bottom: 4px;
                font-weight: 600;
              }
              .detail-value { 
                font-size: 14px; 
                font-weight: 600; 
                color: #334155; 
              }
              .link-btn { 
                display: inline-block; 
                background: #f1f5f9; 
                color: #1e3a5f; 
                padding: 6px 12px; 
                border-radius: 4px; 
                font-size: 12px; 
                text-decoration: none; 
                font-weight: 600; 
                text-align: center;
                border: 1px solid #e2e8f0;
              }
              .item-image { 
                flex: 0 0 40%; 
                background: #fff; 
                border-left: 1px solid #e0e0e0; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                padding: 10px;
              }
              .item-image img { 
                width: 100%; 
                height: 100%; 
                object-fit: contain; /* Clear image, no cropping */
                max-height: 250px;
              }
              .item-image .no-img { 
                color: #cbd5e1; 
                font-size: 12px; 
                text-align: center; 
              }
              .footer { 
                margin-top: 40px; 
                text-align: center; 
                font-size: 12px; 
                color: #888; 
                padding-top: 20px; 
                border-top: 2px solid #e8e8e8; 
              }
              .footer-brand {
                font-weight: 600;
                color: #1e3a5f;
              }
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

            ${itemsWithImages.map((ci, index) => `
              <div class="item-card">
                <div class="item-main">
                  <div class="item-header">
                    <div class="item-name"><span style="color: #64748b; font-weight: 400;">${index + 1}.</span> ${escapeHtml(ci.item.name)}</div>
                  </div>
                  
                  <div class="details-grid">
                    <div class="detail-box">
                      <div class="detail-label">📦 Order</div>
                      <div class="detail-value" style="font-size: 15px; color: #1e3a5f;">${ci.quantity} ${escapeHtml(ci.item.unit)}</div>
                    </div>
                    <div class="detail-box">
                      <div class="detail-label">🏷️ Brand</div>
                      <div class="detail-value">${escapeHtml(ci.item.brand) || '—'}</div>
                    </div>
                    <div class="detail-box">
                      <div class="detail-label">📍 Supplier</div>
                      <div class="detail-value">${escapeHtml(ci.item.supplierName) || '—'}</div>
                    </div>
                    <div class="detail-box">
                      <div class="detail-label">🔗 Link</div>
                      ${ci.item.purchaseLink ? `<a href="${encodeURI(ci.item.purchaseLink)}" class="link-btn">Buy Now</a>` : '<div class="detail-value">—</div>'}
                    </div>
                  </div>
                </div>
                <!-- Image Slot -->
                ${ci.imageBase64 ? `<div class="item-image"><img src="${ci.imageBase64}" alt="${escapeHtml(ci.item.name)}"/></div>` : ''}
              </div>
            `).join('')}

            <div class="footer">
              Generated by <span class="footer-brand">VitalTrack</span> • Home ICU Inventory Management
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: `Order ${orderId}` });
      }

      saveOrderToStore(orderId);

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to generate PDF");
    } finally {
      setIsGenerating(false);
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
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
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
        <TouchableOpacity style={styles.cancelLink} onPress={() => router.back()}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.md }}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: colors.accentBlue, opacity: totalItems === 0 ? 0.5 : 1 }]}
          onPress={generatePDF}
          disabled={totalItems === 0 || isGenerating}
        >
          <Ionicons name="share-outline" size={18} color="white" />
          <Text style={styles.exportText}>{isGenerating ? 'Exporting...' : 'Export PDF'}</Text>
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
