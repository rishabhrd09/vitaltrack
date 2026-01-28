/**
 * VitalTrack Utility Functions
 */

import * as Crypto from 'expo-crypto';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

// ============================================================================
// ID GENERATION
// ============================================================================

export const generateId = (): string => Crypto.randomUUID();

// ============================================================================
// DATE/TIME UTILITIES
// ============================================================================

export const now = (): string => new Date().toISOString();

export const formatDate = (dateString: string): string => {
  try {
    return format(parseISO(dateString), 'MMM d, yyyy');
  } catch {
    return dateString;
  }
};

export const formatDateTime = (dateString: string): string => {
  try {
    return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
  } catch {
    return dateString;
  }
};

export const formatRelativeTime = (dateString: string): string => {
  try {
    return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
};

export const formatDateShort = (dateString: string): string => {
  try {
    return format(parseISO(dateString), 'MM/dd/yy');
  } catch {
    return dateString;
  }
};

// ============================================================================
// ORDER ID GENERATION
// ============================================================================

export const generateOrderId = (existingOrdersToday: number = 0): string => {
  const date = new Date();
  const dateStr = format(date, 'yyyyMMdd');
  const sequence = (existingOrdersToday + 1).toString().padStart(4, '0');
  return `ORD-${dateStr}-${sequence}`;
};

export const getTodayDateString = (): string => {
  return format(new Date(), 'yyyyMMdd');
};

// ============================================================================
// EXPIRY DATE HELPERS
// ============================================================================

export const isExpired = (expiryDate?: string): boolean => {
  if (!expiryDate) return false;
  try {
    return parseISO(expiryDate) < new Date();
  } catch {
    return false;
  }
};

export const isExpiringSoon = (expiryDate?: string, daysThreshold: number = 30): boolean => {
  if (!expiryDate) return false;
  try {
    const expiry = parseISO(expiryDate);
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysThreshold);
    return expiry > new Date() && expiry <= threshold;
  } catch {
    return false;
  }
};

// ============================================================================
// STRING UTILITIES
// ============================================================================

export const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + '...';
};

export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export const formatActionName = (action: string): string => {
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .map(word => capitalize(word))
    .join(' ');
};

// ============================================================================
// COMMON UNITS
// ============================================================================

export const COMMON_UNITS = [
  // Singular (for single machines/devices)
  'unit',
  'piece',
  'set',
  'bottle',
  'packet',
  'roll',
  'pair',
  'cylinder',
  // Plural (for multiple items)
  'units',
  'pieces',
  'sets',
  'bottles',
  'packets',
  'rolls',
  'pairs',
  'cylinders',
  // Medicines
  'tablet',
  'tablets',
  'strip',
  'strips',
  'vial',
  'vials',
  // Other
  'pack',
  'packs',
  'box',
  'boxes',
  'ml',
  'liter',
];
