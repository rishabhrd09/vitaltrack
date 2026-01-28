/**
 * VitalTrack Mobile - Orders API Service
 * CRUD operations for orders
 */

import { api } from './api';
import type { SavedOrder, OrderItem, OrderStatus } from '@/types';

// Response types
interface OrdersListResponse {
  orders: SavedOrder[];
  total: number;
}

// Create order item request
interface CreateOrderItemRequest {
  itemId: string;
  quantity: number;
}

// Create order request
interface CreateOrderRequest {
  items: CreateOrderItemRequest[];
  notes?: string;
}

// Update order status request
interface UpdateOrderStatusRequest {
  status: OrderStatus;
}

export const orderService = {
  /**
   * Get all orders
   */
  async getAll(): Promise<OrdersListResponse> {
    return api.get<OrdersListResponse>('/orders');
  },

  /**
   * Get single order by ID with items
   */
  async getById(id: string): Promise<SavedOrder> {
    return api.get<SavedOrder>(`/orders/${id}`);
  },

  /**
   * Create new order
   */
  async create(data: CreateOrderRequest): Promise<SavedOrder> {
    return api.post<SavedOrder>('/orders', data);
  },

  /**
   * Update order status
   */
  async updateStatus(id: string, status: OrderStatus): Promise<SavedOrder> {
    return api.patch<SavedOrder>(`/orders/${id}/status`, { status });
  },

  /**
   * Apply order to stock (updates item quantities)
   */
  async applyToStock(id: string): Promise<SavedOrder> {
    return api.post<SavedOrder>(`/orders/${id}/apply`);
  },

  /**
   * Delete order
   */
  async delete(id: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/orders/${id}`);
  },
};

export type { CreateOrderRequest, CreateOrderItemRequest, UpdateOrderStatusRequest };
