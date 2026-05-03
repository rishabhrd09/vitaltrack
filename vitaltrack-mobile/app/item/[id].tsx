/**
 * VitalTrack Mobile - Item Form Screen
 * Add/Edit item with all fields including image upload
 */

import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import { COMMON_UNITS } from '@/utils/helpers';
import { sanitizeName, sanitizeString, sanitizeUrl, sanitizeContact, sanitizeNumber } from '@/utils/sanitize';
import type { Item } from '@/types';
import { useItems, useCategories } from '@/hooks/useServerData';
import { useCreateItem, useUpdateItem, useDeleteItem } from '@/hooks/useServerMutations';
import { usePendingItemIds } from '@/hooks/usePendingItems';
import { useAuthStore } from '@/store/useAuthStore';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { handleMutationError } from '@/utils/serverErrors';
import { safeBack } from '@/utils/navigation';
import { toast } from '@/utils/toast';

export default function ItemFormScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id, categoryId: preselectedCategoryId } = useLocalSearchParams<{ id: string; categoryId?: string }>();
  const isNew = id === 'new';
  const { isOnline } = useNetworkStatus();

  const { data: categories = [] } = useCategories();
  const { data: items = [] } = useItems();
  const createItemMutation = useCreateItem();
  const updateItemMutation = useUpdateItem();
  const deleteItemMutation = useDeleteItem();
  // Spinner appears the instant the user taps Save — the previous default
  // 500 ms useDelayedPending window left the button looking like a flat
  // blue rectangle for the first half-second on a cold-start save (visible
  // in the May 1 cold_2 recording at t≈19). Immediate feedback is the
  // right call here because the user just took a deliberate action; flicker
  // on warm-server saves is preferable to "did anything happen?" silence.
  const isSavePending =
    createItemMutation.isPending || updateItemMutation.isPending;

  // Detect a previous save for THIS item that is still in flight from
  // another screen instance — happens when the user taps Save, navigates
  // back during a slow cold-start save, then re-opens the same item.
  // Without this guard the second save would carry the original `version`
  // and the server would 409 once the first save lands.
  const pendingItemIds = usePendingItemIds();
  const hasPendingSaveForThisItem =
    !isNew && typeof id === 'string' && pendingItemIds.has(id);

  // True while session init detected a slow backend (Render free-tier
  // cold start). Surfaced as a pre-flight expectation-setting banner so
  // the user knows the next save may sit pending for ~30-60s before the
  // server confirms — instead of the form looking frozen with no context.
  const isBackendColdStarting = useAuthStore((s) => s.isBackendColdStarting);

  const existingItem = !isNew ? items.find(i => i.id === id) : undefined;

  // Form state - use preselectedCategoryId if provided, then existingItem's category, then first category
  const [categoryId, setCategoryId] = useState(
    existingItem?.categoryId || preselectedCategoryId || categories[0]?.id || ''
  );
  const [name, setName] = useState(existingItem?.name || '');
  const [description, setDescription] = useState(existingItem?.description || '');
  const [quantity, setQuantity] = useState(existingItem?.quantity?.toString() || '0');
  const [unit, setUnit] = useState(existingItem?.unit || 'pieces');
  const [minimumStock, setMinimumStock] = useState(existingItem?.minimumStock?.toString() || '0');
  const [brand, setBrand] = useState(existingItem?.brand || '');
  const [supplierName, setSupplierName] = useState(existingItem?.supplierName || '');
  const [supplierContact, setSupplierContact] = useState(existingItem?.supplierContact || '');
  const [purchaseLink, setPurchaseLink] = useState(existingItem?.purchaseLink || '');
  const [notes, setNotes] = useState(existingItem?.notes || '');
  const [imageUri, setImageUri] = useState(existingItem?.imageUri || '');
  const [isCritical, setIsCritical] = useState(existingItem?.isCritical || false);

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);

  // Filter ACTIVE items for duplicate warning (exclude current item when editing)
  const activeItemSuggestions = name.trim().length >= 2
    ? items.filter(item =>
      item.isActive &&
      item.name.toLowerCase().includes(name.toLowerCase()) &&
      item.id !== id
    ).slice(0, 5)
    : [];

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSave = () => {
    if (hasPendingSaveForThisItem) {
      // Belt-and-suspenders — the Save button is also disabled in this
      // state. Surfacing as a toast (not Alert) keeps the screen flow
      // consistent with the rest of the app's mutation feedback.
      toast.info('Still saving previous changes', 'Please wait a moment');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Error', 'Item name is required');
      return;
    }
    if (!categoryId) {
      Alert.alert('Error', 'Please select a category');
      return;
    }
    if (!isOnline) {
      Alert.alert('Offline', 'Connect to WiFi to save changes.');
      return;
    }

    // Sanitize all user inputs for security
    const sanitizedName = sanitizeName(name);
    const sanitizedPurchaseLink = sanitizeUrl(purchaseLink);

    const itemData = {
      categoryId,
      name: sanitizedName,
      description: sanitizeString(description, 1000) || undefined,
      quantity: sanitizeNumber(quantity, 0, 999999, 0),
      unit,
      minimumStock: sanitizeNumber(minimumStock, 0, 999999, 0),
      brand: sanitizeString(brand, 255) || undefined,
      supplierName: sanitizeString(supplierName, 255) || undefined,
      supplierContact: sanitizeContact(supplierContact) || undefined,
      purchaseLink: sanitizedPurchaseLink,
      notes: sanitizeString(notes, 1000) || undefined,
      imageUri: imageUri || undefined,
      isCritical: isCritical,
    };

    // Fire-and-forget: kick off the mutation, navigate immediately, let the
    // toast appear from the call-site onSuccess closure when the server
    // eventually responds — wherever the user has navigated to. The per-item
    // "Updating…" badge from usePendingItemIds covers the in-flight signal.
    // Failure path is handled by the global MutationCache.onError safety net
    // in providers/QueryProvider.tsx, which surfaces a tappable retry toast.
    if (isNew) {
      // Check if there's a hidden item with the same name (case-insensitive)
      const hiddenItem = items.find(
        item => !item.isActive && item.name.toLowerCase() === sanitizedName.toLowerCase()
      );

      if (hiddenItem) {
        updateItemMutation.mutate(
          { id: hiddenItem.id, ...itemData, isActive: true, version: hiddenItem.version },
          { onSuccess: () => toast.success(`${sanitizedName} restored`) },
        );
      } else {
        createItemMutation.mutate(
          itemData,
          { onSuccess: () => toast.success(`${sanitizedName} added`) },
        );
      }
    } else {
      updateItemMutation.mutate(
        { id, ...itemData, version: existingItem?.version ?? 1 },
        { onSuccess: () => toast.success(`${sanitizedName} updated`) },
      );
    }
    safeBack();
  };

  const handleDelete = () => {
    if (!isOnline) { Alert.alert('Offline', 'Connect to WiFi to delete items.'); return; }
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteItemMutation.mutateAsync(id);
              safeBack();
            } catch (error) {
              handleMutationError(error, 'Delete Item');
            }
          },
        },
      ]
    );
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderPrimary }]}>
        <TouchableOpacity onPress={() => safeBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{isNew ? 'Add Item' : 'Edit Item'}</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[
            styles.saveButton,
            { backgroundColor: colors.accentBlue },
            hasPendingSaveForThisItem && styles.saveButtonDisabled,
          ]}
          disabled={
            createItemMutation.isPending ||
            updateItemMutation.isPending ||
            hasPendingSaveForThisItem
          }
        >
          {isSavePending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={[styles.saveButtonText, { color: colors.white }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {hasPendingSaveForThisItem && (
            <View style={[styles.concurrentBanner, { backgroundColor: colors.statusYellowBg, borderColor: colors.statusOrangeBorder }]}>
              <Ionicons name="time-outline" size={18} color={colors.statusOrange} />
              <Text style={[styles.concurrentBannerText, { color: colors.statusOrange }]}>
                A previous save for this item is still in progress. Please wait for it to finish before editing again.
              </Text>
            </View>
          )}
          {isBackendColdStarting && !hasPendingSaveForThisItem && (
            <View style={[styles.concurrentBanner, { backgroundColor: colors.statusYellowBg, borderColor: colors.statusOrangeBorder }]}>
              <Ionicons name="cloudy-outline" size={18} color={colors.statusOrange} />
              <Text style={[styles.concurrentBannerText, { color: colors.statusOrange }]}>
                Server is waking up — your save may take 30–60 seconds. You can continue using the app while it finishes.
              </Text>
            </View>
          )}
          {/* Image Upload */}
          <TouchableOpacity
            style={[styles.imageContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}
            onPress={pickImage}
          >
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.image} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="camera-outline" size={32} color={colors.textTertiary} />
                <Text style={[styles.imagePlaceholderText, { color: colors.textTertiary }]}>Add Photo</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Category Selector */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Category *</Text>
            <TouchableOpacity
              style={[styles.selector, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            >
              <Text style={[styles.selectorText, { color: colors.textPrimary }]}>
                {selectedCategory?.name || 'Select category'}
              </Text>
              <Ionicons
                name={showCategoryPicker ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
            {showCategoryPicker && (
              <View style={[styles.pickerDropdown, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.pickerItem,
                      { borderBottomColor: colors.borderPrimary },
                      cat.id === categoryId && { backgroundColor: colors.accentBlueBg },
                    ]}
                    onPress={() => {
                      setCategoryId(cat.id);
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        { color: cat.id === categoryId ? colors.accentBlue : colors.textPrimary },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Name */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Item Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary, color: colors.textPrimary }]}
              value={name}
              onChangeText={(text) => {
                setName(text);
                setShowNameSuggestions(text.trim().length >= 2);
              }}
              onFocus={() => name.trim().length >= 2 && setShowNameSuggestions(true)}
              onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
              placeholder="Enter item name"
              placeholderTextColor={colors.textMuted}
            />
            {showNameSuggestions && activeItemSuggestions.length > 0 && (
              <View style={[styles.suggestionsContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
                <Text style={[styles.suggestionsHeader, { color: colors.textTertiary }]}>⚠️ Similar items exist:</Text>
                {activeItemSuggestions.map((item: Item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.suggestionItem, { borderBottomColor: colors.borderPrimary }]}
                    onPress={() => {
                      Alert.alert(
                        'Item Already Exists',
                        `"${item.name}" already exists in your inventory. Would you like to edit it instead?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Edit Existing', onPress: () => router.replace(`/item/${item.id}`) },
                          { text: 'Use This Name', onPress: () => { setName(item.name); setShowNameSuggestions(false); } }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="alert-circle" size={16} color={colors.statusOrange} style={{ marginRight: 8 }} />
                    <Text style={[styles.suggestionText, { color: colors.textPrimary }]}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary, color: colors.textPrimary }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Enter description"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Quantity and Unit */}
          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Quantity</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary, color: colors.textPrimary }]}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Unit</Text>
              <TouchableOpacity
                style={[styles.selector, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}
                onPress={() => setShowUnitPicker(!showUnitPicker)}
              >
                <Text style={[styles.selectorText, { color: colors.textPrimary }]}>{unit}</Text>
                <Ionicons
                  name={showUnitPicker ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
              {showUnitPicker && (
                <View style={[styles.pickerDropdown, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
                    {COMMON_UNITS.map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[
                          styles.pickerItem,
                          { borderBottomColor: colors.borderPrimary },
                          u === unit && { backgroundColor: colors.accentBlueBg },
                        ]}
                        onPress={() => {
                          setUnit(u);
                          setShowUnitPicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerItemText,
                            { color: u === unit ? colors.accentBlue : colors.textPrimary },
                          ]}
                        >
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>

          {/* Minimum Stock */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Minimum Stock</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary, color: colors.textPrimary }]}
              value={minimumStock}
              onChangeText={setMinimumStock}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Critical Equipment Toggle */}
          <View style={styles.field}>
            <TouchableOpacity
              style={[styles.criticalToggle, { backgroundColor: colors.bgCard, borderColor: isCritical ? '#FAB005' : colors.borderPrimary }]}
              onPress={() => setIsCritical(!isCritical)}
            >
              <View style={styles.criticalToggleLeft}>
                <Ionicons
                  name={isCritical ? "star" : "star-outline"}
                  size={22}
                  color={isCritical ? "#FAB005" : colors.textTertiary}
                />
                <View>
                  <Text style={[styles.criticalToggleTitle, { color: colors.textPrimary }]}>Critical Equipment</Text>
                  <Text style={[styles.criticalToggleSubtitle, { color: colors.textTertiary }]}>
                    {isCritical ? 'Will show in Emergency Backup alerts' : 'Mark as life-support equipment'}
                  </Text>
                </View>
              </View>
              <View style={[styles.criticalBadge, { backgroundColor: isCritical ? '#FAB00520' : colors.bgTertiary }]}>
                <Text style={{ color: isCritical ? '#FAB005' : colors.textTertiary, fontSize: 12, fontWeight: '600' }}>
                  {isCritical ? 'ON' : 'OFF'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Brand */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Brand</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary, color: colors.textPrimary }]}
              value={brand}
              onChangeText={setBrand}
              placeholder="Enter brand name"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Supplier Info */}
          <View style={[styles.section, { borderTopColor: colors.borderPrimary }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Supplier Information</Text>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Supplier Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary, color: colors.textPrimary }]}
                value={supplierName}
                onChangeText={setSupplierName}
                placeholder="Enter supplier name"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Contact</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary, color: colors.textPrimary }]}
                value={supplierContact}
                onChangeText={setSupplierContact}
                placeholder="Phone or email"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Purchase Link</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary, color: colors.textPrimary }]}
                value={purchaseLink}
                onChangeText={setPurchaseLink}
                placeholder="https://..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Notes */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary, color: colors.textPrimary }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Delete Button (Edit mode only) */}
          {!isNew && (
            <TouchableOpacity style={[styles.deleteButton, { borderColor: colors.statusRed }]} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color={colors.statusRed} />
              <Text style={[styles.deleteButtonText, { color: colors.statusRed }]}>Delete Item</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: { padding: spacing.xs },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  saveButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  concurrentBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  concurrentBannerText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: 18,
  },
  scrollView: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  imageContainer: {
    height: 150,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  imagePlaceholderText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  section: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  field: { marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  selector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  selectorText: { fontSize: fontSize.md },
  pickerDropdown: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  pickerItemText: { fontSize: fontSize.md },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  deleteButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    zIndex: 100,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  suggestionsHeader: {
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontWeight: fontWeight.medium,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  suggestionText: {
    fontSize: fontSize.md,
    flex: 1,
  },
  criticalToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  criticalToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  criticalToggleTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  criticalToggleSubtitle: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  criticalBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
});
