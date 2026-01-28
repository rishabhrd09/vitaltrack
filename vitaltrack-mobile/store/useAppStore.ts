/**
 * VitalTrack Mobile - Zustand Store
 * Complete state management with AsyncStorage persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Item, Category, ActivityLog, ActivityActionType,
  SavedOrder, OrderItem, OrderStatus, DashboardStats, ExportPayload, Backup
} from '@/types';
import { isLowStock, isOutOfStock } from '@/types';
import { SEED_DATA, ESSENTIAL_ITEM_KEYWORDS } from '@/data/seedData';
import { generateId, now, getTodayDateString, generateOrderId } from '@/utils/helpers';
import { validateCategoryData, validateItemData } from '@/utils/sanitize';

// ============================================================================
// STORE TYPES
// ============================================================================

interface AppState {
  categories: Category[];
  items: Item[];
  activityLogs: ActivityLog[];
  savedOrders: SavedOrder[];
  backups: Backup[];
  isInitialized: boolean;
  searchQuery: string;
  selectedCategoryId: string | null;
  expandedCategories: string[];
  expandedItems: string[];
}

interface AppActions {
  initialize: () => void;

  // Items
  createItem: (data: Partial<Item>) => Item;
  updateItem: (id: string, data: Partial<Item>) => Item | null;
  deleteItem: (id: string) => void;
  updateStock: (id: string, newQuantity: number) => Item | null;
  toggleItemCritical: (id: string) => void;
  getItemById: (id: string) => Item | undefined;

  // Categories
  createCategory: (data: Partial<Category>) => Category;
  updateCategory: (id: string, data: Partial<Category>) => Category | null;
  deleteCategory: (id: string) => void;
  getCategoryById: (id: string) => Category | undefined;

  // UI State
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (id: string | null) => void;
  toggleCategoryExpand: (id: string) => void;
  toggleItemExpand: (id: string) => void;
  expandAllCategories: () => void;
  collapseAllCategories: () => void;

  // Activity
  logActivity: (
    action: ActivityActionType,
    itemName: string,
    details?: string,
    itemId?: string,
    orderId?: string
  ) => void;

  // Orders
  getTodayOrderCount: () => number;
  createOrderId: () => string;
  saveOrder: (items: OrderItem[]) => SavedOrder;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  markOrderReceived: (orderId: string) => void;
  applyOrderToStock: (orderId: string) => void;
  deleteOrder: (orderId: string) => void;
  getOrderById: (orderId: string) => SavedOrder | undefined;

  // Computed Data
  getStats: () => DashboardStats;
  getFilteredItems: () => Item[];
  getActiveItems: () => Item[];
  getLowStockItems: () => Item[];
  getOutOfStockItems: () => Item[];
  getNeedsOrderItems: () => Item[];

  // Data Management
  exportData: () => ExportPayload;
  importData: (data: ExportPayload) => boolean;
  resetToDefaults: () => void;
  startFresh: () => void;
  restoreSeedData: () => void;

  // Backup Management
  createBackup: (name?: string) => Backup;
  getBackups: () => Backup[];
  restoreBackup: (backupId: string) => boolean;
  deleteBackup: (backupId: string) => void;
}

type AppStore = AppState & AppActions;

// ============================================================================
// SEED DATA GENERATOR
// ============================================================================

function createSeedData(): { categories: Category[]; items: Item[] } {
  const categories: Category[] = [];
  const items: Item[] = [];
  const timestamp = now();

  SEED_DATA.forEach((seedCat, index) => {
    const categoryId = generateId();

    categories.push({
      id: categoryId,
      name: seedCat.name,
      description: seedCat.description,
      displayOrder: index,
      isDefault: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    seedCat.items.forEach((seedItem) => {
      items.push({
        id: generateId(),
        categoryId,
        name: seedItem.name,
        description: seedItem.description,
        quantity: 0,
        unit: seedItem.unit,
        minimumStock: seedItem.minimumStock,
        isActive: true,
        isCritical: seedItem.name.toLowerCase().includes('ventilator') ||
          seedItem.name.toLowerCase().includes('bipap') ||
          seedItem.name.toLowerCase().includes('oxygen') ||
          seedItem.name.toLowerCase().includes('ambu') ||
          seedItem.name.toLowerCase().includes('suction') ||
          seedItem.name.toLowerCase().includes('nebulizer') ||
          seedItem.name.toLowerCase().includes('tube') ||
          seedItem.name.toLowerCase().includes('catheter mount'),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
  });

  return { categories, items };
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Initial State
      categories: [],
      items: [],
      activityLogs: [],
      savedOrders: [],
      backups: [],
      isInitialized: false,
      searchQuery: '',
      selectedCategoryId: null,
      expandedCategories: [],
      expandedItems: [],

      // =====================================================================
      // INITIALIZATION
      // =====================================================================

      initialize: () => {
        const { categories, items, isInitialized } = get();

        // AUTO-FIX: Detect duplication anomaly (User reported ~60 items vs 31 expected)
        // If we have significantly more items than the seed data (31), it's likely a duplication bug from development.
        if (items.length > 50) {
          console.log('Detected data anomaly (duplicate items). Auto-resetting to clean state.');
          get().resetToDefaults();
          return;
        }

        if (isInitialized && categories.length > 0) return;

        if (categories.length === 0) {
          const { categories: seedCats, items: seedItems } = createSeedData();
          set({
            categories: seedCats,
            items: seedItems,
            expandedCategories: seedCats.map(c => c.id),
            isInitialized: true,
          });
        } else {
          set({
            isInitialized: true,
            expandedCategories: get().categories.map(c => c.id),
          });
        }
      },

      // =====================================================================
      // ITEM OPERATIONS
      // =====================================================================

      createItem: (data) => {
        const item: Item = {
          id: generateId(),
          categoryId: data.categoryId || '',
          name: data.name || 'New Item',
          description: data.description,
          quantity: data.quantity ?? 0,
          unit: data.unit || 'pieces',
          minimumStock: data.minimumStock ?? 0,
          expiryDate: data.expiryDate,
          brand: data.brand,
          notes: data.notes,
          supplierName: data.supplierName,
          supplierContact: data.supplierContact,
          imageUri: data.imageUri,
          isActive: true,
          isCritical: data.isCritical || false,
          createdAt: now(),
          updatedAt: now(),
        };

        set((state) => ({ items: [...state.items, item] }));
        get().logActivity('item_create', item.name, `Created with ${item.quantity} ${item.unit}`, item.id);
        return item;
      },

      updateItem: (id, data) => {
        const { items } = get();
        const oldItem = items.find((i) => i.id === id);

        if (!oldItem) return null;

        const updated: Item = { ...oldItem, ...data, updatedAt: now() };

        set((state) => ({
          items: state.items.map((item) => (item.id === id ? updated : item)),
        }));

        const changes: string[] = [];
        if (data.name && data.name !== oldItem.name) changes.push(`Name: ${oldItem.name} → ${data.name}`);
        if (data.quantity !== undefined && data.quantity !== oldItem.quantity)
          changes.push(`Qty: ${oldItem.quantity} → ${data.quantity}`);
        if (data.minimumStock !== undefined && data.minimumStock !== oldItem.minimumStock)
          changes.push(`Min: ${oldItem.minimumStock} → ${data.minimumStock}`);

        get().logActivity('item_update', updated.name, changes.join(', ') || 'Updated', id);

        return updated;
      },

      deleteItem: (id) => {
        const item = get().items.find((i) => i.id === id);
        if (item) {
          set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
          get().logActivity('item_delete', item.name, 'Deleted');
        }
      },

      updateStock: (id, newQuantity) => {
        const { items } = get();
        const item = items.find((i) => i.id === id);

        if (!item) return null;

        const oldQty = item.quantity;
        const updated: Item = { ...item, quantity: newQuantity, updatedAt: now() };

        set((state) => ({
          items: state.items.map((i) => (i.id === id ? updated : i)),
        }));

        const diff = newQuantity - oldQty;
        const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
        get().logActivity('stock_update', item.name, `${oldQty} → ${newQuantity} (${diffStr})`, id);

        return updated;
      },

      getItemById: (id) => get().items.find((i) => i.id === id),

      toggleItemCritical: (id) => {
        const { items } = get();
        const item = items.find((i) => i.id === id);
        if (item) {
          const updated = { ...item, isCritical: !item.isCritical, updatedAt: now() };
          set((state) => ({
            items: state.items.map((i) => (i.id === id ? updated : i)),
          }));
          get().logActivity('item_update', item.name, `Critical: ${!item.isCritical}`, id);
        }
      },

      // =====================================================================
      // CATEGORY OPERATIONS
      // =====================================================================

      createCategory: (data) => {
        const category: Category = {
          id: generateId(),
          name: data.name || 'New Category',
          description: data.description,
          displayOrder: get().categories.length,
          isDefault: false,
          createdAt: now(),
          updatedAt: now(),
        };

        set((state) => ({
          categories: [...state.categories, category],
          expandedCategories: [...state.expandedCategories, category.id],
        }));

        return category;
      },

      updateCategory: (id, data) => {
        const { categories } = get();
        const oldCat = categories.find((c) => c.id === id);

        if (!oldCat) return null;

        const updated: Category = { ...oldCat, ...data, updatedAt: now() };

        set((state) => ({
          categories: state.categories.map((cat) => (cat.id === id ? updated : cat)),
        }));

        return updated;
      },

      deleteCategory: (id) => {
        set((state) => ({
          categories: state.categories.filter((c) => c.id !== id),
          items: state.items.filter((i) => i.categoryId !== id),
          expandedCategories: state.expandedCategories.filter((cid) => cid !== id),
        }));
      },

      getCategoryById: (id) => get().categories.find((c) => c.id === id),

      // =====================================================================
      // UI STATE
      // =====================================================================

      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedCategory: (id) => set({ selectedCategoryId: id }),

      toggleCategoryExpand: (id) => {
        set((state) => ({
          expandedCategories: state.expandedCategories.includes(id)
            ? state.expandedCategories.filter((cid) => cid !== id)
            : [...state.expandedCategories, id],
        }));
      },

      toggleItemExpand: (id) => {
        set((state) => ({
          expandedItems: state.expandedItems.includes(id)
            ? state.expandedItems.filter((iid) => iid !== id)
            : [...state.expandedItems, id],
        }));
      },

      expandAllCategories: () => {
        set((state) => ({
          expandedCategories: state.categories.map((c) => c.id),
        }));
      },

      collapseAllCategories: () => set({ expandedCategories: [] }),

      // =====================================================================
      // ACTIVITY LOGGING
      // =====================================================================

      logActivity: (action, itemName, details, itemId, orderId) => {
        const log: ActivityLog = {
          id: generateId(),
          action,
          itemName,
          details,
          itemId,
          orderId,
          timestamp: now(),
        };

        set((state) => ({
          activityLogs: [log, ...state.activityLogs].slice(0, 100), // Keep last 100
        }));
      },

      // =====================================================================
      // ORDER OPERATIONS
      // =====================================================================

      getTodayOrderCount: () => {
        const today = getTodayDateString();
        return get().savedOrders.filter((o) => o.orderId.includes(today)).length;
      },

      createOrderId: () => {
        return generateOrderId(get().getTodayOrderCount());
      },

      saveOrder: (orderItems) => {
        const orderId = get().createOrderId();

        const order: SavedOrder = {
          id: generateId(),
          orderId,
          items: orderItems,
          totalItems: orderItems.length,
          totalUnits: orderItems.reduce((sum, item) => sum + item.quantity, 0),
          status: 'pending',
          exportedAt: now(),
        };

        set((state) => ({
          savedOrders: [order, ...state.savedOrders],
        }));

        get().logActivity(
          'order_created',
          `Order ${orderId}`,
          `${order.totalItems} items, ${order.totalUnits} units`,
          undefined,
          orderId
        );

        return order;
      },

      updateOrderStatus: (orderId, status) => {
        const timestampMap: Record<string, keyof SavedOrder> = {
          ordered: 'orderedAt',
          received: 'receivedAt',
          stock_updated: 'appliedAt',
          declined: 'declinedAt',
        };
        const timestampField = timestampMap[status];

        set((state) => ({
          savedOrders: state.savedOrders.map((o) =>
            o.id === orderId || o.orderId === orderId
              ? {
                ...o,
                status,
                ...(timestampField ? { [timestampField]: now() } : {}),
              }
              : o
          ),
        }));
      },

      markOrderReceived: (orderId) => {
        get().updateOrderStatus(orderId, 'received');
        const order = get().getOrderById(orderId);
        if (order) {
          get().logActivity('order_received', `Order ${order.orderId}`, 'Marked as received', undefined, order.orderId);
        }
      },

      applyOrderToStock: (orderId) => {
        const { savedOrders, items } = get();
        const order = savedOrders.find((o) => o.id === orderId || o.orderId === orderId);

        if (!order || order.status === 'stock_updated') return;

        // Update stock for each item in the order
        const updatedItems = items.map((item) => {
          const orderItem = order.items.find((oi) => oi.itemId === item.id);
          if (orderItem) {
            return { ...item, quantity: item.quantity + orderItem.quantity, updatedAt: now() };
          }
          return item;
        });

        set({ items: updatedItems });
        get().updateOrderStatus(orderId, 'stock_updated');
        get().logActivity(
          'order_applied',
          `Order ${order.orderId}`,
          `Stock updated: +${order.totalUnits} units`,
          undefined,
          order.orderId
        );
      },

      deleteOrder: (orderId) => {
        set((state) => ({
          savedOrders: state.savedOrders.filter((o) => o.id !== orderId && o.orderId !== orderId),
        }));
      },

      getOrderById: (orderId) => {
        return get().savedOrders.find((o) => o.id === orderId || o.orderId === orderId);
      },

      // =====================================================================
      // COMPUTED DATA
      // =====================================================================

      getStats: () => {
        const { items, categories, savedOrders } = get();
        const activeItems = items.filter((i) => i.isActive);

        return {
          totalItems: activeItems.length,
          totalCategories: categories.length,
          lowStockCount: activeItems.filter((i) => isLowStock(i)).length,
          outOfStockCount: activeItems.filter((i) => isOutOfStock(i)).length,
          pendingOrdersCount: savedOrders.filter((o) => o.status === 'pending' || o.status === 'received').length,
        };
      },

      getFilteredItems: () => {
        const { items, searchQuery } = get();
        const activeItems = items.filter((i) => i.isActive);

        if (!searchQuery.trim()) return activeItems;

        const query = searchQuery.toLowerCase();
        return activeItems.filter((item) =>
          item.name.toLowerCase().includes(query) ||
          item.brand?.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
        );
      },

      getActiveItems: () => get().items.filter((i) => i.isActive),

      getLowStockItems: () => {
        return get().items.filter((i) => i.isActive && isLowStock(i));
      },

      getOutOfStockItems: () => {
        return get().items.filter((i) => i.isActive && isOutOfStock(i));
      },

      getNeedsOrderItems: () => {
        return get().items.filter((i) => i.isActive && (isLowStock(i) || isOutOfStock(i)));
      },

      // =====================================================================
      // DATA MANAGEMENT
      // =====================================================================

      exportData: () => {
        const { categories, items, activityLogs, savedOrders, logActivity } = get();
        logActivity('data_export', 'Data Export', `${items.length} items exported`);
        return {
          version: '1.0.0',
          exportedAt: now(),
          categories,
          items,
          activityLogs,
          savedOrders,
        };
      },

      importData: (data) => {
        // Basic structure validation
        if (!data || !Array.isArray(data.categories) || !Array.isArray(data.items)) {
          console.warn('Import failed: Invalid data structure');
          return false;
        }

        // Validate each category
        for (const category of data.categories) {
          if (!validateCategoryData(category)) {
            console.warn('Import failed: Invalid category data', category);
            return false;
          }
        }

        // Validate each item
        for (const item of data.items) {
          if (!validateItemData(item)) {
            console.warn('Import failed: Invalid item data', item);
            return false;
          }
        }

        set({
          categories: data.categories,
          items: data.items,
          activityLogs: data.activityLogs || [],
          savedOrders: data.savedOrders || [],
          expandedCategories: data.categories.map((c: Category) => c.id),
        });

        get().logActivity('data_import', 'Data Import', `${data.items.length} items imported`);
        return true;
      },

      resetToDefaults: () => {
        const { categories: seedCats, items: seedItems } = createSeedData();
        set({
          categories: seedCats,
          items: seedItems,
          activityLogs: [],
          savedOrders: [],
          searchQuery: '',
          selectedCategoryId: null,
          expandedCategories: seedCats.map((c) => c.id),
          expandedItems: [],
        });
      },

      startFresh: () => {
        const { items, categories } = get();

        // Helper function to check if item is essential
        const isEssential = (name: string) => {
          const lowerName = name.toLowerCase();
          return ESSENTIAL_ITEM_KEYWORDS.some((keyword) => lowerName.includes(keyword));
        };

        // Hide all non-essential items
        const updatedItems = items.map((item) => ({
          ...item,
          isActive: isEssential(item.name),
          updatedAt: now(),
        }));

        set({
          items: updatedItems,
          activityLogs: [],
          savedOrders: [],
          searchQuery: '',
          selectedCategoryId: null,
          expandedCategories: categories.map((c) => c.id),
        });

        get().logActivity('data_reset', 'Start Fresh', 'Non-essential items hidden');
      },

      restoreSeedData: () => {
        const { items } = get();

        // Reactivate all items
        const reactivatedItems = items.map((item) => ({
          ...item,
          isActive: true,
        }));

        set({ items: reactivatedItems });
        get().logActivity('data_restore', 'Restore Data', 'All items reactivated');
      },

      // =====================================================================
      // BACKUP MANAGEMENT
      // =====================================================================

      createBackup: (name?: string) => {
        const { categories, items, activityLogs, savedOrders, backups } = get();

        const backup: Backup = {
          id: generateId(),
          name: name || `Backup ${new Date().toLocaleString()}`,
          createdAt: now(),
          categories: [...categories],
          items: [...items],
          activityLogs: [...activityLogs],
          savedOrders: [...savedOrders],
        };

        // Keep max 3 backups
        const updatedBackups = [backup, ...backups].slice(0, 3);
        set({ backups: updatedBackups });

        get().logActivity('backup_create', backup.name, `Backup with ${items.length} items`);
        return backup;
      },

      getBackups: () => get().backups,

      restoreBackup: (backupId) => {
        const { backups } = get();
        const backup = backups.find((b) => b.id === backupId);

        if (!backup) return false;

        set({
          categories: backup.categories,
          items: backup.items,
          activityLogs: backup.activityLogs,
          savedOrders: backup.savedOrders,
          expandedCategories: backup.categories.map((c) => c.id),
        });

        get().logActivity('backup_restore', backup.name, `Restored ${backup.items.length} items`);
        return true;
      },

      deleteBackup: (backupId) => {
        set((state) => ({
          backups: state.backups.filter((b) => b.id !== backupId),
        }));
      },
    }),
    {
      name: 'vitaltrack-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        categories: state.categories,
        items: state.items,
        activityLogs: state.activityLogs,
        savedOrders: state.savedOrders,
        backups: state.backups,
        isInitialized: state.isInitialized,
        expandedCategories: state.expandedCategories,
      }),
    }
  )
);
