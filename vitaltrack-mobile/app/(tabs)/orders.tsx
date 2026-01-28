/**
 * VitalTrack Mobile - Orders Screen
 * List of orders with status tracking
 */

import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/store/useAppStore';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import OrderCard from '@/components/orders/OrderCard';

export default function OrdersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const savedOrders = useAppStore((state) => state.savedOrders);
  const markOrderReceived = useAppStore((state) => state.markOrderReceived);
  const applyOrderToStock = useAppStore((state) => state.applyOrderToStock);
  const deleteOrder = useAppStore((state) => state.deleteOrder);

  const handleMarkReceived = (orderId: string) => {
    Alert.alert(
      'Order Received?',
      'Have you received this order?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Received',
          onPress: () => markOrderReceived(orderId),
        },
      ]
    );
  };

  const handleUpdateStock = (orderId: string) => {
    Alert.alert(
      'Update Stock',
      'This will add the order quantities to your inventory. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update Stock',
          onPress: () => applyOrderToStock(orderId),
        },
      ]
    );
  };

  const handleDeleteOrder = (orderId: string) => {
    Alert.alert(
      'Delete Order',
      'Are you sure you want to remove this order?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteOrder(orderId),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Recent Orders</Text>
          <Text style={[styles.subtitle, { color: colors.textTertiary }]}>Track your orders and stock updates</Text>
        </View>
      </View>

      {/* Content */}
      {savedOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="cart-outline" size={48} color={colors.textTertiary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No orders yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
            Orders will appear here after you create them
          </Text>
          <TouchableOpacity
            style={[styles.emptyButton, { backgroundColor: colors.accentBlue }]}
            onPress={() => router.push('/order/create')}
          >
            <Ionicons name="add" size={20} color={colors.white} />
            <Text style={[styles.emptyButtonText, { color: colors.white }]}>Create Order</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {savedOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onMarkReceived={() => handleMarkReceived(order.id)}
              onUpdateStock={() => handleUpdateStock(order.id)}
              onDelete={() => handleDeleteOrder(order.id)}
            />
          ))}
        </ScrollView>
      )}

      {/* FAB */}
      {savedOrders.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.accentBlue }]}
          onPress={() => router.push('/order/create')}
        >
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: spacing.lg },
  title: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyIconContainer: { marginBottom: spacing.lg },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  emptyButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  scrollView: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: 130,
    gap: spacing.md,
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
