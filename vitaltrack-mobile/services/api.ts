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
interface ApiError {
    detail: string | { msg: string; loc: string[] }[];
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

        let response = await fetch(url, { ...options, headers });

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
            let message = 'An error occurred';

            if (errorData?.detail) {
                if (typeof errorData.detail === 'string') {
                    message = errorData.detail;
                } else if (Array.isArray(errorData.detail)) {
                    message = errorData.detail.map((e) => e.msg).join(', ');
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
