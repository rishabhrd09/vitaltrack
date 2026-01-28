/**
 * VitalTrack Mobile - Auth Store
 * Authentication state management with Zustand
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '@/services/auth';
import { tokenStorage } from '@/services/api';
import type { User, RegisterRequest } from '@/types';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    isInitialized: boolean;
    error: string | null;
}

interface AuthActions {
    // Auth flow
    login: (identifier: string, password: string) => Promise<boolean>;
    register: (data: RegisterRequest) => Promise<boolean>;
    logout: () => Promise<void>;

    // Profile
    fetchProfile: () => Promise<void>;
    updateProfile: (data: Partial<User>) => Promise<boolean>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;

    // Password reset (no auth required)
    forgotPassword: (email: string) => Promise<boolean>;
    resetPassword: (token: string, newPassword: string) => Promise<boolean>;

    // Email verification
    verifyEmail: (token: string) => Promise<boolean>;
    resendVerification: (email: string) => Promise<boolean>;

    // State management
    setUser: (user: User | null) => void;
    setError: (error: string | null) => void;
    clearError: () => void;

    // Initialization
    initialize: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
    persist(
        (set, get) => ({
            // Initial state
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: false,
            error: null,

            // Login
            login: async (identifier, password) => {
                set({ isLoading: true, error: null });
                try {
                    const response = await authService.login({ identifier, password });
                    set({
                        user: response.user,
                        isAuthenticated: true,
                        isLoading: false,
                    });
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Login failed';
                    set({ error: message, isLoading: false });
                    return false;
                }
            },

            // Register
            register: async (data) => {
                set({ isLoading: true, error: null });
                try {
                    const response = await authService.register(data);
                    set({
                        user: response.user,
                        isAuthenticated: true,
                        isLoading: false,
                    });
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Registration failed';
                    set({ error: message, isLoading: false });
                    return false;
                }
            },

            // Logout
            logout: async () => {
                set({ isLoading: true });
                try {
                    await authService.logout();
                } finally {
                    set({
                        user: null,
                        isAuthenticated: false,
                        isLoading: false,
                        error: null,
                    });
                }
            },

            // Fetch profile
            fetchProfile: async () => {
                try {
                    const user = await authService.getProfile();
                    set({ user, isAuthenticated: true });
                } catch {
                    // Token invalid, clear auth state
                    await tokenStorage.clearTokens();
                    set({ user: null, isAuthenticated: false });
                }
            },

            // Update profile
            updateProfile: async (data) => {
                set({ isLoading: true, error: null });
                try {
                    const user = await authService.updateProfile(data);
                    set({ user, isLoading: false });
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Update failed';
                    set({ error: message, isLoading: false });
                    return false;
                }
            },

            // Change password
            changePassword: async (currentPassword, newPassword) => {
                set({ isLoading: true, error: null });
                try {
                    await authService.changePassword(currentPassword, newPassword);
                    set({ isLoading: false });
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Password change failed';
                    set({ error: message, isLoading: false });
                    return false;
                }
            },

            // Forgot password
            forgotPassword: async (email) => {
                set({ isLoading: true, error: null });
                try {
                    await authService.forgotPassword(email);
                    set({ isLoading: false });
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Request failed';
                    set({ error: message, isLoading: false });
                    return false;
                }
            },

            // Reset password
            resetPassword: async (token, newPassword) => {
                set({ isLoading: true, error: null });
                try {
                    await authService.resetPassword(token, newPassword);
                    set({ isLoading: false });
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Reset failed';
                    set({ error: message, isLoading: false });
                    return false;
                }
            },

            // Verify email
            verifyEmail: async (token) => {
                set({ isLoading: true, error: null });
                try {
                    await authService.verifyEmail(token);
                    // Update user's email verified status
                    const { user } = get();
                    if (user) {
                        set({ user: { ...user, isEmailVerified: true }, isLoading: false });
                    } else {
                        set({ isLoading: false });
                    }
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Verification failed';
                    set({ error: message, isLoading: false });
                    return false;
                }
            },

            // Resend verification
            resendVerification: async (email) => {
                set({ isLoading: true, error: null });
                try {
                    await authService.resendVerification(email);
                    set({ isLoading: false });
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Request failed';
                    set({ error: message, isLoading: false });
                    return false;
                }
            },

            // Set user
            setUser: (user) => set({ user, isAuthenticated: !!user }),

            // Set error
            setError: (error) => set({ error }),

            // Clear error
            clearError: () => set({ error: null }),

            // Initialize auth state
            initialize: async () => {
                if (get().isInitialized) return;

                set({ isLoading: true });
                try {
                    const hasToken = await authService.isAuthenticated();
                    if (hasToken) {
                        await get().fetchProfile();
                    }
                } finally {
                    set({ isLoading: false, isInitialized: true });
                }
            },
        }),
        {
            name: 'vitaltrack-auth',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);
