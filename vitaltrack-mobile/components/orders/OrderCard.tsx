/**
 * VitalTrack - Order Card Component
 * Expandable order card with status and actions
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import { formatDate } from '@/utils/helpers';
import { showPdfExportDialog } from '@/utils/orderPdfExport';
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
  const [showAllItems, setShowAllItems] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const stackActions = width < 360 || fontScale > 1.3;

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
      case 'partially_received':
        return {
          label: 'Partly received',
          color: colors.statusOrange,
          bgColor: colors.statusOrangeBg,
          icon: 'cube-outline' as const,
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
      case 'cancelled':
        return {
          label: 'Cancelled',
          color: colors.textSecondary,
          bgColor: colors.bgTertiary,
          icon: 'close-circle-outline' as const,
        };
      case 'completed':
        return {
          label: 'Completed',
          color: colors.statusGreen,
          bgColor: colors.statusGreenBg,
          icon: 'checkmark-done-outline' as const,
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
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={`Order ${order.orderId}, ${statusConfig.label}`}
      >
        <View style={styles.headerTop}>
          <Text style={[styles.orderId, { color: colors.textPrimary }]}>{order.orderId}</Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textTertiary}
          />
        </View>
        <View style={styles.headerBottom}>
          <Text style={[styles.orderMeta, { color: colors.textTertiary }]}>
            {order.totalItems} items • {order.totalUnits} units
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <Ionicons name={statusConfig.icon} size={12} color={statusConfig.color} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded Content */}
      {isExpanded && (
        <View style={[styles.expandedContent, { borderTopColor: colors.borderPrimary }]}>
          {/* Items List */}
          <View style={styles.section}>
            <View style={styles.itemHeading}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Order items</Text>
              <Text style={[styles.quantityHeading, { color: colors.textSecondary }]}>Quantity</Text>
            </View>

            {(showAllItems ? order.items : order.items.slice(0, 3)).map((item) => (
              <View key={item.id} style={[styles.itemRow, { borderBottomColor: colors.borderPrimary }]}>
                <Text style={[styles.itemName, { color: colors.textPrimary }]}>
                  {item.name}
                </Text>
                <Text style={[styles.itemQuantity, { color: colors.textSecondary }]}>
                  {item.quantity} {item.unit}
                </Text>
              </View>
            ))}

            {order.items.length > 3 && (
              <TouchableOpacity
                onPress={() => setShowAllItems(!showAllItems)}
                style={styles.moreItemsButton}
                accessibilityRole="button"
                accessibilityLabel={`${showAllItems ? 'Show fewer' : 'Show all'} items in order ${order.orderId}`}
                accessibilityState={{ expanded: showAllItems }}
              >
                <Text style={[styles.moreItems, { color: colors.accentBlue }]}>
                  {showAllItems ? 'Show fewer items' : `View all ${order.items.length} items`}
                </Text>
                <Ionicons name={showAllItems ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accentBlue} />
              </TouchableOpacity>
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
                style={[styles.primaryAction, { backgroundColor: colors.statusGreenBg, borderColor: colors.statusGreenBorder }]}
                onPress={onMarkReceived}
                accessibilityRole="button"
                accessibilityLabel={`Mark order ${order.orderId} as received`}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.statusGreen} />
                <Text style={[styles.actionButtonText, { color: colors.statusGreen }]}>
                  Mark as received
                </Text>
              </TouchableOpacity>
            )}

            {order.status === 'received' && (
              <TouchableOpacity
                style={[styles.primaryAction, { backgroundColor: colors.accentBlue, borderColor: colors.accentBlue }]}
                onPress={onUpdateStock}
                accessibilityRole="button"
                accessibilityLabel={`Update stock from order ${order.orderId}`}
              >
                <Ionicons name="cube-outline" size={18} color={colors.white} />
                <Text style={[styles.actionButtonText, { color: colors.white }]}>
                  Update Stock
                </Text>
              </TouchableOpacity>
            )}

            <View style={[styles.secondaryActions, stackActions && styles.stackedActions]}>
              <TouchableOpacity
                style={[styles.secondaryAction, stackActions && styles.stackedAction, { backgroundColor: colors.bgTertiary, borderColor: colors.borderPrimary }]}
                onPress={() => showPdfExportDialog({
                  id: order.orderId,
                  items: order.items,
                  createdAt: order.exportedAt,
                })}
                accessibilityRole="button"
                accessibilityLabel={`Export PDF for order ${order.orderId}`}
              >
                <Ionicons name="document-text-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Export PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryAction, stackActions && styles.stackedAction, { borderColor: colors.borderPrimary }]}
                onPress={onDelete}
                accessibilityRole="button"
                accessibilityLabel={`Remove order ${order.orderId}`}
              >
                <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>Remove</Text>
              </TouchableOpacity>
            </View>
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
    padding: spacing.lg,
    gap: spacing.sm,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  orderId: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    flex: 1,
    minWidth: 0,
  },
  orderMeta: {
    fontSize: fontSize.sm,
    flexShrink: 1,
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
  itemHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  quantityHeading: { fontSize: fontSize.xs, marginBottom: spacing.sm, flexShrink: 1, textAlign: 'right' },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: fontSize.sm,
    flex: 1,
    marginRight: spacing.md,
    minWidth: 0,
  },
  itemQuantity: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, textAlign: 'right', maxWidth: '40%', flexShrink: 1, fontVariant: ['tabular-nums'] },
  moreItemsButton: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', minHeight: 44, paddingVertical: spacing.sm },
  moreItems: {
    fontSize: fontSize.sm,
    flexShrink: 1,
  },
  timeline: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  timelineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  timelineLabel: { fontSize: fontSize.sm },
  timelineDate: { fontSize: fontSize.sm, flexShrink: 1, textAlign: 'right' },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  primaryAction: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 48,
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
    flexShrink: 1,
  },
  secondaryActions: { flexDirection: 'row', gap: spacing.sm },
  stackedActions: { flexDirection: 'column' },
  stackedAction: { flexGrow: 0, flexBasis: 'auto' },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 44,
  },
});
