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
// DEBOUNCED AUTO-SYNC — pushes changes to server after mutations
// ============================================================================

let _syncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a background sync after data changes.
 * Debounced to 5 seconds — multiple rapid edits only trigger one sync.
 * This ensures brand, supplier, links etc. persist to the server
 * even if the user closes the app without logging out.
 * 
 * CRITICAL FIX: Only syncs when isInitialSyncComplete is true.
 * This prevents stale persisted data from being pushed to server
 * before fresh data has been fetched on login/app restart.
 */
function scheduleSyncToBackend() {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    try {
      const { useAppStore } = await import('./useAppStore');
      const store = useAppStore.getState();

      // CRITICAL GUARD: Never sync before initial server fetch completes
      if (!store.isInitialSyncComplete) {
        console.log('[AutoSync] Skipped — initial sync not yet complete');
        return;
      }

      if (store.isInitialized && store.currentUserId) {
        await store.syncToBackend();
        console.log('[AutoSync] Background sync completed');
      }
    } catch (err) {
      console.warn('[AutoSync] Background sync failed:', err);
    }
  }, 5000);
}

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
  isInitialSyncComplete: boolean;  // CRITICAL: Guards sync — false until server data loaded
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
      isInitialSyncComplete: false,  // CRITICAL: Must start false — set true after server fetch
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

        // Optimistic local update — instant UI
        set((state) => ({ items: [...state.items, item] }));
        get().logActivity('item_create', item.name, `Created with ${item.quantity} ${item.unit}`, item.id);

        // FIX: Immediately push to server (hybrid approach)
        // Don't rely on debounced sync — push right away if online
        if (get().isInitialSyncComplete) {
          (async () => {
            try {
              const { syncService, isOnline } = await import('@/services/sync');
              const online = await isOnline();
              if (online) {
                await syncService.push({
                  items: { created: [item] },
                });
                console.log(`[CreateItem] Pushed "${item.name}" to server immediately`);
              } else {
                // Queue for later sync
                const { syncQueue } = await import('@/services/sync');
                const op = {
                  id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  type: 'create' as const,
                  entity: 'item' as const,
                  entityId: item.id,
                  localId: item.localId || item.id,
                  data: { ...item },
                  timestamp: new Date().toISOString(),
                };
                await syncQueue.addOperation(op);
                console.log(`[CreateItem] Offline — queued "${item.name}" for sync`);
              }
            } catch (err) {
              console.warn(`[CreateItem] Server push failed for "${item.name}", will retry via auto-sync:`, err);
              scheduleSyncToBackend();
            }
          })();
        }

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

        scheduleSyncToBackend();
        return updated;
      },

      deleteItem: (id) => {
        const item = get().items.find((i) => i.id === id);
        if (!item) return;

        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        }));

        get().logActivity('item_delete', item.name, 'Deleted', id);
        scheduleSyncToBackend();
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

        scheduleSyncToBackend();
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
        scheduleSyncToBackend();
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
        scheduleSyncToBackend();
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
        const todayStr = new Date().toISOString().slice(0, 10); // "2026-03-26"
        return get().savedOrders.filter(
          (order) => order.createdAt && order.createdAt.startsWith(todayStr)
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
        const updatedItemsList: Item[] = [];
        const updatedItems = items.map((item) => {
          const orderItem = order.items.find((oi) => oi.itemId === item.id);
          if (orderItem) {
            const updated = { ...item, quantity: item.quantity + orderItem.quantity, updatedAt: now() };
            updatedItemsList.push(updated);
            return updated;
          }
          return item;
        });

        // Optimistic local update — instant UI
        set({ items: updatedItems });
        get().updateOrderStatus(orderId, 'stock_updated');
        get().logActivity(
          'order_applied',
          `Order ${order.orderId}`,
          `Stock updated: +${order.totalUnits} units`,
          undefined,
          order.orderId
        );

        // FIX: Immediately push stock updates to server
        if (updatedItemsList.length > 0) {
          (async () => {
            try {
              const { syncService, isOnline, syncQueue } = await import('@/services/sync');
              const online = await isOnline();

              if (online) {
                // Push updated items to server immediately
                await syncService.push({
                  items: { updated: updatedItemsList },
                });
                console.log(`[ApplyOrder] Pushed ${updatedItemsList.length} stock updates to server`);
              } else {
                // Queue individual stock updates for retry when online
                for (const updatedItem of updatedItemsList) {
                  const op = {
                    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    type: 'update' as const,
                    entity: 'item' as const,
                    entityId: updatedItem.id,
                    localId: updatedItem.localId || updatedItem.id,
                    data: {
                      quantity: updatedItem.quantity,
                      categoryId: updatedItem.categoryId,
                      name: updatedItem.name,
                      unit: updatedItem.unit,
                      minimumStock: updatedItem.minimumStock,
                      isActive: updatedItem.isActive,
                      isCritical: updatedItem.isCritical,
                    },
                    timestamp: new Date().toISOString(),
                  };
                  await syncQueue.addOperation(op);
                }
                console.log(`[ApplyOrder] Offline — queued ${updatedItemsList.length} stock updates`);
              }
            } catch (err) {
              console.warn('[ApplyOrder] Server push failed, falling back to auto-sync:', err);
              scheduleSyncToBackend();
            }
          })();
        }
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
          isInitialSyncComplete: false,  // CRITICAL: Reset sync guard
          searchQuery: '',
          selectedCategoryId: null,
          expandedCategories: [],
          expandedItems: [],
          currentUserId: null,
        });

        // Clear persisted data AND sync queue
        await clearAllUserData();
        try {
          const { syncQueue } = await import('@/services/sync');
          await syncQueue.clearQueue();
          console.log('[DataIsolation] Sync queue cleared');
        } catch (err) {
          console.warn('[DataIsolation] Failed to clear sync queue:', err);
        }
        console.log('[DataIsolation] Store and AsyncStorage cleared successfully');
      },

      loadUserData: async (userId: string) => {
        console.log(`[DataIsolation] loadUserData called for user: ${userId}`);

        // CRITICAL FIX: Always set isInitialSyncComplete = false at start
        // This prevents stale persisted data from being auto-synced to server
        set({ isInitialSyncComplete: false });

        try {
          const { currentUserId } = get();

          // CRITICAL FIX: Always clear local data before loading from server
          // Previously, same-user re-login preserved stale local state
          // which then got pushed to server, overwriting correct values
          console.log('[DataIsolation] Clearing stale local data before server fetch...');
          set({
            categories: [],
            items: [],
            savedOrders: [],
            isInitialized: false,
            isInitialSyncComplete: false,
            currentUserId: userId,
          });

          // If switching users, also clear AsyncStorage
          if (currentUserId && currentUserId !== userId) {
            console.log('[DataIsolation] Different user detected - clearing persisted data');
            await clearAllUserData();
          }

          const savedActivityLogs = await loadUserActivityLogs(userId);
          console.log(`[DataIsolation] Restored ${savedActivityLogs.length} activity logs for user`);

          set({
            activityLogs: savedActivityLogs,
            currentUserId: userId,
          });

          const { syncService, isOnline } = await import('@/services/sync');
          const online = await isOnline();

          if (!online) {
            console.log('[DataIsolation] Offline: seeding with default data (will fetch from server when online)');
            // When offline, start with seed data — do NOT use stale persisted data
            const { categories: seedCats, items: seedItems } = createSeedData();
            set({
              categories: seedCats,
              items: seedItems,
              expandedCategories: seedCats.map(c => c.id),
              isInitialized: true,
              // NOTE: isInitialSyncComplete stays FALSE while offline
              // This means auto-sync will be blocked even after coming online
              // until a successful server fetch happens
            });
            return false;
          }

          console.log('[DataIsolation] Fetching user data from backend (server is authoritative)...');
          const pulled = await syncService.pull();

          if (pulled.categories.length > 0 || pulled.items.length > 0) {
            // Server has data — use it as source of truth
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

            console.log(`[DataIsolation] Server data loaded: ${categoriesWithLocalId.length} categories, ${itemsWithLocalId.length} items, ${ordersWithLocalId.length} orders`);

            // Log sample quantities for debugging
            const nonZeroItems = itemsWithLocalId.filter(i => i.quantity > 0);
            console.log(`[DataIsolation] Items with non-zero quantity: ${nonZeroItems.length}`);
            if (nonZeroItems.length > 0) {
              nonZeroItems.slice(0, 3).forEach(i => 
                console.log(`[DataIsolation]   - ${i.name}: qty=${i.quantity}`)
              );
            }

            set({
              categories: categoriesWithLocalId,
              items: itemsWithLocalId,
              savedOrders: ordersWithLocalId,
              activityLogs: savedActivityLogs,
              expandedCategories: categoriesWithLocalId.map(c => c.id),
              isInitialized: true,
              isInitialSyncComplete: true,  // NOW safe to sync
              currentUserId: userId,
            });
          } else {
            // Server returned empty — this is a genuinely new user
            console.log('[DataIsolation] Server empty — new user, seeding with default data');
            const { categories: seedCats, items: seedItems } = createSeedData();
            set({
              categories: seedCats,
              items: seedItems,
              activityLogs: savedActivityLogs,
              expandedCategories: seedCats.map(c => c.id),
              isInitialized: true,
              isInitialSyncComplete: true,  // Safe to sync — we're creating fresh data
              currentUserId: userId,
            });

            // Push seed data to server for this new user
            try {
              await syncService.push({
                categories: { created: seedCats },
                items: { created: seedItems },
              });
              console.log('[DataIsolation] Seed data pushed to backend for new user');
            } catch (pushErr) {
              console.warn('[DataIsolation] Failed to push seed data:', pushErr);
            }
          }

          return true;
        } catch (error) {
          console.error('[DataIsolation] Failed to load user data:', error);

          // On error, seed with defaults but do NOT enable sync
          // This prevents stale data from being pushed when the error was a server issue
          const savedActivityLogs = await loadUserActivityLogs(userId);

          const { categories: seedCats, items: seedItems } = createSeedData();
          set({
            categories: seedCats,
            items: seedItems,
            activityLogs: savedActivityLogs,
            expandedCategories: seedCats.map(c => c.id),
            isInitialized: true,
            isInitialSyncComplete: false,  // CRITICAL: Keep sync disabled — server fetch failed
            currentUserId: userId,
          });

          // Retry server fetch in background after 10 seconds
          setTimeout(async () => {
            try {
              console.log('[DataIsolation] Retrying server fetch after error...');
              const { useAppStore } = await import('./useAppStore');
              const store = useAppStore.getState();
              if (store.currentUserId === userId && !store.isInitialSyncComplete) {
                await store.loadUserData(userId);
              }
            } catch (retryErr) {
              console.warn('[DataIsolation] Retry failed:', retryErr);
            }
          }, 10000);

          return false;
        }
      },

      // =====================================================================
      // SYNC TO BACKEND - Uses timestamp-based conflict resolution
      // =====================================================================

      syncToBackend: async () => {
        console.log('[Sync] syncToBackend: Starting with conflict resolution...');

        // CRITICAL GUARD: Never push if initial sync hasn't completed
        if (!get().isInitialSyncComplete) {
          console.log('[Sync] syncToBackend: BLOCKED — initial sync not complete, skipping to prevent stale data push');
          return false;
        }

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

          // FIX: Use timestamp-based conflict resolution instead of blind overwrite
          // This compares updatedAt for each entity and only pushes items
          // where local is strictly newer than server
          const result = await syncService.pushWithConflictResolution(
            categories,
            items,
            savedOrders,
          );

          // Merge server-newer entities into local state
          if (result.serverNewerItems.length > 0 || result.serverNewerCategories.length > 0 || result.serverNewerOrders.length > 0) {
            console.log(`[Sync] Merging ${result.serverNewerItems.length} server-newer items into local state`);
            
            const currentItems = get().items;
            const currentCategories = get().categories;
            const currentOrders = get().savedOrders;

            // Replace local items with server-newer versions
            const mergedItems = currentItems.map(localItem => {
              const localKey = localItem.localId || localItem.id;
              const serverItem = result.serverNewerItems.find(si => 
                (si.localId || si.id) === localKey
              );
              if (serverItem) {
                console.log(`[Sync] Updated local "${localItem.name}": qty ${localItem.quantity} → ${serverItem.quantity}`);
                return { ...serverItem, localId: serverItem.localId || serverItem.id };
              }
              return localItem;
            });

            const mergedCategories = currentCategories.map(localCat => {
              const localKey = localCat.localId || localCat.id;
              const serverCat = result.serverNewerCategories.find(sc =>
                (sc.localId || sc.id) === localKey
              );
              return serverCat ? { ...serverCat, localId: serverCat.localId || serverCat.id } : localCat;
            });

            const mergedOrders = currentOrders.map(localOrder => {
              const localKey = localOrder.localId || localOrder.id;
              const serverOrder = result.serverNewerOrders.find(so =>
                (so.localId || so.id) === localKey
              );
              return serverOrder ? { ...serverOrder, localId: serverOrder.localId || serverOrder.id, items: serverOrder.items || [] } : localOrder;
            });

            set({
              items: mergedItems,
              categories: mergedCategories,
              savedOrders: mergedOrders,
            });
          }

          console.log(`[Sync] syncToBackend: Complete — pushed ${result.pushed}, merged ${result.serverNewerItems.length} server-newer items`);
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
        // NOTE: isInitialSyncComplete is INTENTIONALLY excluded from persist
        // It must always start as false on app restart — the only way to
        // set it true is by successfully fetching from server
        expandedCategories: state.expandedCategories,
        currentUserId: state.currentUserId,
      }),
    }
  )
);
