/**
 * VitalTrack Mobile - Auth Service
 * Authentication API calls
 */

import { api, tokenStorage, ApiClientError, revokeSession } from './api';
import type { User, AuthResponse, LoginRequest, RegisterRequest } from '@/types';

export const authService = {
    /**
     * Register a new user
     */
    async register(data: RegisterRequest): Promise<AuthResponse> {
        const response = await api.post<AuthResponse>('/auth/register', data, false);
        await tokenStorage.setTokens(response.access_token, response.refresh_token);
        return response;
    },

    /**
     * Login with email/username and password
     */
    async login(data: LoginRequest): Promise<AuthResponse> {
        const response = await api.post<AuthResponse>('/auth/login', data, false);
        await tokenStorage.setTokens(response.access_token, response.refresh_token);
        return response;
    },

    /**
     * Logout and revoke refresh token
     */
    async logout(): Promise<void> {
        const [accessToken, refreshToken] = await Promise.all([
            tokenStorage.getAccessToken(), tokenStorage.getRefreshToken(),
        ]);
        await tokenStorage.clearTokens();
        // Local logout must not wait for a sleeping or unreachable server.
        if (accessToken && refreshToken) void revokeSession(accessToken, refreshToken);
    },

    /**
     * Get current user profile
     */
    async getProfile(): Promise<User> {
        return api.get<User>('/auth/me');
    },

    /**
     * Update user profile
     */
    async updateProfile(data: Partial<User>): Promise<User> {
        return api.patch<User>('/auth/me', data);
    },

    /**
     * Change password
     */
    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        await api.post('/auth/change-password', {
            current_password: currentPassword,
            new_password: newPassword,
        });
    },

    /**
     * Request password reset email
     */
    async forgotPassword(email: string): Promise<void> {
        await api.post('/auth/forgot-password', { email }, false);
    },

    /**
     * Reset password with token
     */
    async resetPassword(token: string, newPassword: string): Promise<void> {
        await api.post('/auth/reset-password', { token, new_password: newPassword }, false);
    },

    /**
     * Verify email with token
     */
    async verifyEmail(token: string): Promise<{ message: string; is_verified: boolean }> {
        return api.get(`/auth/verify-email/${token}`, false);
    },

    /**
     * Resend verification email
     */
    async resendVerification(email: string): Promise<void> {
        await api.post('/auth/resend-verification', { email }, false);
    },

    /**
     * Request account deletion — sends confirmation email.
     * Account is only deleted after user clicks the email link.
     */
    async requestAccountDeletion(): Promise<{ message: string }> {
        return api.delete<{ message: string }>('/auth/me');
    },

    /**
     * Cancel a pending account deletion request.
     */
    async cancelAccountDeletion(): Promise<{ message: string }> {
        return api.post<{ message: string }>('/auth/cancel-delete');
    },

    /**
     * Check if user is authenticated (has valid token)
     */
    async isAuthenticated(): Promise<boolean> {
        const token = await tokenStorage.getAccessToken();
        return !!token;
    },
};

export { ApiClientError };
