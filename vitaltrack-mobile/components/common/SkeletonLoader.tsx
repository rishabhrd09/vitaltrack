/**
 * VitalTrack - Skeleton Loader
 * Animated placeholder shapes shown while data loads.
 * Pure UI — no data dependencies, no side effects.
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, borderRadius } from '@/theme/spacing';

type SkeletonVariant = 'dashboard' | 'inventory' | 'orders';

interface SkeletonLoaderProps {
  variant: SkeletonVariant;
}

export function SkeletonLoader({ variant }: SkeletonLoaderProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const skeletonColor = colors.borderPrimary;
  const cardBg = colors.bgCard;
  const cardBorder = colors.borderPrimary;

  const Block = ({
    width,
    height,
    radius = borderRadius.sm,
    style,
  }: {
    width: number | `${number}%`;
    height: number;
    radius?: number;
    style?: any;
  }) => (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: skeletonColor,
          opacity,
        },
        style,
      ]}
    />
  );

  if (variant === 'dashboard') {
    return (
      <View style={styles.dashboardContainer}>
        {/* Header row: "Overview" title + Build Inventory button */}
        <View style={styles.dashboardHeader}>
          <Block width={140} height={28} radius={borderRadius.sm} />
          <Block width={140} height={32} radius={borderRadius.md} />
        </View>

        {/* Stats grid: 2×2 */}
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatCardSkeleton cardBg={cardBg} cardBorder={cardBorder} Block={Block} />
            <StatCardSkeleton cardBg={cardBg} cardBorder={cardBorder} Block={Block} />
          </View>
          <View style={styles.statsRow}>
            <StatCardSkeleton cardBg={cardBg} cardBorder={cardBorder} Block={Block} />
            <StatCardSkeleton cardBg={cardBg} cardBorder={cardBorder} Block={Block} />
          </View>
        </View>

        {/* Needs Attention card */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: cardBg, borderColor: cardBorder },
          ]}
        >
          <Block width={160} height={18} />
          <View style={{ height: spacing.md }} />
          <Block width="100%" height={14} />
          <View style={{ height: spacing.sm }} />
          <Block width="85%" height={14} />
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Block width={140} height={16} style={{ marginBottom: spacing.md }} />
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.activityRow,
                { backgroundColor: cardBg, borderColor: cardBorder },
              ]}
            >
              <Block width={32} height={32} radius={borderRadius.md} />
              <View style={styles.activityRowText}>
                <Block width="70%" height={14} />
                <View style={{ height: 6 }} />
                <Block width="40%" height={12} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (variant === 'inventory') {
    return (
      <View style={styles.inventoryContainer}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.categorySection}>
            {/* Category header (card-style row) */}
            <View
              style={[
                styles.categoryHeader,
                { backgroundColor: cardBg, borderColor: cardBorder },
              ]}
            >
              <View style={styles.categoryHeaderLeft}>
                <Block width={16} height={16} radius={borderRadius.sm} />
                <Block width={120} height={16} />
              </View>
              <View style={styles.categoryHeaderRight}>
                <Block width={56} height={18} radius={borderRadius.sm} />
                <Block width={28} height={28} radius={borderRadius.sm} />
              </View>
            </View>

            {/* Expanded item rows for the first section only */}
            {i === 0 &&
              [0, 1, 2].map((j) => (
                <View
                  key={j}
                  style={[
                    styles.itemRow,
                    { backgroundColor: cardBg, borderColor: cardBorder },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Block width="60%" height={14} />
                    <View style={{ height: 6 }} />
                    <Block width="40%" height={12} />
                  </View>
                  <Block width={48} height={20} radius={borderRadius.sm} />
                </View>
              ))}
          </View>
        ))}
      </View>
    );
  }

  // orders
  return (
    <View style={styles.ordersContainer}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.orderCard,
            { backgroundColor: cardBg, borderColor: cardBorder },
          ]}
        >
          <View style={styles.orderCardHeader}>
            <View style={{ flex: 1 }}>
              <Block width={120} height={16} />
              <View style={{ height: 6 }} />
              <Block width={160} height={12} />
            </View>
            <View style={styles.orderCardRight}>
              <Block width={72} height={22} radius={borderRadius.full} />
              <Block width={20} height={20} radius={borderRadius.sm} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function StatCardSkeleton({
  cardBg,
  cardBorder,
  Block,
}: {
  cardBg: string;
  cardBorder: string;
  Block: React.ComponentType<any>;
}) {
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: cardBg, borderColor: cardBorder },
      ]}
    >
      <View style={styles.statCardHeader}>
        <Block width={40} height={40} radius={borderRadius.md} />
      </View>
      <Block width={60} height={24} style={{ marginBottom: spacing.xs }} />
      <Block width={80} height={12} />
    </View>
  );
}

const styles = StyleSheet.create({
  dashboardContainer: {
    flex: 1,
    padding: spacing.lg,
    paddingBottom: 130,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  statsGrid: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  statCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  sectionCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  section: {
    marginTop: spacing.lg,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  activityRowText: {
    flex: 1,
  },

  inventoryContainer: {
    flex: 1,
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 130,
  },
  categorySection: {
    marginBottom: spacing.md,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  categoryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.md,
  },

  ordersContainer: {
    flex: 1,
    padding: spacing.lg,
    paddingBottom: 130,
    gap: spacing.md,
  },
  orderCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
