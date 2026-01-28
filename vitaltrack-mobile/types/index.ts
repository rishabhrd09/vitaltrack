/**
 * VitalTrack Mobile - TypeScript Type Definitions
 * Matches Kotlin Android app models exactly
 */

// ============================================================================
// USER & AUTHENTICATION
// ============================================================================

export interface User {
  id: string;
  email: string | null;
  username: string | null;
  name: string;
  phone: string | null;
  isActive: boolean;
  isVerified: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface LoginRequest {
  identifier: string;  // email OR username
  password: string;
}

export interface RegisterRequest {
  email?: string;
  username?: string;
  password: string;
  name: string;
  phone?: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  new_password: string;
}

export interface PasswordChangeRequest {
  current_password: string;
  new_password: string;
}

// ============================================================================
// CORE ENTITIES
// ============================================================================

export interface Category {
  id: string;
  name: string;
  description?: string;
  displayOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// ITEM STATUS HELPERS (matching Kotlin logic)
// ============================================================================

// 8 Critical Backup Items - items that need emergency backup when stock <= 1
const CRITICAL_EQUIPMENT_KEYWORDS = [
  'ventilator', 'bipap', 'oxygen cylinder', 'oxygen concentrator',
  'suction machine', 'ambu bag', 'nebulizer', 'nebuliser',
  'tt tube', 'ventilator circuit', 'catheter mount'
];

// Check if item name matches any critical equipment keyword
export const matchesCriticalKeyword = (item: Item): boolean => {
  const lowerName = item.name.toLowerCase();
  return CRITICAL_EQUIPMENT_KEYWORDS.some(keyword => lowerName.includes(keyword));
};

// Check if item is marked as critical OR matches critical keywords
export const isCriticalEquipment = (item: Item): boolean => {
  return item.isCritical || matchesCriticalKeyword(item);
};

// Check if critical item needs emergency backup (stock <= 1)
export const needsEmergencyBackup = (item: Item): boolean => {
  return isCriticalEquipment(item) && item.quantity <= 1 && item.quantity > 0;
};

// Get all items that need emergency backup
export const getEmergencyBackupItems = (items: Item[]): Item[] => {
  return items.filter(item => needsEmergencyBackup(item));
};

export const isOutOfStock = (item: Item): boolean => item.quantity <= 0;

export const isLowStock = (item: Item): boolean => {
  const baseLowStock = item.quantity > 0 && item.quantity < item.minimumStock;
  const edgeCaseLowStock = !isCriticalEquipment(item) && item.minimumStock === 1 && item.quantity === 1;
  return baseLowStock || edgeCaseLowStock;
};

export const needsAttention = (item: Item): boolean => isOutOfStock(item) || isLowStock(item);

// Sort helper: critical items first
export const sortByCriticalFirst = (a: Item, b: Item): number => {
  const aCritical = isCriticalEquipment(a) ? 1 : 0;
  const bCritical = isCriticalEquipment(b) ? 1 : 0;
  return bCritical - aCritical;
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
  | 'declined';

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
  imageUri?: string;
  supplierName?: string;
  purchaseLink?: string;
}

export interface SavedOrder {
  id: string;
  orderId: string; // e.g., "ORD-20260115-0001"
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
}

// ============================================================================
// ACTIVITY LOGGING
// ============================================================================

export type ActivityActionType =
  | 'item_create'
  | 'item_update'
  | 'item_delete'
  | 'stock_update'
  | 'order_created'
  | 'order_received'
  | 'order_declined'
  | 'order_applied'
  | 'data_import'
  | 'data_export'
  | 'data_reset'
  | 'data_restore'
  | 'backup_create'
  | 'backup_restore';

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
