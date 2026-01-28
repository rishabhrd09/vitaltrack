/**
 * VitalTrack - Category Header Component
 * Expandable category with item count and status indicators
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import type { Category, Item } from '@/types';
import { isOutOfStock, isLowStock } from '@/types';

interface CategoryHeaderProps {
  category: Category;
  items: Item[];
  isExpanded: boolean;
  onToggle: () => void;
  onAddItem: () => void;
}

export default function CategoryHeader({
  category,
  items,
  isExpanded,
  onToggle,
  onAddItem,
}: CategoryHeaderProps) {
  const { colors } = useTheme();

  const outOfStockCount = items.filter((i) => isOutOfStock(i)).length;
  const lowStockCount = items.filter((i) => isLowStock(i) && !isOutOfStock(i)).length;
  const hasAlerts = outOfStockCount > 0 || lowStockCount > 0;

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={styles.leftSection}>
        <Ionicons
          name={isExpanded ? 'chevron-down' : 'chevron-forward'}
          size={20}
          color={colors.textTertiary}
        />
        <Text style={[styles.categoryName, { color: colors.textPrimary }]} numberOfLines={1}>
          {category.name}
        </Text>
      </View>

      <View style={styles.rightSection}>
        {/* Alert dot */}
        {hasAlerts && (
          <View
            style={[
              styles.alertDot,
              { backgroundColor: outOfStockCount > 0 ? colors.statusRed : colors.statusOrange },
            ]}
          />
        )}

        {/* Item count badge */}
        <View style={[styles.countBadge, { backgroundColor: colors.bgTertiary }]}>
          <Text style={[styles.countText, { color: colors.textSecondary }]}>{items.length} items</Text>
        </View>

        {/* Out of stock badge */}
        {outOfStockCount > 0 && (
          <View style={[styles.statusBadge, { backgroundColor: colors.statusRedBg }]}>
            <Text style={[styles.statusText, { color: colors.statusRed }]}>
              {outOfStockCount} out
            </Text>
          </View>
        )}

        {/* Low stock badge */}
        {lowStockCount > 0 && (
          <View style={[styles.statusBadge, { backgroundColor: colors.statusOrangeBg }]}>
            <Text style={[styles.statusText, { color: colors.statusOrange }]}>
              {lowStockCount} low
            </Text>
          </View>
        )}

        {/* Add button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={(e) => {
            e.stopPropagation();
            onAddItem();
          }}
        >
          <Ionicons name="add" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  categoryName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  alertDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  countBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  countText: { fontSize: fontSize.xs },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
