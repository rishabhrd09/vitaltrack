/**
 * VitalTrack Mobile - Dashboard Screen
 * Shows stats overview, needs attention items, and recent activity
 */

import { useState, useRef, useMemo } from 'react';
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
import ProfileMenuSheet from '@/components/common/ProfileMenuSheet';
import ExportModal from '@/components/common/ExportModal';
import StatsCard from '@/components/dashboard/StatsCard';
import NeedsAttention from '@/components/dashboard/NeedsAttention';
import ActivityList from '@/components/dashboard/ActivityList';
import OfflineBanner from '@/components/common/OfflineBanner';
import { SkeletonLoader } from '@/components/common/SkeletonLoader';
import { useItems, useOrders, useActivities } from '@/hooks/useServerData';
import { useForceSync } from '@/hooks/useForceSync';
import { isOutOfStock, isLowStock } from '@/types';

export default function DashboardScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { isDarkMode, toggleTheme, colors } = useTheme();

  const [searchQuery, setSearchQuery] = useState('');
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

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
    Alert.alert(
      'Help & Support',
      'Contact support@carekosh.com for assistance.\n\nIf your inventory looks out of sync, use Refresh from server to reload everything from your account.',
      [
        {
          text: 'Refresh from server',
          onPress: () => {
            Alert.alert(
              'Refresh from server?',
              'This will discard any unsaved changes and reload your inventory from the server. Continue?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Refresh', onPress: runRefreshFromServer },
              ],
            );
          },
        },
        { text: 'OK', style: 'cancel' },
      ],
    );
  };

  const scrollToNeedsAttention = () => {
    scrollRef.current?.scrollTo({ y: 300, animated: true });
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
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onExportClick={handleExport}
        onAddItemClick={handleAddItem}
        onProfileClick={() => setShowProfileSheet(true)}
        userName={user?.name || 'User'}
      />

      <OfflineBanner />

      {isLoading ? (
        <SkeletonLoader variant="dashboard" />
      ) : error ? (
        <View style={styles.loadingContainer}>
          <Text style={[styles.errorText, { color: colors.statusRed }]}>Failed to load data</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryButton, { backgroundColor: colors.accentBlue }]}>
            <Text style={{ color: colors.white }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
              onPress={scrollToNeedsAttention}
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

        {/* Needs Attention Section */}
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
        />

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Recent Activity</Text>
          <ActivityList activities={activityLogs} />
        </View>
      </ScrollView>
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

