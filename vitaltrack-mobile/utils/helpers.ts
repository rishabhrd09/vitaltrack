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
// STOCK FORMATTING
// ============================================================================

/**
 * Render a stock quantity + unit as a single human-friendly phrase, e.g.
 *   formatStock(1, 'unit')    -> "1 unit"
 *   formatStock(2, 'unit')    -> "2 units"
 *   formatStock(1, 'tablets') -> "1 tablet"
 *   formatStock(3, 'tablets') -> "3 tablets"
 *   formatStock(1, 'set')     -> "1 set"
 *   formatStock(2, 'cylinder')-> "2 cylinders"
 *
 * Replaces the previous "{qty} / {min} {unit}" rendering on inventory rows
 * (e.g. "2 / 1 unit"), which the May 4 user feedback flagged as confusing
 * — readers had to mentally parse two numbers when they only wanted to
 * know how many they have. The minimum is still visible in the row's
 * expanded detail view (Current / Minimum / Unit), so removing it from
 * the collapsed row doesn't lose any information.
 *
 * Pluralisation is the simple English rule (add 's' if not already
 * plural; strip trailing 's' for singular). Works for the units in
 * COMMON_UNITS below — unit, tablet, piece, cylinder, set, etc. Not
 * locale-aware; we don't ship to non-English locales today.
 */
export const formatStock = (quantity: number, unit: string): string => {
  const trimmed = unit.trim();
  if (!trimmed) return String(quantity);

  // For very short/specialised units (ml, kg, g, mg, cc) don't pluralise.
  // These are typically measurement units and "5 mls" reads worse than "5 ml".
  const noPluralise = new Set(['ml', 'kg', 'g', 'mg', 'cc', 'mcg', 'l']);
  if (noPluralise.has(trimmed.toLowerCase())) {
    return `${quantity} ${trimmed}`;
  }

  if (quantity === 1) {
    // Singular: drop a trailing 's' if the stored unit was plural.
    const singular = trimmed.endsWith('s') && trimmed.length > 2
      ? trimmed.slice(0, -1)
      : trimmed;
    return `1 ${singular}`;
  }

  // Plural: add 's' if not already plural.
  const plural = trimmed.endsWith('s') ? trimmed : `${trimmed}s`;
  return `${quantity} ${plural}`;
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
