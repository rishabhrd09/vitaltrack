/**
 * VitalTrack - Item Row Component
 * Expandable item row with status indicators, image preview, and full details
 */

import { View, Text, TouchableOpacity, StyleSheet, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import type { Item } from '@/types';
import { isOutOfStock, isLowStock, isCriticalEquipment } from '@/types';
import { useAppStore } from '@/store/useAppStore';


interface ItemRowProps {
  item: Item;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  showCategory?: boolean;
}

export default function ItemRow({
  item,
  isExpanded,
  onToggle,
  onEdit,
  showCategory = false,
}: ItemRowProps) {
  const { colors } = useTheme();
  const getCategoryById = useAppStore((state) => state.getCategoryById);
  const category = showCategory ? getCategoryById(item.categoryId) : null;

  const isOOS = isOutOfStock(item);
  const isLow = isLowStock(item);
  const isCritical = isCriticalEquipment(item);

  // Determine status
  let statusColor = colors.statusGreen;
  let statusBgColor = colors.statusGreenBg;
  let statusText = 'In Stock';

  if (isOOS) {
    statusColor = colors.statusRed;
    statusBgColor = colors.statusRedBg;
    statusText = 'Out of Stock';
  } else if (isLow) {
    statusColor = colors.statusOrange;
    statusBgColor = colors.statusOrangeBg;
    statusText = isCritical ? 'Backup Available' : 'Low Stock';
  }

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => { });
  };

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      {/* Main Row */}
      <View style={styles.mainRow}>
        <View style={styles.leftSection}>
          {/* Image thumbnail or status dot */}
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          )}

          <View style={styles.itemInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
                {item.name}
              </Text>
              {isCritical && (
                <Ionicons name="star" size={12} color="#FAB005" />
              )}
            </View>
            {showCategory && category && (
              <Text style={[styles.categoryText, { color: colors.accentBlue }]} numberOfLines={1}>
                {category.name}
              </Text>
            )}
            <Text style={[styles.stockText, { color: colors.textTertiary }]}>
              {item.quantity} / {item.minimumStock} {item.unit}
            </Text>
          </View>
        </View>

        <View style={styles.rightSection}>
          {/* Status badge */}
          <View style={[styles.statusBadge, { backgroundColor: statusBgColor }]}>
            <Text style={[styles.statusTextBadge, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>

          {/* Expand indicator */}
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textTertiary}
          />
        </View>
      </View>

      {/* Expanded Content - ALWAYS SHOW SOMETHING */}
      {isExpanded && (
        <View style={[styles.expandedContent, { borderTopColor: colors.borderPrimary }]}>
          {/* Image (large) */}
          {item.imageUri && (
            <Image source={{ uri: item.imageUri }} style={styles.expandedImage} />
          )}

          {/* Stock Details - Always Show */}
          <View style={[styles.stockCard, { backgroundColor: colors.bgTertiary }]}>
            <View style={styles.stockRow}>
              <View style={styles.stockItem}>
                <Text style={[styles.stockLabel, { color: colors.textTertiary }]}>Current</Text>
                <Text style={[styles.stockValue, { color: colors.textPrimary }]}>{item.quantity}</Text>
              </View>
              <View style={styles.stockItem}>
                <Text style={[styles.stockLabel, { color: colors.textTertiary }]}>Minimum</Text>
                <Text style={[styles.stockValue, { color: colors.textPrimary }]}>{item.minimumStock}</Text>
              </View>
              <View style={styles.stockItem}>
                <Text style={[styles.stockLabel, { color: colors.textTertiary }]}>Unit</Text>
                <Text style={[styles.stockValue, { color: colors.textPrimary }]}>{item.unit}</Text>
              </View>
            </View>
          </View>

          {/* Details Grid - Optional fields */}
          <View style={styles.detailsGrid}>
            {item.brand && <DetailRow label="Brand" value={item.brand} colors={colors} />}
            {item.description && <DetailRow label="Description" value={item.description} colors={colors} />}
            {item.supplierName && <DetailRow label="Supplier" value={item.supplierName} colors={colors} />}
            {item.supplierContact && <DetailRow label="Contact" value={item.supplierContact} colors={colors} />}
            {item.expiryDate && <DetailRow label="Expiry" value={item.expiryDate} colors={colors} />}
            {item.notes && <DetailRow label="Notes" value={item.notes} colors={colors} />}
          </View>

          {/* Purchase Link */}
          {item.purchaseLink && (
            <TouchableOpacity
              style={[styles.linkButton, { backgroundColor: colors.accentBlueBg }]}
              onPress={() => openLink(item.purchaseLink!)}
            >
              <Ionicons name="cart-outline" size={16} color={colors.accentBlue} />
              <Text style={[styles.linkText, { color: colors.accentBlue }]}>Buy Now</Text>
            </TouchableOpacity>
          )}

          {/* Quick Actions */}
          <View style={[styles.quickActions, { borderTopColor: colors.borderPrimary }]}>
            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: colors.accentBlueBg }]}
              onPress={onEdit}
            >
              <Ionicons name="create-outline" size={16} color={colors.accentBlue} />
              <Text style={[styles.quickActionText, { color: colors.accentBlue }]}>Edit Item</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>{label}:</Text>
      <Text style={[styles.detailValue, { color: colors.textSecondary }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: '#ccc',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  itemInfo: { flex: 1 },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  categoryText: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  stockText: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusTextBadge: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  expandedContent: {
    padding: spacing.md,
    borderTopWidth: 1,
  },
  expandedImage: {
    width: '100%',
    height: 150,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    backgroundColor: '#ccc',
  },
  stockCard: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stockItem: {
    alignItems: 'center',
  },
  stockLabel: {
    fontSize: fontSize.xs,
    marginBottom: 4,
  },
  stockValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  detailsGrid: { marginBottom: spacing.md },
  detailRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    width: 90,
  },
  detailValue: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  linkText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  quickActions: {
    flexDirection: 'row',
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  quickActionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
