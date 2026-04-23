/**
 * VitalTrack Mobile - Dashboard Screen
 * Shows stats overview, needs attention items, and recent activity
 */

import { useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import VitalTrackTopBar from '@/components/common/VitalTrackTopBar';
import ConnectionStatusPill from '@/components/common/ConnectionStatusPill';
import ProfileMenuSheet from '@/components/common/ProfileMenuSheet';
import ExportModal from '@/components/common/ExportModal';
import HelpSupportDialog from '@/components/common/HelpSupportDialog';
import StatsCard from '@/components/dashboard/StatsCard';
import NeedsAttention from '@/components/dashboard/NeedsAttention';
import ActivityList from '@/components/dashboard/ActivityList';
import { SkeletonLoader } from '@/components/common/SkeletonLoader';
import { useItems, useOrders, useActivities } from '@/hooks/useServerData';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useForceSync } from '@/hooks/useForceSync';
import { isOutOfStock, isLowStock } from '@/types';

export default function DashboardScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { isDarkMode, toggleTheme, colors } = useTheme();
  const { isOnline } = useNetworkStatus();

  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);

  // Auth state
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const forceSync = useForceSync();
  const [isSyncing, setIsSyncing] = useState(false);

  // Server data via React Query
  const { data: items = [], isLoading, error, refetch } = useItems();
  const { data: orders = [] } = useOrders();
  const { data: activityLogs = [] } = useActivities(20);

  const activeItems = useMemo(() => items.filter(i => i.isActive), [items]);
  const outOfStockItems = useMemo(() => activeItems.filter(isOutOfStock), [activeItems]);
  const lowStockItems = useMemo(() => activeItems.filter(isLowStock), [activeItems]);
  const stats = useMemo(() => ({
    totalItems: activeItems.length,
    outOfStockCount: outOfStockItems.length,
    lowStockCount: lowStockItems.length,
    pendingOrdersCount: orders.filter(o => o.status === 'pending' || o.status === 'ordered' || o.status === 'received').length,
  }), [activeItems, outOfStockItems, lowStockItems, orders]);

  // Logout handler
  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            // Router will handle redirect via auth guard in _layout.tsx
          },
        },
      ]
    );
  };

  // Recovery path for cache drift. qc.clear() drops every cached query
  // and the follow-up fetch repopulates from the server, so even if
  // future bugs or migration hiccups leave the client desynced the user
  // can recover without reinstalling or logging out.
  const runRefreshFromServer = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await forceSync();
      Alert.alert(
        'Synced with server',
        `You have ${result.itemCount} items and ${result.categoryCount} categories.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Sync failed', msg);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleHelpAndSupport = () => {
    setShowHelpDialog(true);
  };

  const handleRefreshFromServerFromHelp = () => {
    Alert.alert(
      'Refresh from server?',
      'This reloads all your inventory from your account on the server. Any unsynced local changes will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Refresh', style: 'destructive', onPress: runRefreshFromServer },
      ],
    );
  };

  const scrollToNeedsAttention = () => {
    scrollRef.current?.scrollTo({ y: 300, animated: true });
  };

  // Per-section scroll for the Low Stock card. The old shared handler
  // landed on y: 300, which sits on the Out of Stock sub-card; tapping
  // the Low Stock overview card looked like it did nothing because the
  // user was already seeing Out of Stock. Now NeedsAttention reports
  // the Low Stock card's y-within-its-parent via onLowStockLayout, and
  // a wrapper around NeedsAttention reports NeedsAttention's own y in
  // the scroll content. Summing the two gives a scroll offset that
  // lands on the Low Stock card. Falls back to the old y: 300 if the
  // layout callbacks haven't fired yet (first render before layout).
  const lowStockYRef = useRef<number | null>(null);
  const needsAttentionYRef = useRef<number | null>(null);

  const scrollToLowStock = () => {
    if (lowStockYRef.current != null && needsAttentionYRef.current != null) {
      scrollRef.current?.scrollTo({
        y: needsAttentionYRef.current + lowStockYRef.current,
        animated: true,
      });
    } else {
      scrollRef.current?.scrollTo({ y: 300, animated: true });
    }
  };

  const handleExport = () => {
    setShowExportModal(true);
  };

  const handleAddItem = () => {
    router.push('/item/new');
  };

  const dynamicStyles = createDynamicStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* Top Bar */}
      <VitalTrackTopBar
        onExportClick={handleExport}
        onAddItemClick={handleAddItem}
        onProfileClick={() => setShowProfileSheet(true)}
        userName={user?.name || 'User'}
      />

      <ConnectionStatusPill />

      {isLoading ? (
        <SkeletonLoader variant="dashboard" />
      ) : error && items.length === 0 ? (
        // Only show the hard error screen when we have NOTHING to display.
        // If items are cached (even stale), fall through to render the
        // dashboard and let the "offline — showing last synced data" row
        // explain the freshness state.
        <View style={styles.loadingContainer}>
          <Text style={[styles.errorText, { color: colors.statusRed }]}>
            {isOnline ? 'Failed to load data' : "You're offline and no cached data is available"}
          </Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryButton, { backgroundColor: colors.accentBlue }]}>
            <Text style={{ color: colors.white }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <>
      {!isOnline && items.length > 0 && (
        <Text style={[styles.lastSyncedText, { color: colors.textMuted }]}>
          You're offline — showing last synced data
        </Text>
      )}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Build Inventory Button */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Overview</Text>
          <TouchableOpacity
            style={[dynamicStyles.buildButton, { borderColor: colors.accentBlue }]}
            onPress={() => router.push('/builder' as any)}
          >
            <Ionicons name="construct-outline" size={16} color={colors.accentBlue} />
            <Text style={[styles.buildButtonText, { color: colors.accentBlue }]}>Build Inventory</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatsCard
              title="Total Items"
              value={stats.totalItems}
              icon="cube-outline"
              iconColor={colors.accentBlue}
              iconBgColor={colors.accentBlueBg}
              onPress={() => router.push('/inventory')}
            />
            <StatsCard
              title="Out of Stock"
              value={stats.outOfStockCount}
              subtitle={stats.outOfStockCount > 0 ? 'Critical' : undefined}
              icon="alert-circle-outline"
              iconColor={colors.statusRed}
              iconBgColor={colors.statusRedBg}
              trend={stats.outOfStockCount > 0 ? `+${stats.outOfStockCount}` : undefined}
              onPress={scrollToNeedsAttention}
            />
          </View>
          <View style={styles.statsRow}>
            <StatsCard
              title="Low Stock"
              value={stats.lowStockCount}
              subtitle={stats.lowStockCount > 0 ? 'Reorder' : undefined}
              icon="warning-outline"
              iconColor={colors.statusOrange}
              iconBgColor={colors.statusOrangeBg}
              onPress={scrollToLowStock}
            />
            <StatsCard
              title="Pending Orders"
              value={stats.pendingOrdersCount}
              icon="cart-outline"
              iconColor={colors.accentBlue}
              iconBgColor={colors.accentBlueBg}
              onPress={() => router.push('/orders')}
            />
          </View>
        </View>

        {/* Needs Attention Section — wrapped so we can measure its y in the
            scroll content and combine it with the Low Stock card's
            within-parent y for accurate section-level scrolling. */}
        <View
          onLayout={(e) => {
            needsAttentionYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <NeedsAttention
            outOfStockItems={outOfStockItems}
            lowStockItems={lowStockItems}
            onOrderNow={() => router.push('/order/create')}
            onEditItem={(itemId) => router.push(`/item/${itemId}`)}
            onViewAll={() => router.push('/inventory')}
            onEmergencyOrder={() => {
              // In a real app, we might pass specific critical items to order
              // For now, we direct to Create Order where user can select them
              router.push('/order/create');
            }}
            onLowStockLayout={(y) => {
              lowStockYRef.current = y;
            }}
          />
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Recent Activity</Text>
          <ActivityList activities={activityLogs} />
        </View>
      </ScrollView>
      </>
      )}

      {/* Profile Menu Sheet */}
      <ProfileMenuSheet
        visible={showProfileSheet}
        onDismiss={() => setShowProfileSheet(false)}
        userName={user?.name || 'User'}
        userEmail={user?.email || user?.username || 'Not signed in'}
        isDarkTheme={isDarkMode}
        onThemeToggle={toggleTheme}
        onEditProfile={() => router.push('/profile')}
        onSettings={() => Alert.alert('Settings', 'Settings screen coming soon')}
        onAbout={() => Alert.alert('About CareKosh', 'CareKosh helps family caregivers manage critical medical supplies at home.\n\nDesigned for families caring for loved ones with ALS, MND, stroke recovery, and other conditions requiring home ICU setups.')}
        onHelp={handleHelpAndSupport}
        onLogout={handleLogout}
      />

      {/* Export Modal */}
      <ExportModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
      />

      {/* Help & Support dialog — inline Refresh link + confirmation */}
      <HelpSupportDialog
        visible={showHelpDialog}
        onDismiss={() => setShowHelpDialog(false)}
        onRefreshFromServer={handleRefreshFromServerFromHelp}
      />
    </SafeAreaView>
  );
}

const createDynamicStyles = (colors: any) => StyleSheet.create({
  buildButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  errorText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  scrollView: {
    flex: 1,
  },
  lastSyncedText: {
    fontSize: 12,
    paddingHorizontal: spacing.lg,
    marginTop: 8,
    marginBottom: 8,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 130,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  buildButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  statsGrid: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.md,
  },
});

