/**
 * VitalTrack Mobile - Items API Service
 * CRUD operations for items with filtering and stats
 */

import { api } from './api';
import type { Item, DashboardStats } from '@/types';

// Response types
interface ItemsListResponse {
  items: Item[];
  total: number;
}

interface NeedsAttentionResponse {
  items: Item[];
  total: number;
  outOfStockCount: number;
  lowStockCount: number;
}

// Query parameters for filtering items
interface ItemsQueryParams {
  categoryId?: string;
  search?: string;
  isActive?: boolean;
  lowStock?: boolean;
  outOfStock?: boolean;
  skip?: number;
  limit?: number;
}

// Create item request
interface CreateItemRequest {
  categoryId: string;
  name: string;
  description?: string;
  quantity?: number;
  unit?: string;
  minimumStock?: number;
  expiryDate?: string;
  brand?: string;
  notes?: string;
  supplierName?: string;
  supplierContact?: string;
  purchaseLink?: string;
  imageUri?: string;
  isCritical?: boolean;
}

// Update item request
interface UpdateItemRequest {
  categoryId?: string;
  name?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  minimumStock?: number;
  expiryDate?: string;
  brand?: string;
  notes?: string;
  supplierName?: string;
  supplierContact?: string;
  purchaseLink?: string;
  imageUri?: string;
  isCritical?: boolean;
  isActive?: boolean;
}

// Stock update request
interface StockUpdateRequest {
  quantity: number;
}

// Build query string from params
function buildQueryString(params?: ItemsQueryParams): string {
  if (!params) return '';
  
  const queryParts: string[] = [];
  
  if (params.categoryId) queryParts.push(`category_id=${encodeURIComponent(params.categoryId)}`);
  if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.isActive !== undefined) queryParts.push(`is_active=${params.isActive}`);
  if (params.lowStock !== undefined) queryParts.push(`low_stock=${params.lowStock}`);
  if (params.outOfStock !== undefined) queryParts.push(`out_of_stock=${params.outOfStock}`);
  if (params.skip !== undefined) queryParts.push(`skip=${params.skip}`);
  if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`);
  
  return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
}

export const itemService = {
  /**
   * Get all items with optional filters
   */
  async getAll(params?: ItemsQueryParams): Promise<ItemsListResponse> {
    const queryString = buildQueryString(params);
    return api.get<ItemsListResponse>(`/items${queryString}`);
  },

  /**
   * Get dashboard statistics
   */
  async getStats(): Promise<DashboardStats> {
    return api.get<DashboardStats>('/items/stats');
  },

  /**
   * Get items that need attention (low stock or out of stock)
   */
  async getNeedsAttention(): Promise<NeedsAttentionResponse> {
    return api.get<NeedsAttentionResponse>('/items/needs-attention');
  },

  /**
   * Get single item by ID
   */
  async getById(id: string): Promise<Item> {
    return api.get<Item>(`/items/${id}`);
  },

  /**
   * Create new item
   */
  async create(data: CreateItemRequest): Promise<Item> {
    return api.post<Item>('/items', data);
  },

  /**
   * Update existing item
   */
  async update(id: string, data: UpdateItemRequest): Promise<Item> {
    return api.put<Item>(`/items/${id}`, data);
  },

  /**
   * Quick stock update
   */
  async updateStock(id: string, quantity: number): Promise<Item> {
    return api.patch<Item>(`/items/${id}/stock`, { quantity });
  },

  /**
   * Delete item
   */
  async delete(id: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/items/${id}`);
  },
};

export type { 
  ItemsQueryParams, 
  CreateItemRequest, 
  UpdateItemRequest, 
  StockUpdateRequest,
  NeedsAttentionResponse 
};
