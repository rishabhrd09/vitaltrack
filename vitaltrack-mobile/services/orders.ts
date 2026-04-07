/**
 * VitalTrack Mobile - Orders API Service
 * CRUD operations for orders
 */

import { api } from './api';
import type { SavedOrder, OrderStatus } from '@/types';

// Response types
interface OrdersListResponse {
  orders: SavedOrder[];
  total: number;
}

// Create order item request — must include all fields backend OrderItemCreate expects
interface CreateOrderItemRequest {
  itemId: string;
  name: string;
  quantity: number;
  unit?: string;
  brand?: string;
  currentStock?: number;
  minimumStock?: number;
  imageUri?: string;
  supplierName?: string;
  purchaseLink?: string;
}

// Create order request — backend OrderCreate requires orderId/totalItems/totalUnits
interface CreateOrderRequest {
  items: CreateOrderItemRequest[];
  notes?: string;
}

// Generate a client-side order ID (backend overrides this with its own counter,
// but Pydantic validation requires a non-empty value)
function generateClientOrderId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `ORD-${dateStr}-${rand}`;
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
   * NOTE: backend OrderCreate requires orderId/totalItems/totalUnits/exportedAt
   * even though the endpoint overrides them. We send placeholders to satisfy
   * Pydantic validation.
   */
  async create(data: CreateOrderRequest): Promise<SavedOrder> {
    const totalItems = data.items.length;
    const totalUnits = data.items.reduce((sum, i) => sum + (i.quantity || 0), 0);
    return api.post<SavedOrder>('/orders', {
      orderId: generateClientOrderId(),
      totalItems,
      totalUnits,
      status: 'pending',
      exportedAt: new Date().toISOString(),
      items: data.items,
      notes: data.notes,
    });
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
