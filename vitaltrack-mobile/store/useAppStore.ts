/**
 * VitalTrack Mobile - Zustand Store
 * FIXED VERSION 3.0 - Complete data management with proper null safety
 * 
 * CRITICAL FIXES:
 * 1. All filter operations now use isValidItem() check
 * 2. SavedOrder uses createdAt field (matches interface)
 * 3. getStats() has bulletproof null safety
 * 4. clearStore() properly clears AsyncStorage
 * 5. loadUserData() handles API errors gracefully
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Item, Category, ActivityLog, ActivityActionType,
  SavedOrder, OrderItem, OrderStatus, DashboardStats, ExportPayload, Backup
} from '@/types';
import { isLowStock, isOutOfStock, isValidItem } from '@/types';
import { SEED_DATA, ESSENTIAL_ITEM_KEYWORDS } from '@/data/seedData';
import { generateId, now, getTodayDateString, generateOrderId } from '@/utils/helpers';
import { validateCategoryData, validateItemData } from '@/utils/sanitize';

// ============================================================================
// STORAGE KEY CONSTANTS
// ============================================================================

const STORAGE_KEYS = {
  APP_STORE: 'vitaltrack-storage',
  AUTH_STORE: 'vitaltrack-auth',
  SYNC_QUEUE: 'vitaltrack_sync_queue',
  ACTIVITY_LOGS_PREFIX: 'vitaltrack_activity_',  // Per-user activity logs
};

/**
 * Get activity logs storage key for a specific user
 */
function getActivityLogsKey(userId: string): string {
  return `${STORAGE_KEYS.ACTIVITY_LOGS_PREFIX}${userId}`;
}

/**
 * Save activity logs for a specific user
 * Called whenever activity logs change
 */
export async function saveUserActivityLogs(userId: string, logs: ActivityLog[]): Promise<void> {
  if (!userId) return;
  try {
    const key = getActivityLogsKey(userId);
    // Keep only the last 100 activity logs to avoid storage bloat
    const logsToSave = logs.slice(0, 100);
    await AsyncStorage.setItem(key, JSON.stringify(logsToSave));
    console.log(`[ActivityLogs] Saved ${logsToSave.length} logs for user ${userId.slice(0, 8)}...`);
  } catch (error) {
    console.error('[ActivityLogs] Failed to save activity logs:', error);
  }
}

/**
 * Load activity logs for a specific user
 * Called when user logs in
 */
export async function loadUserActivityLogs(userId: string): Promise<ActivityLog[]> {
  if (!userId) return [];
  try {
    const key = getActivityLogsKey(userId);
    const data = await AsyncStorage.getItem(key);
    if (data) {
      const logs = JSON.parse(data) as ActivityLog[];
      console.log(`[ActivityLogs] Loaded ${logs.length} logs for user ${userId.slice(0, 8)}...`);
      return logs;
    }
  } catch (error) {
    console.error('[ActivityLogs] Failed to load activity logs:', error);
  }
  return [];
}

/**
 * Clear ALL user data from AsyncStorage
 */
export async function clearAllUserData(): Promise<void> {
  console.log('[DataIsolation] Clearing all user data from AsyncStorage...');
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.APP_STORE,
      STORAGE_KEYS.SYNC_QUEUE,
    ]);
    console.log('[DataIsolation] AsyncStorage cleared successfully');
  } catch (error) {
    console.error('[DataIsolation] Failed to clear AsyncStorage:', error);
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.APP_STORE);
      await AsyncStorage.removeItem(STORAGE_KEYS.SYNC_QUEUE);
    } catch (e) {
      console.error('[DataIsolation] Fallback clear also failed:', e);
    }
  }
}

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
  currentUserId: string | null;
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

  // Data Isolation
  clearStore: () => Promise<void>;
  loadUserData: (userId: string) => Promise<boolean>;
  syncToBackend: () => Promise<boolean>;
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
      const itemName = seedItem.name.toLowerCase();
      items.push({
        id: generateId(),
        categoryId,
        name: seedItem.name,
        description: seedItem.description,
        quantity: 0,
        unit: seedItem.unit,
        minimumStock: seedItem.minimumStock,
        isActive: true,
        isCritical: itemName.includes('ventilator') ||
          itemName.includes('bipap') ||
          itemName.includes('oxygen') ||
          itemName.includes('ambu') ||
          itemName.includes('suction') ||
          itemName.includes('nebulizer') ||
          itemName.includes('tube') ||
          itemName.includes('catheter mount'),
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
      currentUserId: null,

      // =====================================================================
      // INITIALIZATION
      // =====================================================================

      initialize: () => {
        const { categories, items, isInitialized } = get();

        // AUTO-FIX: Detect duplication anomaly
        if (items.length > 50) {
          console.log('[Store] Detected data anomaly. Auto-resetting.');
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
        const id = generateId();
        const item: Item = {
          id,
          localId: id,  // CRITICAL: Set localId = id for sync matching
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
          purchaseLink: data.purchaseLink,
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
        if (data.name && data.name !== oldItem.name) changes.push(`name to ${data.name}`);
        if (data.quantity !== undefined && data.quantity !== oldItem.quantity) {
          changes.push(`qty ${oldItem.quantity}→${data.quantity}`);
        }

        get().logActivity(
          'item_update',
          updated.name,
          changes.length > 0 ? changes.join(', ') : 'Updated',
          id
        );

        return updated;
      },

      deleteItem: (id) => {
        const item = get().items.find((i) => i.id === id);
        if (!item) return;

        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        }));

        get().logActivity('item_delete', item.name, 'Deleted', id);
      },

      updateStock: (id, newQuantity) => {
        const { items } = get();
        const item = items.find((i) => i.id === id);

        if (!item) return null;

        const updated: Item = { ...item, quantity: newQuantity, updatedAt: now() };

        set((state) => ({
          items: state.items.map((i) => (i.id === id ? updated : i)),
        }));

        get().logActivity(
          'stock_update',
          item.name,
          `Stock: ${item.quantity} → ${newQuantity}`,
          id
        );

        return updated;
      },

      toggleItemCritical: (id) => {
        const item = get().items.find((i) => i.id === id);
        if (!item) return;

        get().updateItem(id, { isCritical: !item.isCritical });
      },

      getItemById: (id) => get().items.find((i) => i.id === id),

      // =====================================================================
      // CATEGORY OPERATIONS
      // =====================================================================

      createCategory: (data) => {
        const { categories } = get();
        const category: Category = {
          id: generateId(),
          name: data.name || 'New Category',
          description: data.description,
          displayOrder: categories.length,
          isDefault: false,
          createdAt: now(),
          updatedAt: now(),
        };

        set((state) => ({
          categories: [...state.categories, category],
          expandedCategories: [...state.expandedCategories, category.id],
        }));

        get().logActivity('category_create', category.name, 'Created');
        return category;
      },

      updateCategory: (id, data) => {
        const category = get().categories.find((c) => c.id === id);
        if (!category) return null;

        const updated: Category = { ...category, ...data, updatedAt: now() };

        set((state) => ({
          categories: state.categories.map((c) => (c.id === id ? updated : c)),
        }));

        return updated;
      },

      deleteCategory: (id) => {
        const category = get().categories.find((c) => c.id === id);
        if (!category) return;

        set((state) => ({
          categories: state.categories.filter((c) => c.id !== id),
          items: state.items.filter((i) => i.categoryId !== id),
          expandedCategories: state.expandedCategories.filter((cid) => cid !== id),
        }));

        get().logActivity('category_delete', category.name, 'Deleted');
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
        const activity: ActivityLog = {
          id: generateId(),
          action,
          itemName,
          details,
          itemId,
          orderId,
          timestamp: now(),
        };

        const { currentUserId } = get();
        
        set((state) => {
          const newLogs = [activity, ...state.activityLogs].slice(0, 100);
          
          // Persist activity logs to AsyncStorage for this user
          if (currentUserId) {
            saveUserActivityLogs(currentUserId, newLogs).catch(err => 
              console.warn('[ActivityLogs] Failed to persist:', err)
            );
          }
          
          return { activityLogs: newLogs };
        });
      },

      // =====================================================================
      // ORDER OPERATIONS
      // =====================================================================

      getTodayOrderCount: () => {
        const today = getTodayDateString();
        return get().savedOrders.filter(
          (order) => order.createdAt && order.createdAt.startsWith(today)
        ).length;
      },

      createOrderId: () => {
        const count = get().getTodayOrderCount();
        return generateOrderId(count);
      },

      saveOrder: (items) => {
        const orderId = get().createOrderId();
        const timestamp = now();

        const order: SavedOrder = {
          id: generateId(),
          orderId,
          items,
          totalItems: items.length,
          totalUnits: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
          status: 'pending',
          createdAt: timestamp,
          exportedAt: timestamp,
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
        set((state) => ({
          savedOrders: state.savedOrders.map((order) => {
            if (order.id === orderId || order.orderId === orderId) {
              const updates: Partial<SavedOrder> = { status };
              if (status === 'ordered') updates.orderedAt = now();
              if (status === 'received') updates.receivedAt = now();
              if (status === 'stock_updated') updates.appliedAt = now();
              if (status === 'declined') updates.declinedAt = now();
              return { ...order, ...updates };
            }
            return order;
          }),
        }));
      },

      markOrderReceived: (orderId) => {
        get().updateOrderStatus(orderId, 'received');
        const order = get().getOrderById(orderId);
        if (order) {
          get().logActivity(
            'order_received',
            `Order ${order.orderId}`,
            'Marked as received',
            undefined,
            order.orderId
          );
        }
      },

      applyOrderToStock: (orderId) => {
        const order = get().getOrderById(orderId);
        if (!order) return;

        const { items } = get();
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
      // COMPUTED DATA - FIXED: Bulletproof null safety
      // =====================================================================

      getStats: () => {
        const { items, categories, savedOrders } = get();

        // FIXED: Filter out any invalid items before processing
        const validItems = (items || []).filter(item => isValidItem(item));
        const activeItems = validItems.filter((i) => i.isActive === true);

        return {
          totalItems: activeItems.length,
          totalCategories: (categories || []).length,
          lowStockCount: activeItems.filter((i) => isLowStock(i)).length,
          outOfStockCount: activeItems.filter((i) => isOutOfStock(i)).length,
          pendingOrdersCount: (savedOrders || []).filter((o) => o.status === 'pending' || o.status === 'received').length,
        };
      },

      getFilteredItems: () => {
        const { items, searchQuery } = get();
        const validItems = (items || []).filter(item => isValidItem(item));
        const activeItems = validItems.filter((i) => i.isActive === true);

        if (!searchQuery || !searchQuery.trim()) return activeItems;

        const query = searchQuery.toLowerCase();
        return activeItems.filter((item) =>
          (item.name && item.name.toLowerCase().includes(query)) ||
          (item.brand && item.brand.toLowerCase().includes(query)) ||
          (item.description && item.description.toLowerCase().includes(query))
        );
      },

      getActiveItems: () => {
        const { items } = get();
        return (items || []).filter((i) => isValidItem(i) && i.isActive === true);
      },

      getLowStockItems: () => {
        const { items } = get();
        return (items || []).filter((i) => isValidItem(i) && i.isActive === true && isLowStock(i));
      },

      getOutOfStockItems: () => {
        const { items } = get();
        return (items || []).filter((i) => isValidItem(i) && i.isActive === true && isOutOfStock(i));
      },

      getNeedsOrderItems: () => {
        const { items } = get();
        return (items || []).filter((i) => isValidItem(i) && i.isActive === true && (isLowStock(i) || isOutOfStock(i)));
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
        if (!data || !Array.isArray(data.categories) || !Array.isArray(data.items)) {
          console.warn('Import failed: Invalid data structure');
          return false;
        }

        for (const category of data.categories) {
          if (!validateCategoryData(category)) {
            console.warn('Import failed: Invalid category data', category);
            return false;
          }
        }

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

        const isEssential = (name: string) => {
          if (!name) return false;
          const lowerName = name.toLowerCase();
          return ESSENTIAL_ITEM_KEYWORDS.some((keyword) => lowerName.includes(keyword));
        };

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

      // =====================================================================
      // DATA ISOLATION
      // =====================================================================

      clearStore: async () => {
        console.log('[DataIsolation] clearStore called - clearing ALL user data');

        set({
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
          currentUserId: null,
        });

        await clearAllUserData();
        console.log('[DataIsolation] Store and AsyncStorage cleared successfully');
      },

      loadUserData: async (userId: string) => {
        console.log(`[DataIsolation] loadUserData called for user: ${userId}`);

        try {
          const { currentUserId } = get();

          if (currentUserId && currentUserId !== userId) {
            console.log('[DataIsolation] Different user detected - clearing old data');
            await get().clearStore();
          }

          await clearAllUserData();

          // FIXED: Load activity logs for this user BEFORE clearing the store
          const savedActivityLogs = await loadUserActivityLogs(userId);
          console.log(`[DataIsolation] Restored ${savedActivityLogs.length} activity logs for user`);

          set({
            categories: [],
            items: [],
            activityLogs: savedActivityLogs,  // FIXED: Restore activity logs
            savedOrders: [],
            backups: [],
            isInitialized: false,
            currentUserId: userId,
          });

          const { syncService, isOnline } = await import('@/services/sync');
          const online = await isOnline();

          if (!online) {
            console.log('[DataIsolation] Offline: Seeding with default data');
            const { categories: seedCats, items: seedItems } = createSeedData();
            set({
              categories: seedCats,
              items: seedItems,
              activityLogs: savedActivityLogs,  // Preserve activity logs
              expandedCategories: seedCats.map(c => c.id),
              isInitialized: true,
              currentUserId: userId,
            });
            return false;
          }

          console.log('[DataIsolation] Fetching user data from backend...');
          const pulled = await syncService.pull();

          if (pulled.categories.length > 0 || pulled.items.length > 0) {
            // CRITICAL: Preserve localId from server for sync matching
            const categoriesWithLocalId = pulled.categories.map(cat => ({
              ...cat,
              localId: cat.localId || cat.id,
            }));
            const itemsWithLocalId = pulled.items.map(item => ({
              ...item,
              localId: item.localId || item.id,
            }));
            const ordersWithLocalId = (pulled.orders || []).map(order => ({
              ...order,
              localId: order.localId || order.id,
              items: order.items || [],
            }));

            console.log(`[DataIsolation] Loaded: ${categoriesWithLocalId.length} categories, ${itemsWithLocalId.length} items, ${ordersWithLocalId.length} orders`);
            set({
              categories: categoriesWithLocalId,
              items: itemsWithLocalId,
              savedOrders: ordersWithLocalId,
              activityLogs: savedActivityLogs,  // FIXED: Preserve activity logs
              expandedCategories: categoriesWithLocalId.map(c => c.id),
              isInitialized: true,
              currentUserId: userId,
            });
          } else {
            console.log('[DataIsolation] New user - seeding with default data');
            const { categories: seedCats, items: seedItems } = createSeedData();
            set({
              categories: seedCats,
              items: seedItems,
              activityLogs: savedActivityLogs,  // FIXED: Preserve activity logs
              expandedCategories: seedCats.map(c => c.id),
              isInitialized: true,
              currentUserId: userId,
            });

            try {
              await syncService.push({
                categories: { created: seedCats },
                items: { created: seedItems },
              });
              console.log('[DataIsolation] Seed data pushed to backend');
            } catch (pushErr) {
              console.warn('[DataIsolation] Failed to push seed data:', pushErr);
            }
          }

          return true;
        } catch (error) {
          console.error('[DataIsolation] Failed to load user data:', error);

          // FIXED: Try to load activity logs even on error
          const savedActivityLogs = await loadUserActivityLogs(userId);
          
          const { categories: seedCats, items: seedItems } = createSeedData();
          set({
            categories: seedCats,
            items: seedItems,
            activityLogs: savedActivityLogs,  // Preserve activity logs on error too
            expandedCategories: seedCats.map(c => c.id),
            isInitialized: true,
            currentUserId: userId,
          });
          return false;
        }
      },

      // =====================================================================
      // SYNC TO BACKEND - Push all local changes before logout
      // =====================================================================

      syncToBackend: async () => {
        console.log('[Sync] syncToBackend: Pushing all local data to backend...');

        try {
          const { syncService, isOnline } = await import('@/services/sync');
          const online = await isOnline();

          if (!online) {
            console.log('[Sync] syncToBackend: Offline - skipping sync');
            return false;
          }

          const { categories, items, savedOrders } = get();

          if (categories.length === 0 && items.length === 0) {
            console.log('[Sync] syncToBackend: No data to sync');
            return true;
          }

          // Push all current data - backend uses UPSERT to update existing records
          // Using 'created' ensures all fields are sent (including quantity!)
          await syncService.push({
            categories: { created: categories },
            items: { created: items },
            orders: { created: savedOrders },
          });

          console.log(`[Sync] syncToBackend: Complete - ${categories.length} categories, ${items.length} items, ${savedOrders.length} orders`);
          return true;
        } catch (error) {
          console.error('[Sync] syncToBackend: Failed:', error);
          return false;
        }
      },
    }),
    {
      name: STORAGE_KEYS.APP_STORE,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        categories: state.categories,
        items: state.items,
        activityLogs: state.activityLogs,
        savedOrders: state.savedOrders,
        backups: state.backups,
        isInitialized: state.isInitialized,
        expandedCategories: state.expandedCategories,
        currentUserId: state.currentUserId,
      }),
    }
  )
);
