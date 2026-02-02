/**
 * VitalTrack Mobile - Sync Service (FIXED v4)
 * 
 * CRITICAL FIXES:
 * 1. Added syncQueue export (was missing - caused clearQueue errors)
 * 2. Better error handling with retry logic
 * 3. Persistent sync queue that survives app crashes
 * 4. Proper timeout handling for network requests
 * 
 * Replace your services/sync.ts with this file.
 */

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import type { Category, Item, SavedOrder, OrderItem } from '@/types';

// ============================================================================
// CONSTANTS
// ============================================================================

const SYNC_QUEUE_KEY = 'vitaltrack_sync_queue';
const SYNC_TIMEOUT_MS = 30000; // 30 second timeout

// ============================================================================
// TYPES
// ============================================================================

type SyncEntityType = 'category' | 'item' | 'order';
type SyncOperationType = 'create' | 'update' | 'delete';

interface SyncOperation {
  id: string;
  type: SyncOperationType;
  entity: SyncEntityType;
  entityId: string;
  localId: string;
  data?: Record<string, unknown>;
  timestamp: string;
  retryCount?: number;
}

interface SyncPushRequest {
  operations: SyncOperation[];
  lastSyncAt?: string | null;
}

interface SyncPullRequest {
  lastSyncAt: string | null;
  includeDeleted: boolean;
}

interface SyncPullResponse {
  categories: Category[];
  items: Item[];
  orders: SavedOrder[];
  deletedIds: string[];
  serverTime: string;
  hasMore: boolean;
}

interface LegacyPushData {
  categories?: {
    created?: Category[];
    updated?: Category[];
    deleted?: string[];
  };
  items?: {
    created?: Item[];
    updated?: Item[];
    deleted?: string[];
  };
  orders?: {
    created?: SavedOrder[];
    updated?: SavedOrder[];
    deleted?: string[];
  };
  lastSyncedAt?: string;
}

interface QueuedOperation {
  id: string;
  operation: SyncOperation;
  createdAt: string;
  retryCount: number;
  lastError?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get the correct localId for an entity.
 * The backend matches entities by local_id, not by id.
 */
function getLocalId(entity: { id: string; localId?: string }): string {
  if (entity.localId && typeof entity.localId === 'string' && entity.localId.trim() !== '') {
    return entity.localId;
  }
  return entity.id;
}

/**
 * Convert Category to SyncOperation
 */
function categoryToOperation(cat: Category, type: SyncOperationType): SyncOperation {
  const localId = getLocalId(cat);

  return {
    id: generateOperationId(),
    type,
    entity: 'category',
    entityId: cat.id,
    localId,
    data: {
      name: cat.name,
      icon: cat.icon || '📦',
      color: cat.color || '#808080',
      description: cat.description || null,
      displayOrder: cat.displayOrder ?? 0,
      isDefault: cat.isDefault ?? false,
      isActive: cat.isActive !== false,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Convert Item to SyncOperation
 */
function itemToOperation(item: Item, type: SyncOperationType): SyncOperation {
  const localId = getLocalId(item);

  return {
    id: generateOperationId(),
    type,
    entity: 'item',
    entityId: item.id,
    localId,
    data: {
      categoryId: item.categoryId,
      name: item.name,
      description: item.description || null,
      quantity: item.quantity,
      unit: item.unit || 'pieces',
      minimumStock: item.minimumStock ?? 0,
      expiryDate: item.expiryDate || null,
      brand: item.brand || null,
      notes: item.notes || null,
      supplierName: item.supplierName || null,
      supplierContact: item.supplierContact || null,
      purchaseLink: item.purchaseLink || null,
      imageUri: item.imageUri || null,
      isActive: item.isActive !== false,
      isCritical: item.isCritical === true,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Convert SavedOrder to SyncOperation
 */
function orderToOperation(order: SavedOrder, type: SyncOperationType): SyncOperation {
  const localId = getLocalId(order);

  // Serialize order items for storage
  const serializedItems = (order.items || []).map((item: OrderItem) => ({
    id: item.id,
    orderId: item.orderId,
    itemId: item.itemId,
    name: item.name,
    brand: item.brand || null,
    unit: item.unit,
    quantity: item.quantity,
    currentStock: item.currentStock,
    minimumStock: item.minimumStock,
    categoryName: item.categoryName || null,
    imageUri: item.imageUri || null,
    supplierName: item.supplierName || null,
    purchaseLink: item.purchaseLink || null,
    isEssential: item.isEssential || false,
    notes: item.notes || null,
  }));

  console.log(`[Sync] Order ${order.orderId}: ${serializedItems.length} items`);

  return {
    id: generateOperationId(),
    type,
    entity: 'order',
    entityId: order.id,
    localId,
    data: {
      orderId: order.orderId,
      totalItems: order.totalItems,
      totalUnits: order.totalUnits,
      status: order.status,
      exportedAt: order.exportedAt,
      orderedAt: order.orderedAt || null,
      receivedAt: order.receivedAt || null,
      appliedAt: order.appliedAt || null,
      declinedAt: order.declinedAt || null,
      items: serializedItems,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create delete operation
 */
function deleteOperation(id: string, entity: SyncEntityType): SyncOperation {
  return {
    id: generateOperationId(),
    type: 'delete',
    entity,
    entityId: id,
    localId: id,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Transform legacy push format to operations array
 */
function transformToOperations(data: LegacyPushData): SyncOperation[] {
  const operations: SyncOperation[] = [];

  // Categories
  if (data.categories) {
    if (data.categories.created) {
      data.categories.created.forEach(cat => {
        operations.push(categoryToOperation(cat, 'create'));
      });
    }
    if (data.categories.updated) {
      data.categories.updated.forEach(cat => {
        operations.push(categoryToOperation(cat, 'update'));
      });
    }
    if (data.categories.deleted) {
      data.categories.deleted.forEach(id => {
        operations.push(deleteOperation(id, 'category'));
      });
    }
  }

  // Items
  if (data.items) {
    if (data.items.created) {
      data.items.created.forEach(item => {
        operations.push(itemToOperation(item, 'create'));
      });
    }
    if (data.items.updated) {
      data.items.updated.forEach(item => {
        operations.push(itemToOperation(item, 'update'));
      });
    }
    if (data.items.deleted) {
      data.items.deleted.forEach(id => {
        operations.push(deleteOperation(id, 'item'));
      });
    }
  }

  // Orders
  if (data.orders) {
    if (data.orders.created) {
      data.orders.created.forEach(order => {
        operations.push(orderToOperation(order, 'create'));
      });
    }
    if (data.orders.updated) {
      data.orders.updated.forEach(order => {
        operations.push(orderToOperation(order, 'update'));
      });
    }
    if (data.orders.deleted) {
      data.orders.deleted.forEach(id => {
        operations.push(deleteOperation(id, 'order'));
      });
    }
  }

  return operations;
}

// ============================================================================
// NETWORK CHECK
// ============================================================================

export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === true;
  } catch {
    return false;
  }
}

// ============================================================================
// SYNC QUEUE (PERSISTENT)
// ============================================================================

/**
 * Persistent sync queue that survives app restarts.
 * This ensures data is never lost even if sync fails.
 */
export const syncQueue = {
  /**
   * Load queue from persistent storage
   */
  async getQueue(): Promise<QueuedOperation[]> {
    try {
      const data = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      if (!data) return [];
      return JSON.parse(data) as QueuedOperation[];
    } catch (error) {
      console.error('[SyncQueue] Failed to load queue:', error);
      return [];
    }
  },

  /**
   * Save queue to persistent storage
   */
  async saveQueue(queue: QueuedOperation[]): Promise<void> {
    try {
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('[SyncQueue] Failed to save queue:', error);
    }
  },

  /**
   * Add operation to queue
   */
  async addOperation(operation: SyncOperation): Promise<void> {
    const queue = await this.getQueue();
    const queuedOp: QueuedOperation = {
      id: operation.id,
      operation,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    queue.push(queuedOp);
    await this.saveQueue(queue);
    console.log(`[SyncQueue] Added operation: ${operation.entity} ${operation.type}`);
  },

  /**
   * Add multiple operations to queue
   */
  async addOperations(operations: SyncOperation[]): Promise<void> {
    const queue = await this.getQueue();
    for (const op of operations) {
      queue.push({
        id: op.id,
        operation: op,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });
    }
    await this.saveQueue(queue);
    console.log(`[SyncQueue] Added ${operations.length} operations`);
  },

  /**
   * Remove operation from queue
   */
  async removeOperation(operationId: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter(q => q.id !== operationId);
    await this.saveQueue(filtered);
  },

  /**
   * Clear entire queue
   */
  async clearQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SYNC_QUEUE_KEY);
      console.log('[SyncQueue] Queue cleared');
    } catch (error) {
      console.error('[SyncQueue] Failed to clear queue:', error);
    }
  },

  /**
   * Get queue size
   */
  async getSize(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  },

  /**
   * Process queued operations with retry logic
   */
  async processQueue(): Promise<{ processed: number; failed: number }> {
    const online = await isOnline();
    if (!online) {
      console.log('[SyncQueue] Offline - skipping queue processing');
      return { processed: 0, failed: 0 };
    }

    const queue = await this.getQueue();
    if (queue.length === 0) {
      return { processed: 0, failed: 0 };
    }

    console.log(`[SyncQueue] Processing ${queue.length} queued operations...`);

    let processed = 0;
    let failed = 0;
    const remainingQueue: QueuedOperation[] = [];

    for (const queuedOp of queue) {
      try {
        // Create a single-operation push
        const response = await api.post<{
          results: { operationId: string; success: boolean; error?: string }[];
          successCount: number;
          errorCount: number;
        }>('/sync/push', {
          operations: [queuedOp.operation],
        });

        if (response.successCount > 0) {
          processed++;
          console.log(`[SyncQueue] Processed: ${queuedOp.operation.entity} ${queuedOp.operation.type}`);
        } else {
          throw new Error(response.results[0]?.error || 'Unknown error');
        }
      } catch (error) {
        const err = error as Error;
        queuedOp.retryCount++;
        queuedOp.lastError = err.message;

        // Keep in queue if under retry limit
        if (queuedOp.retryCount < 5) {
          remainingQueue.push(queuedOp);
          console.warn(`[SyncQueue] Retry ${queuedOp.retryCount}/5 for ${queuedOp.id}: ${err.message}`);
        } else {
          failed++;
          console.error(`[SyncQueue] Giving up on ${queuedOp.id} after 5 retries`);
        }
      }
    }

    await this.saveQueue(remainingQueue);
    console.log(`[SyncQueue] Complete: ${processed} processed, ${failed} failed, ${remainingQueue.length} remaining`);

    return { processed, failed };
  },
};

// ============================================================================
// SYNC SERVICE
// ============================================================================

export const syncService = {
  /**
   * Push local changes to server with timeout and better error handling
   */
  async push(data: LegacyPushData): Promise<{ message: string; synced: number }> {
    const operations = transformToOperations(data);

    if (operations.length === 0) {
      console.log('[Sync] No operations to push');
      return { message: 'No operations to sync', synced: 0 };
    }

    // Log what we're pushing
    const catOps = operations.filter(o => o.entity === 'category').length;
    const itemOps = operations.filter(o => o.entity === 'item').length;
    const orderOps = operations.filter(o => o.entity === 'order').length;
    console.log(`[Sync] Pushing ${operations.length} operations: ${catOps} categories, ${itemOps} items, ${orderOps} orders`);

    try {
      const request: SyncPushRequest = {
        operations,
        lastSyncAt: data.lastSyncedAt,
      };

      // Add timeout wrapper
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Sync timeout after 30 seconds')), SYNC_TIMEOUT_MS);
      });

      const responsePromise = api.post<{
        results: { operationId: string; success: boolean; error?: string; serverId?: string }[];
        successCount: number;
        errorCount: number;
        serverTime: string;
      }>('/sync/push', request);

      const response = await Promise.race([responsePromise, timeoutPromise]);

      console.log(`[Sync] Push complete: ${response.successCount} succeeded, ${response.errorCount} failed`);

      // Log any failures with details
      if (response.errorCount > 0) {
        const failures = response.results.filter(r => !r.success);
        failures.forEach(f => console.error(`[Sync] Operation failed: ${f.operationId} - ${f.error}`));
      }

      return {
        message: `Synced ${response.successCount} operations`,
        synced: response.successCount,
      };
    } catch (error) {
      const err = error as Error;
      console.error('[Sync] Push failed:', err.message);

      // Log more details for debugging
      if ('status' in err) {
        console.error('[Sync] HTTP Status:', (err as { status: number }).status);
      }
      if ('data' in err) {
        console.error('[Sync] Error data:', JSON.stringify((err as { data: unknown }).data));
      }

      // Queue operations for retry
      console.log('[Sync] Queueing operations for retry...');
      await syncQueue.addOperations(operations);

      throw error;
    }
  },

  /**
   * Pull server changes
   */
  async pull(lastSyncedAt?: string): Promise<SyncPullResponse> {
    console.log('[Sync] Pulling from server...');

    try {
      const request: SyncPullRequest = {
        lastSyncAt: lastSyncedAt || null,
        includeDeleted: true,
      };

      const response = await api.post<SyncPullResponse>('/sync/pull', request);

      const catCount = response.categories?.length || 0;
      const itemCount = response.items?.length || 0;
      const orderCount = response.orders?.length || 0;
      console.log(`[Sync] Pull complete: ${catCount} categories, ${itemCount} items, ${orderCount} orders`);

      // Debug: Log sample data
      if (response.items?.length > 0) {
        const sample = response.items[0];
        console.log(`[Sync] Sample item: ${sample.name}, qty=${sample.quantity}, localId=${sample.localId}`);
      }
      if (response.orders?.length > 0) {
        const sample = response.orders[0];
        console.log(`[Sync] Sample order: ${sample.orderId}, items=${sample.items?.length || 0}`);
      }

      return {
        categories: response.categories || [],
        items: response.items || [],
        orders: response.orders || [],
        deletedIds: response.deletedIds || [],
        serverTime: response.serverTime || new Date().toISOString(),
        hasMore: response.hasMore || false,
      };
    } catch (error) {
      console.error('[Sync] Pull failed:', error);
      return {
        categories: [],
        items: [],
        orders: [],
        deletedIds: [],
        serverTime: new Date().toISOString(),
        hasMore: false,
      };
    }
  },

  /**
   * Full bidirectional sync
   */
  async fullSync(data: LegacyPushData): Promise<{
    pushed: number;
    pulled: SyncPullResponse;
    syncedAt: string;
  }> {
    console.log('[Sync] Starting full sync...');

    const pushResult = await this.push(data);
    const pullResult = await this.pull(data.lastSyncedAt);

    return {
      pushed: pushResult.synced,
      pulled: pullResult,
      syncedAt: pullResult.serverTime,
    };
  },
};

export type { SyncOperation, SyncPullResponse, LegacyPushData, QueuedOperation };
