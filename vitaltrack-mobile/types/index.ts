/**
 * VitalTrack Mobile - TypeScript Type Definitions (FIXED)
 * 
 * CRITICAL FIX: Added localId to Category, Item, and SavedOrder.
 * This is required for sync matching with the backend.
 */

// ============================================================================
// AUTH TYPES
// ============================================================================

export interface User {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  full_name?: string;
  is_active: boolean;
  is_verified: boolean;
  isEmailVerified?: boolean;  // Matches backend UserResponse serialization_alias
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  email?: string;
  username?: string;
  password: string;
  name?: string;
  full_name?: string;
}

// ============================================================================
// CORE ENTITIES
// ============================================================================

export interface Category {
  id: string;
  localId?: string;  // ← ADDED: Required for sync matching
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  displayOrder: number;
  isDefault?: boolean;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
  localId?: string;  // ← ADDED: Required for sync matching
  categoryId: string;
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  minimumStock: number;
  expiryDate?: string;
  brand?: string;
  notes?: string;
  supplierName?: string;
  supplierContact?: string;
  purchaseLink?: string;
  imageUri?: string;
  isActive: boolean;
  isCritical: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// ITEM STATUS HELPERS (matching Kotlin logic)
// ============================================================================

const CRITICAL_EQUIPMENT_KEYWORDS = [
  'ventilator', 'bipap', 'oxygen cylinder', 'oxygen concentrator',
  'suction machine', 'ambu bag', 'nebulizer', 'nebuliser',
  'tt tube', 'ventilator circuit', 'catheter mount', 'feeding tube'
];

export const matchesCriticalKeyword = (item: Item): boolean => {
  const lowerName = item.name.toLowerCase();
  return CRITICAL_EQUIPMENT_KEYWORDS.some(keyword => lowerName.includes(keyword));
};

export const isCriticalEquipment = (item: Item): boolean => {
  return item.isCritical || matchesCriticalKeyword(item);
};

export const needsEmergencyBackup = (item: Item): boolean => {
  return item.isCritical && item.quantity === 1;
};

export const getEmergencyBackupItems = (items: Item[]): Item[] => {
  return items.filter(item => needsEmergencyBackup(item));
};

export const isOutOfStock = (item: Item): boolean => item.quantity <= 0;

/** Standard low stock matches the authoritative API; backup attention is separate. */
export const isLowStock = (item: Item): boolean => item.quantity > 0 && item.quantity < item.minimumStock;

export const needsAttention = (item: Item): boolean => isOutOfStock(item) || isLowStock(item) || needsEmergencyBackup(item);

export const sortByCriticalFirst = (a: Item, b: Item): number => {
  const aCritical = isCriticalEquipment(a) ? 1 : 0;
  const bCritical = isCriticalEquipment(b) ? 1 : 0;
  return bCritical - aCritical;
};

// Check if item is valid (has required properties)
export const isValidItem = (item: unknown): item is Item => {
  if (!item || typeof item !== 'object') return false;
  const i = item as Partial<Item>;
  return typeof i.id === 'string' && typeof i.name === 'string' && typeof i.categoryId === 'string';
};

// ============================================================================
// ORDER TRACKING
// ============================================================================

export type OrderStatus =
  | 'pending'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'stock_updated'
  | 'declined'
  | 'cancelled'
  | 'completed';

export interface OrderItem {
  id: string;
  orderId: string;
  itemId: string;
  name: string;
  brand?: string;
  unit: string;
  quantity: number;
  currentStock: number;
  minimumStock: number;
  categoryName?: string;
  imageUri?: string;
  supplierName?: string;
  purchaseLink?: string;
  isEssential?: boolean;
  notes?: string;
}

export interface SavedOrder {
  id: string;
  localId?: string;  // ← ADDED: Required for sync matching
  orderId: string;
  pdfPath?: string;
  items: OrderItem[];
  totalItems: number;
  totalUnits: number;
  status: OrderStatus;
  exportedAt: string;
  orderedAt?: string;
  receivedAt?: string;
  appliedAt?: string;
  declinedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// ACTIVITY LOGGING
// ============================================================================

export type ActivityActionType =
  | 'item_create'
  | 'item_update'
  | 'item_delete'
  | 'stock_update'
  | 'stock_increase'
  | 'stock_decrease'
  | 'category_create'
  | 'category_update'
  | 'category_delete'
  | 'order_create'
  | 'order_created'
  | 'order_update'
  | 'order_delete'
  | 'order_export'
  | 'order_received'
  | 'order_declined'
  | 'order_applied'
  | 'data_import'
  | 'data_export'
  | 'data_reset'
  | 'data_restore'
  | 'backup_create'
  | 'backup_restore'
  | 'sync_push'
  | 'sync_pull'
  | 'user_login'
  | 'user_logout'
  | 'user_register';

export interface ActivityLog {
  id: string;
  action: ActivityActionType;
  itemName: string;
  itemId?: string;
  details?: string;
  timestamp: string;
  orderId?: string;
}

// ============================================================================
// DASHBOARD
// ============================================================================

export interface DashboardStats {
  totalItems: number;
  totalCategories: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingOrdersCount: number;
}

// ============================================================================
// BACKUP & EXPORT
// ============================================================================

export interface Backup {
  id: string;
  name: string;
  createdAt: string;
  categories: Category[];
  items: Item[];
  activityLogs: ActivityLog[];
  savedOrders: SavedOrder[];
}

export interface ExportPayload {
  version: string;
  exportedAt: string;
  categories: Category[];
  items: Item[];
  activityLogs: ActivityLog[];
  savedOrders: SavedOrder[];
}
