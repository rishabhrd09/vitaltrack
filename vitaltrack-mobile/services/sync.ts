/**
 * VitalTrack Mobile - Sync Service
 * Handles synchronization between local storage and backend API
 */

import { api } from './api';
import type { Category, Item, SavedOrder } from '@/types';
import NetInfo from '@react-native-community/netinfo';

// Sync operation types
interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: 'item' | 'category' | 'order';
  data: unknown;
  timestamp: string;
  retryCount: number;
}

// Push sync request
interface PushSyncRequest {
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

// Pull sync response
interface PullSyncResponse {
  categories: Category[];
  items: Item[];
  orders: SavedOrder[];
  serverTime: string;
}

// Full sync response
interface FullSyncResponse {
  pushed: {
    categories: number;
    items: number;
    orders: number;
  };
  pulled: {
    categories: Category[];
    items: Item[];
    orders: SavedOrder[];
  };
  conflicts: {
    entity: string;
    entityId: string;
    localVersion: unknown;
    serverVersion: unknown;
  }[];
  syncedAt: string;
}

// Check if device is online
export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === true;
  } catch {
    return false;
  }
}

export const syncService = {
  /**
   * Push local changes to server
   */
  async push(data: PushSyncRequest): Promise<{ message: string; synced: number }> {
    return api.post<{ message: string; synced: number }>('/sync/push', data);
  },

  /**
   * Pull server changes
   */
  async pull(lastSyncedAt?: string): Promise<PullSyncResponse> {
    const query = lastSyncedAt ? `?last_synced_at=${encodeURIComponent(lastSyncedAt)}` : '';
    return api.post<PullSyncResponse>(`/sync/pull${query}`);
  },

  /**
   * Full bidirectional sync
   */
  async fullSync(data: PushSyncRequest): Promise<FullSyncResponse> {
    return api.post<FullSyncResponse>('/sync/full', data);
  },
};

// Sync queue for offline operations
class SyncQueue {
  private queue: SyncOperation[] = [];
  private storageKey = 'vitaltrack_sync_queue';

  async loadQueue(): Promise<void> {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const stored = await AsyncStorage.getItem(this.storageKey);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
    }
  }

  async saveQueue(): Promise<void> {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  }

  async addOperation(op: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    const operation: SyncOperation = {
      ...op,
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };
    this.queue.push(operation);
    await this.saveQueue();
  }

  async processQueue(): Promise<{ success: number; failed: number }> {
    const online = await isOnline();
    if (!online || this.queue.length === 0) {
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;
    const failedOps: SyncOperation[] = [];

    for (const op of this.queue) {
      try {
        await this.executeOperation(op);
        success++;
      } catch (error) {
        if (op.retryCount < 3) {
          op.retryCount++;
          failedOps.push(op);
        } else {
          failed++;
          console.error('Sync operation failed after 3 retries:', op, error);
        }
      }
    }

    this.queue = failedOps;
    await this.saveQueue();

    return { success, failed };
  }

  private async executeOperation(op: SyncOperation): Promise<void> {
    const { itemService } = await import('./items');
    const { categoryService } = await import('./categories');
    const { orderService } = await import('./orders');

    switch (op.entity) {
      case 'item':
        if (op.type === 'create') {
          await itemService.create(op.data as Parameters<typeof itemService.create>[0]);
        } else if (op.type === 'update') {
          const { id, ...rest } = op.data as { id: string; [key: string]: unknown };
          await itemService.update(id, rest);
        } else if (op.type === 'delete') {
          await itemService.delete(op.data as string);
        }
        break;

      case 'category':
        if (op.type === 'create') {
          await categoryService.create(op.data as Parameters<typeof categoryService.create>[0]);
        } else if (op.type === 'update') {
          const { id, ...rest } = op.data as { id: string; [key: string]: unknown };
          await categoryService.update(id, rest);
        } else if (op.type === 'delete') {
          await categoryService.delete(op.data as string);
        }
        break;

      case 'order':
        if (op.type === 'create') {
          await orderService.create(op.data as Parameters<typeof orderService.create>[0]);
        } else if (op.type === 'delete') {
          await orderService.delete(op.data as string);
        }
        break;
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
  }
}

export const syncQueue = new SyncQueue();

export type { SyncOperation, PushSyncRequest, PullSyncResponse, FullSyncResponse };
