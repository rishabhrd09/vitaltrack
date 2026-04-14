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
  isCritical?: boolean;
  lowStock?: boolean; // Legacy alias for lowStockOnly
  outOfStock?: boolean; // Legacy alias for outOfStockOnly
  lowStockOnly?: boolean;
  outOfStockOnly?: boolean;
  page?: number;
  pageSize?: number;
  skip?: number; // Legacy offset, converted to page when limit/pageSize is present
  limit?: number; // Legacy alias for pageSize; values over 100 fetch all pages
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
  version: number;
}

// Stock update request
interface StockUpdateRequest {
  quantity: number;
  version: number;
}

// Drop undefined and empty-string fields. Keeps falsy values like 0 and false.
// Avoids sending empty `expiryDate: ""` (fails date parsing) or `purchaseLink: ""`
// (fails URL validator) while still allowing required fields and zero quantities.
function stripEmpty<T extends Record<string, unknown>>(data: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

// Build query string from params
const MAX_PAGE_SIZE = 100;

function buildQueryString(params?: ItemsQueryParams): string {
  if (!params) return '';
  
  const queryParts: string[] = [];
  const requestedPageSize = params.pageSize ?? params.limit;
  const pageSize =
    requestedPageSize !== undefined
      ? Math.max(1, Math.min(MAX_PAGE_SIZE, requestedPageSize))
      : undefined;
  const page =
    params.page ??
    (params.skip !== undefined && pageSize !== undefined
      ? Math.floor(params.skip / pageSize) + 1
      : undefined);
  const lowStockOnly = params.lowStockOnly ?? params.lowStock;
  const outOfStockOnly = params.outOfStockOnly ?? params.outOfStock;
  
  if (params.categoryId) queryParts.push(`categoryId=${encodeURIComponent(params.categoryId)}`);
  if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.isActive !== undefined) queryParts.push(`isActive=${params.isActive}`);
  if (params.isCritical !== undefined) queryParts.push(`isCritical=${params.isCritical}`);
  if (lowStockOnly !== undefined) queryParts.push(`lowStockOnly=${lowStockOnly}`);
  if (outOfStockOnly !== undefined) queryParts.push(`outOfStockOnly=${outOfStockOnly}`);
  if (page !== undefined) queryParts.push(`page=${page}`);
  if (pageSize !== undefined) queryParts.push(`pageSize=${pageSize}`);
  
  return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
}

export const itemService = {
  /**
   * Get all items with optional filters
   */
  async getAll(params?: ItemsQueryParams): Promise<ItemsListResponse> {
    if (
      params?.limit !== undefined &&
      params.limit > MAX_PAGE_SIZE &&
      params.page === undefined &&
      params.skip === undefined
    ) {
      const items: Item[] = [];
      let total = 0;
      let page = 1;

      while (true) {
        const queryString = buildQueryString({
          ...params,
          limit: undefined,
          skip: undefined,
          page,
          pageSize: MAX_PAGE_SIZE,
        });
        const response = await api.get<ItemsListResponse>(`/items${queryString}`);
        items.push(...response.items);
        total = response.total;

        if (items.length >= total || response.items.length === 0) break;
        page += 1;
      }

      return { items, total };
    }

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
   * Strip undefined and empty-string optional fields so the backend validators
   * (URL, date) don't reject them.
   */
  async create(data: CreateItemRequest): Promise<Item> {
    const cleaned = stripEmpty(data as unknown as Record<string, unknown>);
    return api.post<Item>('/items', cleaned);
  },

  /**
   * Update existing item
   */
  async update(id: string, data: UpdateItemRequest): Promise<Item> {
    const cleaned = stripEmpty(data as unknown as Record<string, unknown>);
    return api.put<Item>(`/items/${id}`, cleaned);
  },

  /**
   * Quick stock update (requires version for OCC)
   */
  async updateStock(id: string, quantity: number, version: number): Promise<Item> {
    return api.patch<Item>(`/items/${id}/stock`, { quantity, version });
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
