/**
 * VitalTrack Mobile - Services Index
 * Export all API services from a single location
 */

// Core API client
export { api, tokenStorage, ApiClientError } from './api';

// Auth service
export { authService } from './auth';

// Entity services
export { categoryService } from './categories';
export type { CreateCategoryRequest, UpdateCategoryRequest, CategoryWithCount } from './categories';

export { itemService } from './items';
export type {
  ItemsQueryParams,
  CreateItemRequest,
  UpdateItemRequest,
  StockUpdateRequest,
  NeedsAttentionResponse
} from './items';

export { orderService } from './orders';
export type { CreateOrderRequest, CreateOrderItemRequest, UpdateOrderStatusRequest } from './orders';

// Sync service
export { syncService, syncQueue, isOnline } from './sync';
