/**
 * VitalTrack - Needs Attention Section
 * Matches Kotlin app design: Out of Stock, Emergency Backup, Low Stock
 * 
 * FIXED: Emergency backup now also includes critical items that are out of stock
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import type { Item } from '@/types';
import { isCriticalEquipment, needsEmergencyBackup, sortByCriticalFirst } from '@/types';
import { usePendingItemIds } from '@/hooks/usePendingItems';

interface NeedsAttentionProps {
  outOfStockItems: Item[];
  lowStockItems: Item[];
  onOrderNow: () => void;
  onEditItem: (itemId: string) => void;
  onEmergencyOrder?: () => void;
  onViewAll?: () => void;
  // Reports the Low Stock card's y-coordinate relative to its immediate
  // parent so the dashboard can scroll directly to it. The dashboard
  // combines this with the NeedsAttention wrapper's y to build a
  // ScrollView-relative offset.
  onLowStockLayout?: (y: number) => void;
}

export default function NeedsAttention({
  outOfStockItems,
  lowStockItems,
  onOrderNow,
  onEditItem,
  onEmergencyOrder,
  onViewAll,
  onLowStockLayout,
}: NeedsAttentionProps) {
  const { colors } = useTheme();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isOutOfStockExpanded, setIsOutOfStockExpanded] = useState(true);
  const [showAllOutOfStock, setShowAllOutOfStock] = useState(false);
  const [showAllLowStock, setShowAllLowStock] = useState(false);
  const [showAllEmergency, setShowAllEmergency] = useState(false);
  const pendingItemIds = usePendingItemIds();

  const totalCount = outOfStockItems.length + lowStockItems.length;

  // FIXED: Find critical items that need emergency backup
  // Include both: critical items with qty=1 (from lowStock) AND critical items with qty=0 (from outOfStock)
  const lowStockEmergencyItems = lowStockItems.filter((item) => needsEmergencyBackup(item));
  const outOfStockCriticalItems = outOfStockItems.filter((item) => isCriticalEquipment(item));
  
  // Combine both: critical items at qty=0 or qty=1 need emergency backup
  const emergencyBackupItems = [...outOfStockCriticalItems, ...lowStockEmergencyItems];
  const showEmergencyBackup = emergencyBackupItems.length > 0;
  const emergencyDisplayItems = showAllEmergency ? emergencyBackupItems : emergencyBackupItems.slice(0, 3);

  // Sort all items: critical first
  const sortedOutOfStock = [...outOfStockItems].sort(sortByCriticalFirst);
  const sortedLowStock = [...lowStockItems].sort(sortByCriticalFirst);

  // Show all items if expanded, otherwise just preview
  const outOfStockDisplayItems = showAllOutOfStock ? sortedOutOfStock : sortedOutOfStock.slice(0, 4);
  const lowStockDisplayItems = showAllLowStock ? sortedLowStock : sortedLowStock.slice(0, 3);

  if (totalCount === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
        <View style={[styles.emptyIconContainer, { backgroundColor: colors.statusGreenBg }]}>
          <Ionicons name="checkmark-circle" size={24} color={colors.statusGreen} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>All stocked up!</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>No items need attention right now</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel="Needs attention"
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Needs Attention</Text>
          <View style={[styles.countBadge, { backgroundColor: colors.statusRedBg }]}>
            <Text style={[styles.countBadgeText, { color: colors.statusRed }]}>{totalCount}</Text>
          </View>
        </View>
        <View style={styles.collapseControl}>
          <Text style={[styles.collapseText, { color: colors.textSecondary }]}>{isExpanded ? 'Collapse' : 'Expand'}</Text>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          {/* OUT OF STOCK CARD */}
          {outOfStockItems.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => setIsOutOfStockExpanded(!isOutOfStockExpanded)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.cardIcon, { backgroundColor: colors.statusRedBg }]}>
                    <Ionicons name="alert-circle" size={18} color={colors.statusRed} />
                  </View>
                  <View>
                    <View style={styles.cardTitleRow}>
                      <Text style={[styles.cardTitle, { color: colors.statusRed }]}>Out of Stock</Text>
                      <Ionicons
                        name={isOutOfStockExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.statusRed}
                      />
                    </View>
                    <Text style={[styles.cardSubtitle, { color: colors.textTertiary }]}>No stock available</Text>
                  </View>
                </View>
                <View style={[styles.cardCount, { backgroundColor: colors.bgTertiary }]}>
                  <Text style={[styles.cardCountText, { color: colors.textPrimary }]}>{outOfStockItems.length}</Text>
                </View>
              </TouchableOpacity>

              {isOutOfStockExpanded && (
                <View style={styles.cardContent}>
                  {outOfStockDisplayItems.map((item) => (
                    <View key={item.id} style={[styles.itemRow, { borderTopColor: colors.borderPrimary }]}>
                      <View style={styles.itemLeft}>
                        <View style={[styles.itemDot, { backgroundColor: colors.statusRed }]} />
                        <View style={styles.itemNameColumn}>
                          <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {pendingItemIds.has(item.id) && (
                            <View style={styles.pendingTag} accessibilityLabel="Updating">
                              <ActivityIndicator size="small" color={colors.textMuted} />
                              <Text style={[styles.pendingText, { color: colors.textMuted }]}>
                                Updating…
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.updateButton, { borderColor: colors.accentBlue }]}
                        onPress={() => onEditItem(item.id)}
                      >
                        <Text style={[styles.updateButtonText, { color: colors.accentBlue }]}>Update</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* Footer with View All and Order Now */}
                  <View style={[styles.cardFooter, { borderTopColor: colors.borderPrimary }]}>
                    {outOfStockItems.length > 4 && (
                      <TouchableOpacity onPress={() => setShowAllOutOfStock(!showAllOutOfStock)}>
                        <Text style={[styles.viewAllText, { color: colors.accentBlue }]}>
                          {showAllOutOfStock ? 'Show less' : `View all ${outOfStockItems.length} items`}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.orderNowButton, { backgroundColor: colors.accentBlue }]}
                      onPress={onOrderNow}
                    >
                      <Ionicons name="cart" size={16} color={colors.white} />
                      <Text style={styles.orderNowText}>Order Now</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* EMERGENCY BACKUP CARD */}
          {showEmergencyBackup && (
            <View style={[styles.emergencyCard, { backgroundColor: colors.bgCard, borderColor: colors.statusOrangeBorder }]}>
              <View style={styles.emergencyHeader}>
                <View style={[styles.emergencyIcon, { backgroundColor: colors.statusOrangeBg }]}>
                  <Ionicons name="shield-outline" size={22} color={colors.statusOrange} />
                </View>
                <View style={styles.emergencyText}>
                  <Text style={[styles.emergencyTitle, { color: colors.textPrimary }]}>Emergency backup</Text>
                  <Text style={[styles.emergencySubtitle, { color: colors.textSecondary }]}>
                    Critical equipment with limited reserve
                  </Text>
                </View>
                <View style={[styles.emergencyCount, { backgroundColor: colors.statusOrangeBg }]}>
                  <Text style={[styles.emergencyCountValue, { color: colors.statusOrange }]}>{emergencyBackupItems.length}</Text>
                  <Text style={[styles.emergencyCountLabel, { color: colors.textSecondary }]}>{emergencyBackupItems.length === 1 ? 'item' : 'items'}</Text>
                </View>
              </View>

              <View style={styles.emergencySummary}>
                {outOfStockCriticalItems.length > 0 && (
                  <View style={[styles.reserveBadge, { backgroundColor: colors.statusRedBg }]}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.statusRed} />
                    <Text style={[styles.reserveBadgeText, { color: colors.statusRed }]}>{outOfStockCriticalItems.length} out of stock</Text>
                  </View>
                )}
                {lowStockEmergencyItems.length > 0 && (
                  <View style={[styles.reserveBadge, { backgroundColor: colors.statusOrangeBg }]}>
                    <Ionicons name="layers-outline" size={14} color={colors.statusOrange} />
                    <Text style={[styles.reserveBadgeText, { color: colors.statusOrange }]}>{lowStockEmergencyItems.length} low reserve</Text>
                  </View>
                )}
              </View>

              <View style={[styles.emergencyItems, { borderColor: colors.borderPrimary }]}>
                {emergencyDisplayItems.map((item, index) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.emergencyItem, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderPrimary }]}
                    onPress={() => onEditItem(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Review ${item.name}, ${item.quantity} ${item.unit}, ${item.quantity <= 0 ? 'out of stock' : 'low stock'}`}
                  >
                    <View style={styles.emergencyItemNameColumn}>
                      <Text style={[styles.emergencyItemName, { color: colors.textPrimary }]}>{item.name}</Text>
                      {pendingItemIds.has(item.id) && <Text style={[styles.pendingText, { color: colors.textSecondary }]}>Updating…</Text>}
                    </View>
                    <View style={styles.emergencyQuantity}>
                      <Text style={[styles.emergencyQuantityValue, { color: item.quantity <= 0 ? colors.statusRed : colors.statusOrange }]}>{item.quantity} <Text style={styles.emergencyQuantityUnit}>{item.unit}</Text></Text>
                      <Text style={[styles.emergencyQuantityLabel, { color: colors.textSecondary }]}>{item.quantity <= 0 ? 'Out of stock' : 'Low stock'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </View>
              {emergencyBackupItems.length > 3 && (
                <TouchableOpacity
                  style={styles.emergencyExpand}
                  onPress={() => setShowAllEmergency(!showAllEmergency)}
                  accessibilityRole="button"
                  accessibilityLabel={showAllEmergency ? 'Show fewer emergency backup items' : 'Show all emergency backup items'}
                  accessibilityState={{ expanded: showAllEmergency }}
                >
                  <Text style={[styles.viewAllText, { color: colors.accentBlue }]}>{showAllEmergency ? 'Show fewer items' : `View all ${emergencyBackupItems.length} items`}</Text>
                  <Ionicons name={showAllEmergency ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accentBlue} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.emergencyButton, { backgroundColor: colors.statusOrange }]}
                onPress={onEmergencyOrder || onOrderNow}
                accessibilityRole="button"
                accessibilityLabel="Review emergency order"
              >
                <Ionicons name="cart-outline" size={18} color={colors.white} />
                <Text style={styles.emergencyButtonText}>Review emergency order</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.white} />
              </TouchableOpacity>
            </View>
          )}

          {/* LOW STOCK CARD */}
          {lowStockItems.length > 0 && (
            <View
              style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}
              onLayout={(e) => onLowStockLayout?.(e.nativeEvent.layout.y)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.cardIcon, { backgroundColor: colors.statusOrangeBg }]}>
                    <Ionicons name="trending-down" size={18} color={colors.statusOrange} />
                  </View>
                  <View>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Low Stock</Text>
                    <Text style={[styles.cardSubtitle, { color: colors.textTertiary }]}>Below minimum level</Text>
                  </View>
                </View>
                <View style={[styles.cardCount, { backgroundColor: colors.bgTertiary }]}>
                  <Text style={[styles.cardCountText, { color: colors.textPrimary }]}>{lowStockItems.length}</Text>
                </View>
              </View>

              <View style={styles.cardContent}>
                {lowStockDisplayItems.map((item) => (
                  <View key={item.id} style={[styles.itemRow, { borderTopColor: colors.borderPrimary }]}>
                    <View style={styles.itemLeft}>
                      <View style={[styles.itemDot, { backgroundColor: isCriticalEquipment(item) ? colors.statusRed : colors.statusOrange }]} />
                      <View style={styles.itemNameColumn}>
                        <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {item.name}{isCriticalEquipment(item) ? ' ⚠️' : ''}
                        </Text>
                        {pendingItemIds.has(item.id) && (
                          <View style={styles.pendingTag} accessibilityLabel="Updating">
                            <ActivityIndicator size="small" color={colors.textMuted} />
                            <Text style={[styles.pendingText, { color: colors.textMuted }]}>
                              Updating…
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.itemRight}>
                      <View style={[styles.leftBadge, { backgroundColor: colors.statusOrangeBg }]}>
                        <Text style={[styles.leftBadgeText, { color: colors.statusOrange }]}>
                          {item.quantity} left
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.updateButton, { borderColor: colors.accentBlue }]}
                        onPress={() => onEditItem(item.id)}
                      >
                        <Text style={[styles.updateButtonText, { color: colors.accentBlue }]}>Update</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {/* Footer with View All */}
                {lowStockItems.length > 3 && (
                  <View style={[styles.cardFooter, { borderTopColor: colors.borderPrimary }]}>
                    <TouchableOpacity onPress={() => setShowAllLowStock(!showAllLowStock)}>
                      <Text style={[styles.viewAllText, { color: colors.accentBlue }]}>
                        {showAllLowStock ? 'Show less' : `View all ${lowStockItems.length} items`}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.orderNowButton, { backgroundColor: colors.accentBlue }]}
                      onPress={onOrderNow}
                    >
                      <Ionicons name="cart" size={16} color={colors.white} />
                      <Text style={styles.orderNowText}>Order Now</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, flexShrink: 1, minWidth: 0, gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, flexShrink: 1 },
  countBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    minWidth: 24,
    alignItems: 'center',
  },
  countBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  collapseText: { fontSize: fontSize.sm },
  collapseControl: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: spacing.sm, flexShrink: 0 },
  content: { gap: spacing.md },
  card: { borderRadius: borderRadius.lg, borderWidth: 1, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardIcon: { width: 36, height: 36, borderRadius: borderRadius.full, justifyContent: 'center', alignItems: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  cardSubtitle: { fontSize: fontSize.xs, marginTop: 2 },
  cardCount: { width: 40, height: 40, borderRadius: borderRadius.md, justifyContent: 'center', alignItems: 'center' },
  cardCountText: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  cardContent: {},
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.sm },
  itemDot: { width: 6, height: 6, borderRadius: 3 },
  itemNameColumn: { flex: 1 },
  itemName: { fontSize: fontSize.md },
  pendingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  pendingText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  leftBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  leftBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  updateButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1 },
  updateButtonText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderTopWidth: 1,
  },
  viewAllText: { fontSize: fontSize.sm },
  orderNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  orderNowText: { color: '#FFFFFF', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  emergencyCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    borderTopWidth: 3,
  },
  emergencyHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  emergencyIcon: { width: 40, height: 40, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
  emergencyText: { flex: 1, minWidth: 0 },
  emergencyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  emergencySubtitle: { fontSize: fontSize.sm, marginTop: spacing.xs, lineHeight: 18 },
  emergencyCount: { minWidth: 44, borderRadius: borderRadius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, alignItems: 'center' },
  emergencyCountValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, fontVariant: ['tabular-nums'] },
  emergencyCountLabel: { fontSize: fontSize.xs },
  emergencySummary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  reserveBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  reserveBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, flexShrink: 1 },
  emergencyItems: { borderWidth: 1, borderRadius: borderRadius.md, overflow: 'hidden' },
  emergencyItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, minHeight: 52 },
  emergencyItemNameColumn: { flex: 1, minWidth: 0 },
  emergencyItemName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  emergencyQuantity: { flexShrink: 1, maxWidth: '42%', alignItems: 'flex-end' },
  emergencyQuantityValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, textAlign: 'right', fontVariant: ['tabular-nums'] },
  emergencyQuantityUnit: { fontSize: fontSize.xs, fontWeight: fontWeight.normal },
  emergencyQuantityLabel: { fontSize: fontSize.xs, textAlign: 'right', marginTop: 2 },
  emergencyExpand: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingVertical: spacing.sm },
  emergencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    minHeight: 48,
  },
  emergencyButtonText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: fontWeight.semibold, flexShrink: 1, textAlign: 'center' },
  emptyContainer: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  emptyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  emptySubtitle: { fontSize: fontSize.sm, marginTop: spacing.xs },
});
