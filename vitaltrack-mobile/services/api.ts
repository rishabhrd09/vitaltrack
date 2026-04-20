/**
 * VitalTrack Mobile - API Client
 * Base HTTP client with authentication handling
 */

import * as SecureStore from 'expo-secure-store';

// API Configuration
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
const API_VERSION = '/api/v1';

// Token storage keys
const ACCESS_TOKEN_KEY = 'vitaltrack_access_token';
const REFRESH_TOKEN_KEY = 'vitaltrack_refresh_token';

// Types
// Backend returns errors in several shapes:
// - FastAPI default: { detail: "..." } or { detail: [{ msg, loc, type }] }
// - Custom handlers: { error: "...", message: "...", details?: [{ field, message, code }] }
interface ApiError {
    detail?: string | { msg: string; loc: string[] }[];
    error?: string;
    message?: string;
    details?: { field?: string; message: string; code?: string }[];
}

interface RefreshResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
}

// Token Management
export const tokenStorage = {
    async getAccessToken(): Promise<string | null> {
        try {
            return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
        } catch {
            return null;
        }
    },

    async getRefreshToken(): Promise<string | null> {
        try {
            return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        } catch {
            return null;
        }
    },

    async setTokens(accessToken: string, refreshToken: string): Promise<void> {
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    },

    async clearTokens(): Promise<void> {
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    },
};

// Error handling
class ApiClientError extends Error {
    status: number;
    data: unknown;

    constructor(message: string, status: number, data?: unknown) {
        super(message);
        this.name = 'ApiClientError';
        this.status = status;
        this.data = data;
    }
}

// Refresh token logic
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
    refreshSubscribers.push(cb);
};

const onTokenRefreshed = (token: string) => {
    refreshSubscribers.forEach((cb) => cb(token));
    refreshSubscribers = [];
};

async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (!refreshToken) return null;

    try {
        const response = await fetch(`${API_BASE_URL}${API_VERSION}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
            await tokenStorage.clearTokens();
            return null;
        }

        const data: RefreshResponse = (await response.json()) as unknown as RefreshResponse;
        await tokenStorage.setTokens(data.access_token, data.refresh_token);
        return data.access_token;
    } catch {
        await tokenStorage.clearTokens();
        return null;
    }
}

// Trigger a store-level logout from the API layer. Lazy require to avoid a
// circular import (store depends on api.ts for tokenStorage/ApiClientError).
// Skipped for the login endpoint itself: a wrong password returning 401 must
// NOT log the user out — they aren't authenticated in the first place.
async function triggerAutoLogout(endpoint: string): Promise<void> {
    if (endpoint.includes('/auth/login')) return;
    try {
        const { useAuthStore } = await import('@/store/useAuthStore');
        const state = useAuthStore.getState();
        if (state.isAuthenticated) {
            console.info('[Auth] 401 on authenticated request — auto-logout');
            await state.logout();
        }
    } catch (err) {
        console.warn('[Auth] Auto-logout failed:', err);
    }
}

// Main API client
class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {},
        requiresAuth: boolean = true
    ): Promise<T> {
        const url = `${this.baseUrl}${API_VERSION}${endpoint}`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string>),
        };

        // Add auth header if required
        if (requiresAuth) {
            const token = await tokenStorage.getAccessToken();
            if (token) {
                (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
            }
        }

        let response: Response;
        try {
            response = await fetch(url, { ...options, headers });
        } catch (error) {
            console.error(`[API] Connection Failure: ${url}`, error);
            const err = error as Error;
            // Handle standard "Network request failed"
            if (err.message === 'Network request failed' || err instanceof TypeError) {
                throw new ApiClientError(
                    'Unable to connect to server. The server may be starting up — please wait a moment and try again.',
                    0,
                    { url, originalError: err.message }
                );
            }
            throw error;
        }

        // Handle 401 - try to refresh token
        if (response.status === 401 && requiresAuth) {
            if (!isRefreshing) {
                isRefreshing = true;
                const newToken = await refreshAccessToken();
                isRefreshing = false;

                if (newToken) {
                    onTokenRefreshed(newToken);
                    // Retry request with new token
                    (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
                    response = await fetch(url, { ...options, headers });
                } else {
                    // Refresh failed — session is dead (token revoked, account
                    // deleted server-side, etc). Trigger auto-logout so the
                    // route guard redirects to /login. Guard against the login
                    // endpoint itself to avoid weird loops on mistyped passwords.
                    await triggerAutoLogout(endpoint);
                    throw new ApiClientError('Session expired. Please log in again.', 401);
                }
            } else {
                // Wait for token refresh
                await new Promise<void>((resolve) => {
                    subscribeTokenRefresh((token: string) => {
                        (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
                        resolve();
                    });
                });
                response = await fetch(url, { ...options, headers });
            }

            // Retry may still return 401 if the refreshed token was immediately
            // invalidated (e.g. account deleted between refresh and retry).
            if (response.status === 401) {
                await triggerAutoLogout(endpoint);
                throw new ApiClientError('Session expired. Please log in again.', 401);
            }
        }

        // Handle rate limiting
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || '60';
            throw new ApiClientError(
                `Rate limit exceeded. Please wait ${retryAfter} seconds.`,
                429
            );
        }

        // Parse response
        const contentType = response.headers.get('content-type');
        let data: T | ApiError | null = null;

        if (contentType?.includes('application/json')) {
            data = (await response.json()) as unknown as T;
        }

        if (!response.ok) {
            const errorData = data as ApiError;
            let message = '';

            // Extract error message from API response.
            // Try all known shapes: FastAPI default `detail`, custom handler `message`+`details`.
            if (errorData?.detail) {
                if (typeof errorData.detail === 'string') {
                    message = errorData.detail;
                } else if (Array.isArray(errorData.detail)) {
                    message = errorData.detail.map((e) => e.msg).join(', ');
                }
            } else if (Array.isArray(errorData?.details) && errorData.details.length > 0) {
                // Custom validation handler shape
                message = errorData.details
                    .map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
                    .join(', ');
            } else if (errorData?.message) {
                message = errorData.message;
            }

            // If no message from API, generate user-friendly one based on HTTP status
            if (!message) {
                switch (response.status) {
                    case 400:
                        message = 'Invalid request. Please check your input.';
                        break;
                    case 401:
                        message = 'Incorrect email/username or password.';
                        break;
                    case 403:
                        message = 'Access denied. Please log in again.';
                        break;
                    case 404:
                        message = 'Account not found. Please check your credentials.';
                        break;
                    case 409:
                        message = 'This email or username is already registered.';
                        break;
                    case 422:
                        message = 'Please check your input and try again.';
                        break;
                    case 429:
                        message = 'Too many attempts. Please wait a moment and try again.';
                        break;
                    case 500:
                    case 502:
                    case 503:
                        message = 'Server is temporarily unavailable. Please try again in a moment.';
                        break;
                    default:
                        message = `Something went wrong (error ${response.status}). Please try again.`;
                }
            }

            // DELETE is idempotent by HTTP spec — a 404 means the end state
            // (resource gone) is already achieved. Caller-side services treat
            // it as success, so emitting a WARN from the client interceptor
            // creates misleading noise during bulk delete operations (dozens
            // of 404s look like failures in the log). Demote to debug.
            const method = options.method || 'GET';
            const isIdempotentDeleteGone = method === 'DELETE' && response.status === 404;

            if (isIdempotentDeleteGone) {
                if (__DEV__) {
                    console.debug(`[API] DELETE ${endpoint} → 404 (idempotent — nothing to delete)`);
                }
            } else {
                // 5xx / network-level problems are unexpected; 4xx is caller-handleable.
                const level: 'error' | 'warn' =
                    response.status >= 500 || response.status === 0 ? 'error' : 'warn';
                console[level](
                    `[API] ${method} ${endpoint} → ${response.status} ${message}`
                );
                if (__DEV__) {
                    console[level]('[API] body:', JSON.stringify(data).substring(0, 500));
                }
            }

            throw new ApiClientError(message, response.status, data);
        }

        return data as T;
    }

    // Public methods
    async get<T>(endpoint: string, requiresAuth = true): Promise<T> {
        return this.request<T>(endpoint, { method: 'GET' }, requiresAuth);
    }

    async post<T>(endpoint: string, body?: unknown, requiresAuth = true): Promise<T> {
        return this.request<T>(
            endpoint,
            { method: 'POST', body: body ? JSON.stringify(body) : undefined },
            requiresAuth
        );
    }

    async put<T>(endpoint: string, body: unknown, requiresAuth = true): Promise<T> {
        return this.request<T>(
            endpoint,
            { method: 'PUT', body: JSON.stringify(body) },
            requiresAuth
        );
    }

    async patch<T>(endpoint: string, body: unknown, requiresAuth = true): Promise<T> {
        return this.request<T>(
            endpoint,
            { method: 'PATCH', body: JSON.stringify(body) },
            requiresAuth
        );
    }

    async delete<T>(endpoint: string, requiresAuth = true): Promise<T> {
        return this.request<T>(endpoint, { method: 'DELETE' }, requiresAuth);
    }
}

// Export singleton instance
export const api = new ApiClient();
export { ApiClientError };
