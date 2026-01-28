/**
 * VitalTrack - Needs Attention Section
 * Matches Kotlin app design: Out of Stock, Emergency Backup, Low Stock
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import type { Item } from '@/types';
import { isCriticalEquipment, needsEmergencyBackup, sortByCriticalFirst } from '@/types';

interface NeedsAttentionProps {
  outOfStockItems: Item[];
  lowStockItems: Item[];
  onOrderNow: () => void;
  onEditItem: (itemId: string) => void;
  onEmergencyOrder?: () => void;
  onViewAll?: () => void;
}

export default function NeedsAttention({
  outOfStockItems,
  lowStockItems,
  onOrderNow,
  onEditItem,
  onEmergencyOrder,
  onViewAll,
}: NeedsAttentionProps) {
  const { colors } = useTheme();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isOutOfStockExpanded, setIsOutOfStockExpanded] = useState(true);
  const [showAllOutOfStock, setShowAllOutOfStock] = useState(false);
  const [showAllLowStock, setShowAllLowStock] = useState(false);

  const totalCount = outOfStockItems.length + lowStockItems.length;

  // Find critical items that need emergency backup (stock == 1)
  const emergencyBackupItems = lowStockItems.filter((item) => needsEmergencyBackup(item));
  const showEmergencyBackup = emergencyBackupItems.length > 0;

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
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Needs Attention</Text>
          <View style={[styles.countBadge, { backgroundColor: colors.statusRedBg }]}>
            <Text style={[styles.countBadgeText, { color: colors.statusRed }]}>{totalCount}</Text>
          </View>
        </View>
        <Text style={[styles.collapseText, { color: colors.textTertiary }]}>
          {isExpanded ? 'Collapse' : 'Expand'} ^
        </Text>
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
                    <Text style={[styles.cardSubtitle, { color: colors.textTertiary }]}>Critical items</Text>
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
                        <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {item.name}
                        </Text>
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
            <View style={[styles.emergencyCard, { backgroundColor: colors.statusYellowBg, borderColor: colors.statusOrangeBorder }]}>
              <View style={styles.emergencyHeader}>
                <Ionicons name="warning" size={20} color={colors.statusOrange} />
                <View style={styles.emergencyText}>
                  <Text style={[styles.emergencyTitle, { color: colors.statusOrange }]}>
                    Consider Backup for Emergency ({emergencyBackupItems.length})
                  </Text>
                  <Text style={[styles.emergencySubtitle, { color: colors.textSecondary }]}>
                    {emergencyBackupItems.map(item => item.name).join(', ')} - only 1 unit left. Having a backup is critical.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.emergencyButton, { backgroundColor: colors.statusOrange }]}
                onPress={onEmergencyOrder || onOrderNow}
              >
                <Ionicons name="cart" size={18} color={colors.white} />
                <Text style={styles.emergencyButtonText}>Emergency Order</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* LOW STOCK CARD */}
          {lowStockItems.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
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
                      <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.name}{isCriticalEquipment(item) ? ' ⚠️' : ''}
                      </Text>
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  countBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    minWidth: 24,
    alignItems: 'center',
  },
  countBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  collapseText: { fontSize: fontSize.sm },
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
  itemName: { fontSize: fontSize.md, flex: 1 },
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
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  emergencyHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  emergencyText: { flex: 1 },
  emergencyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  emergencySubtitle: { fontSize: fontSize.sm, marginTop: 4, lineHeight: 20 },
  emergencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  emergencyButtonText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: fontWeight.semibold },
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
