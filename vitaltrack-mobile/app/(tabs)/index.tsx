/**
 * VitalTrack Mobile - Dashboard Screen
 * Shows stats overview, needs attention items, and recent activity
 */

import { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import VitalTrackTopBar from '@/components/common/VitalTrackTopBar';
import ProfileMenuSheet from '@/components/common/ProfileMenuSheet';
import ExportModal from '@/components/common/ExportModal';
import StatsCard from '@/components/dashboard/StatsCard';
import NeedsAttention from '@/components/dashboard/NeedsAttention';
import ActivityList from '@/components/dashboard/ActivityList';

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

  const stats = useAppStore((state) => state.getStats());
  const outOfStockItems = useAppStore((state) => state.getOutOfStockItems());
  const lowStockItems = useAppStore((state) => state.getLowStockItems());
  const activityLogs = useAppStore((state) => state.activityLogs);

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
          <ActivityList activities={activityLogs.slice(0, 20)} />
        </View>
      </ScrollView>

      {/* Profile Menu Sheet */}
      <ProfileMenuSheet
        visible={showProfileSheet}
        onDismiss={() => setShowProfileSheet(false)}
        userName={user?.name || 'User'}
        userEmail={user?.email || user?.username || 'Not signed in'}
        isDarkTheme={isDarkMode}
        onThemeToggle={toggleTheme}
        onSettings={() => Alert.alert('Settings', 'Settings screen coming soon')}
        onAbout={() => Alert.alert('About VitalTrack', 'Version 2.0.0\n\nMedical inventory management for home ICU.')}
        onHelp={() => Alert.alert('Help & Support', 'Contact support@vitaltrack.app for assistance.')}
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

