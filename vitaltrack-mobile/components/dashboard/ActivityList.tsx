/**
 * VitalTrack - Activity List Component
 * Shows recent activity logs with expandable details
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import { formatRelativeTime, formatActionName } from '@/utils/helpers';
import type { ActivityLog } from '@/types';

interface ActivityListProps {
  activities: ActivityLog[];
}

export default function ActivityList({ activities }: ActivityListProps) {
  const { colors } = useTheme();

  if (activities.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No recent activity</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {activities.map((activity) => (
        <ActivityCard key={activity.id} activity={activity} />
      ))}
    </View>
  );
}

function ActivityCard({ activity }: { activity: ActivityLog }) {
  const { colors } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSecondary }]}
      onPress={() => setIsExpanded(!isExpanded)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.iconContainer, { backgroundColor: colors.accentBlueBg }]}>
          <View style={[styles.dot, { backgroundColor: colors.accentBlue }]} />
        </View>
        <View style={styles.cardContent}>
          <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>{activity.itemName}</Text>
          <Text style={[styles.actionText, { color: colors.textTertiary }]}>
            {formatActionName(activity.action)} • {formatRelativeTime(activity.timestamp)}
          </Text>
        </View>
        {(activity.details || activity.orderId) && (
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textTertiary}
          />
        )}
      </View>

      {isExpanded && (activity.details || activity.orderId) && (
        <View style={[styles.expandedContent, { borderTopColor: colors.borderPrimary }]}>
          {activity.details && (
            <Text style={[styles.detailsText, { color: colors.textSecondary }]}>{activity.details}</Text>
          )}
          {activity.orderId && (
            <Text style={[styles.orderText, { color: colors.accentBlue }]}>Order: {activity.orderId}</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  emptyContainer: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: { fontSize: fontSize.md },
  card: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardContent: { flex: 1 },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  actionText: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  expandedContent: {
    marginTop: spacing.md,
    marginLeft: 44,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  detailsText: { fontSize: fontSize.sm },
  orderText: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
});
