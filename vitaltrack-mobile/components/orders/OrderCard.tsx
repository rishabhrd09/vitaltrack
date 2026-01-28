/**
 * VitalTrack - Order Card Component
 * Expandable order card with status and actions
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import { formatDate } from '@/utils/helpers';
import type { SavedOrder, OrderStatus } from '@/types';

interface OrderCardProps {
  order: SavedOrder;
  onMarkReceived: () => void;
  onUpdateStock: () => void;
  onDelete: () => void;
}

export default function OrderCard({
  order,
  onMarkReceived,
  onUpdateStock,
  onDelete,
}: OrderCardProps) {
  const { colors } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusConfig = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return {
          label: 'Pending',
          color: colors.statusYellow,
          bgColor: colors.statusYellowBg,
          icon: 'time-outline' as const,
        };
      case 'ordered':
        return {
          label: 'Ordered',
          color: colors.accentBlue,
          bgColor: colors.accentBlueBg,
          icon: 'send-outline' as const,
        };
      case 'received':
        return {
          label: 'Received',
          color: colors.statusGreen,
          bgColor: colors.statusGreenBg,
          icon: 'checkmark-outline' as const,
        };
      case 'stock_updated':
        return {
          label: 'Stock Updated',
          color: colors.statusGreen,
          bgColor: colors.statusGreenBg,
          icon: 'checkmark-done-outline' as const,
        };
      case 'declined':
        return {
          label: 'Declined',
          color: colors.statusRed,
          bgColor: colors.statusRedBg,
          icon: 'close-outline' as const,
        };
      default:
        return {
          label: 'Unknown',
          color: colors.textTertiary,
          bgColor: colors.bgTertiary,
          icon: 'help-outline' as const,
        };
    }
  };

  const statusConfig = getStatusConfig(order.status);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.orderId, { color: colors.textPrimary }]}>{order.orderId}</Text>
          <Text style={[styles.orderMeta, { color: colors.textTertiary }]}>
            {order.totalItems} items • {order.totalUnits} units
          </Text>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <Ionicons name={statusConfig.icon} size={12} color={statusConfig.color} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textTertiary}
          />
        </View>
      </TouchableOpacity>

      {/* Expanded Content */}
      {isExpanded && (
        <View style={[styles.expandedContent, { borderTopColor: colors.borderPrimary }]}>
          {/* Items List */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>Items</Text>
            {order.items.slice(0, 5).map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.itemQuantity, { color: colors.textSecondary }]}>
                  {item.quantity} {item.unit}
                </Text>
              </View>
            ))}
            {order.items.length > 5 && (
              <Text style={[styles.moreItems, { color: colors.textTertiary }]}>
                +{order.items.length - 5} more items
              </Text>
            )}
          </View>

          {/* Timeline */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>Timeline</Text>
            <View style={[styles.timeline, { backgroundColor: colors.bgTertiary }]}>
              <TimelineRow label="Created" date={order.exportedAt} />
              {order.orderedAt && <TimelineRow label="Ordered" date={order.orderedAt} />}
              {order.receivedAt && <TimelineRow label="Received" date={order.receivedAt} />}
              {order.appliedAt && <TimelineRow label="Stock Updated" date={order.appliedAt} />}
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {order.status === 'pending' && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.statusGreenBg }]}
                onPress={onMarkReceived}
              >
                <Text style={[styles.actionButtonText, { color: colors.statusGreen }]}>
                  Have you received the order?
                </Text>
              </TouchableOpacity>
            )}

            {order.status === 'received' && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.accentBlue }]}
                onPress={onUpdateStock}
              >
                <Text style={[styles.actionButtonText, { color: colors.white }]}>
                  Update Stock
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.deleteButton, { borderColor: colors.borderPrimary }]}
              onPress={onDelete}
            >
              <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.deleteButtonText, { color: colors.textSecondary }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function TimelineRow({ label, date }: { label: string; date: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.timelineRow}>
      <Text style={[styles.timelineLabel, { color: colors.textTertiary }]}>{label}:</Text>
      <Text style={[styles.timelineDate, { color: colors.textSecondary }]}>{formatDate(date)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  headerLeft: { flex: 1 },
  orderId: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  orderMeta: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  expandedContent: {
    padding: spacing.lg,
    paddingTop: 0,
    borderTopWidth: 1,
  },
  section: { marginTop: spacing.lg },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  itemName: {
    fontSize: fontSize.sm,
    flex: 1,
    marginRight: spacing.md,
  },
  itemQuantity: { fontSize: fontSize.sm },
  moreItems: {
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
  },
  timeline: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  timelineLabel: { fontSize: fontSize.sm },
  timelineDate: { fontSize: fontSize.sm },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  deleteButtonText: { fontSize: fontSize.sm },
});
