/**
 * VitalTrack - Input Sanitization & Validation Utilities
 * Security-critical functions for data handling
 */

// ============================================================================
// HTML/XSS PROTECTION
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS
 * MUST be used when inserting user content into HTML (e.g., PDF generation)
 */
export const escapeHtml = (unsafe: string | undefined | null): string => {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

/**
 * Remove potentially dangerous HTML/script content
 * Use for storing user input
 */
export const sanitizeString = (input: string | undefined | null, maxLength = 500): string => {
    if (!input) return '';
    return String(input)
        .replace(/<[^>]*>/g, '') // Remove all HTML tags
        .replace(/javascript:/gi, '') // Remove JS protocol
        .replace(/on\w+=/gi, '') // Remove event handlers
        .replace(/data:/gi, '') // Remove data URIs
        .trim()
        .slice(0, maxLength);
};

/**
 * Sanitize for display names (more restrictive)
 */
export const sanitizeName = (input: string | undefined | null): string => {
    if (!input) return '';
    return String(input)
        .replace(/[<>'"&;]/g, '') // Remove dangerous chars
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()
        .slice(0, 255);
};

// ============================================================================
// URL VALIDATION
// ============================================================================

const ALLOWED_URL_PROTOCOLS = ['http:', 'https:'];

/**
 * Validate and sanitize URLs
 * Returns undefined if URL is invalid or potentially dangerous
 */
export const sanitizeUrl = (url: string | undefined | null): string | undefined => {
    if (!url || typeof url !== 'string') return undefined;

    const trimmed = url.trim();
    if (!trimmed) return undefined;

    try {
        const parsed = new URL(trimmed);

        // Only allow http/https
        if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
            console.warn('Rejected URL with protocol:', parsed.protocol);
            return undefined;
        }

        return parsed.href;
    } catch {
        // Invalid URL
        return undefined;
    }
};

// ============================================================================
// NUMBER VALIDATION
// ============================================================================

/**
 * Parse and validate numeric input
 * Returns value clamped to min/max range
 */
export const sanitizeNumber = (
    value: string | number | undefined | null,
    min = 0,
    max = 999999,
    defaultValue = 0
): number => {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    const num = typeof value === 'number' ? value : parseInt(String(value), 10);

    if (isNaN(num)) {
        return defaultValue;
    }

    return Math.max(min, Math.min(max, Math.floor(num)));
};

/**
 * Validate positive integer
 */
export const isValidPositiveInt = (value: unknown): value is number => {
    return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0;
};

// ============================================================================
// FILE/PATH VALIDATION
// ============================================================================

const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const ALLOWED_URI_SCHEMES = ['file://', 'content://'];

/**
 * Validate image URI for safe file access
 * Returns null if URI is invalid or potentially dangerous
 */
export const validateImageUri = (uri: string | undefined | null): string | null => {
    if (!uri || typeof uri !== 'string') return null;

    const trimmed = uri.trim();
    if (!trimmed) return null;

    // Check for data URIs (already encoded) - these are safe
    if (trimmed.startsWith('data:image/')) {
        return trimmed;
    }

    // Validate file extension
    const ext = trimmed.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        console.warn('Rejected image with extension:', ext);
        return null;
    }

    // Check URI scheme
    const hasValidScheme = ALLOWED_URI_SCHEMES.some(scheme =>
        trimmed.toLowerCase().startsWith(scheme)
    );

    // Also allow absolute paths starting with /
    if (!hasValidScheme && !trimmed.startsWith('/')) {
        console.warn('Rejected URI with invalid scheme');
        return null;
    }

    // Check for path traversal attempts
    if (trimmed.includes('..')) {
        console.warn('Rejected URI with path traversal pattern');
        return null;
    }

    return trimmed;
};

// ============================================================================
// UUID VALIDATION
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate UUID format
 */
export const isValidUuid = (id: string | undefined | null): boolean => {
    if (!id || typeof id !== 'string') return false;
    return UUID_REGEX.test(id);
};

// ============================================================================
// PHONE/CONTACT VALIDATION
// ============================================================================

/**
 * Sanitize phone/contact information
 * Allows numbers, spaces, dashes, parentheses, plus sign, and email chars
 */
export const sanitizeContact = (input: string | undefined | null): string => {
    if (!input) return '';
    return String(input)
        .replace(/[^0-9\s\-\(\)\+\.@a-zA-Z]/g, '') // Keep phone-valid chars and email chars
        .trim()
        .slice(0, 100);
};

// ============================================================================
// JSON IMPORT VALIDATION
// ============================================================================

/**
 * Safely parse JSON with error handling
 */
export const safeJsonParse = <T>(json: string): T | null => {
    try {
        return JSON.parse(json) as T;
    } catch {
        return null;
    }
};

/**
 * Validate imported item data structure
 */
export const validateItemData = (item: unknown): boolean => {
    if (!item || typeof item !== 'object') return false;

    const obj = item as Record<string, unknown>;

    // Required fields
    if (typeof obj.id !== 'string' || !obj.id) return false;
    if (typeof obj.categoryId !== 'string' || !obj.categoryId) return false;
    if (typeof obj.name !== 'string' || !obj.name) return false;

    // Numeric fields - must be numbers
    if (typeof obj.quantity !== 'number' || !isValidPositiveInt(obj.quantity)) return false;
    if (typeof obj.minimumStock !== 'number' || !isValidPositiveInt(obj.minimumStock)) return false;

    // Boolean fields
    if (typeof obj.isActive !== 'boolean') return false;

    return true;
};

/**
 * Validate imported category data structure
 */
export const validateCategoryData = (category: unknown): boolean => {
    if (!category || typeof category !== 'object') return false;

    const obj = category as Record<string, unknown>;

    if (typeof obj.id !== 'string' || !obj.id) return false;
    if (typeof obj.name !== 'string' || !obj.name) return false;

    return true;
};
