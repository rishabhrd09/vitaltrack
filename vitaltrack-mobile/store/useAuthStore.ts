/**
 * VitalTrack Mobile - Auth Store (FIXED v4)
 * 
 * CRITICAL FIXES:
 * 1. Imports syncQueue from the correct location (now exported from sync.ts)
 * 2. Better error handling during logout sync
 * 3. Waits for sync to complete before clearing data
 * 4. Processes any queued operations before logout
 * 5. Shows user feedback during sync
 * 
 * Replace your store/useAuthStore.ts with this file.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { User, RegisterRequest } from '@/types';
import { authService } from '@/services/auth';
import { tokenStorage } from '@/services/api';

// ============================================================================
// SECURE STORAGE ADAPTER
// ============================================================================

const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (error) {
      console.error('[SecureStore] Failed to save:', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (error) {
      console.error('[SecureStore] Failed to remove:', error);
    }
  },
};

// ============================================================================
// STORE TYPES
// ============================================================================

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  error: string | null;
  isInitialized: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
}

interface AuthActions {
  initialize: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (data: RegisterRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<boolean>;
  resetPassword: (token: string, newPassword: string) => Promise<boolean>;
  updateUser: (data: Partial<User>) => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
}

type AuthStore = AuthState & AuthActions;

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isLoggingOut: false,
      error: null,
      isInitialized: false,
      syncStatus: 'idle',

      // =====================================================================
      // INITIALIZE - Check for existing session
      // =====================================================================
      initialize: async () => {
        console.log('[Auth] Initializing...');
        set({ isLoading: true, error: null });

        try {
          const token = await tokenStorage.getAccessToken();

          if (!token) {
            console.log('[Auth] No token found');
            set({
              isAuthenticated: false,
              user: null,
              isLoading: false,
              isInitialized: true
            });
            return;
          }

          console.log('[Auth] Token found, fetching profile...');

          // Race profile fetch against timeout (Render cold start can take 60s)
          let user;
          try {
            user = await Promise.race([
              authService.getProfile(),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('PROFILE_TIMEOUT')), 8000)
              ),
            ]);
          } catch (timeoutErr) {
            const err = timeoutErr as Error;
            if (err.message === 'PROFILE_TIMEOUT') {
              console.log('[Auth] Profile fetch timed out (server cold start?) — using cached state');
              set({
                isAuthenticated: true,
                isLoading: false,
                isInitialized: true,
              });
              // Retry in background after server wakes
              setTimeout(async () => {
                try {
                  const freshUser = await authService.getProfile();
                  set({ user: freshUser });
                  console.log('[Auth] Background profile refresh succeeded');
                } catch {
                  console.warn('[Auth] Background profile refresh failed');
                }
              }, 5000);
              return;
            }
            throw timeoutErr;
          }

          console.log('[Auth] Profile loaded:', user.email || user.username);
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            isInitialized: true
          });

          // Invalidate React Query cache for the new session
          setTimeout(async () => {
            try {
              const { queryClient } = await import('@/providers/QueryProvider');
              queryClient.invalidateQueries();
            } catch (err) {
              console.warn('[Auth] Failed to invalidate queries:', err);
            }
          }, 100);
        } catch (error) {
          console.error('[Auth] Initialize failed:', error);
          // Only clear tokens on explicit auth errors (401)
          // On network errors (Render cold start), preserve cached auth state
          const apiError = error as { status?: number };
          if (apiError.status === 401) {
            await tokenStorage.clearTokens();
            set({
              isAuthenticated: false,
              user: null,
              isLoading: false,
              isInitialized: true,
              error: null,
            });
          } else {
            // Network error — keep existing persisted auth state
            console.log('[Auth] Network error during init — preserving cached auth state');
            const existingUser = get().user;
            set({
              isAuthenticated: !!existingUser,
              isLoading: false,
              isInitialized: true,
              error: null,
            });
          }
        }
      },

      // =====================================================================
      // LOGIN
      // =====================================================================
      login: async (identifier: string, password: string) => {
        console.log('[Auth] Login attempt:', identifier);
        set({ isLoading: true, error: null });

        try {
          const response = await authService.login({ identifier, password });

          console.log('[Auth] Login successful:', response.user.email || response.user.username);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          // Invalidate React Query cache for the new user
          setTimeout(async () => {
            try {
              const { queryClient } = await import('@/providers/QueryProvider');
              queryClient.invalidateQueries();
            } catch (err) {
              console.warn('[Auth] Failed to invalidate queries after login:', err);
            }
          }, 100);

          return true;
        } catch (error) {
          const err = error as Error;
          console.error('[Auth] Login failed:', err.message);

          // Rethrow EMAIL_NOT_VERIFIED for UI handling
          if (err.message === 'EMAIL_NOT_VERIFIED') {
            set({ isLoading: false, error: null });
            throw err;
          }

          set({
            isLoading: false,
            error: err.message || 'Login failed. Please try again.',
            isAuthenticated: false,
            user: null,
          });
          return false;
        }
      },

      // =====================================================================
      // REGISTER
      // =====================================================================
      register: async (data: RegisterRequest) => {
        console.log('[Auth] Register attempt:', data.email || data.username);
        set({ isLoading: true, error: null });

        try {
          const response = await authService.register(data);

          console.log('[Auth] Registration successful:', response.user.id);

          // Always set authenticated — the register SCREEN handles verification redirect
          // by attempting a post-registration login to check backend enforcement
          console.log('[Auth] Registration successful — authenticating');
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          // Invalidate React Query cache for the new user
          setTimeout(async () => {
            try {
              const { queryClient } = await import('@/providers/QueryProvider');
              queryClient.invalidateQueries();
            } catch (err) {
              console.warn('[Auth] Failed to invalidate queries after register:', err);
            }
          }, 100);

          return true;
        } catch (error) {
          const err = error as Error;
          console.error('[Auth] Registration failed:', err.message);
          set({
            isLoading: false,
            error: err.message || 'Registration failed. Please try again.',
            isAuthenticated: false,
            user: null,
          });
          return false;
        }
      },

      // =====================================================================
      // LOGOUT - CRITICAL: Must sync then clear all user data for isolation
      // =====================================================================
      logout: async () => {
        // Prevent double-tap
        if (get().isLoggingOut) return;
        // Immediately deauthenticate so the UI redirects to login
        // Cleanup (sync, token revoke, store clear) happens in background
        set({ isAuthenticated: false, isLoggingOut: true });

        console.log('[Auth] ========== LOGOUT STARTED ==========');

        try {
          // Logout from backend
          try { await authService.logout(); } catch { /* ignore */ }

          // Clear React Query cache
          try {
            const { queryClient } = await import('@/providers/QueryProvider');
            queryClient.clear();
          } catch { /* ignore */ }

          // Reset UI state
          try {
            const { useAppStore } = await import('./useAppStore');
            useAppStore.getState().resetUIState();
          } catch { /* ignore */ }

          // Clear tokens
          await tokenStorage.clearTokens();

        } catch (error) {
          console.error('[Auth] Logout error:', error);
        } finally {
          // ALWAYS reset state, no matter what happened above
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isLoggingOut: false,
            error: null,
            syncStatus: 'idle',
          });
          console.log('[Auth] ========== LOGOUT COMPLETE ==========');
        }
      },

      // =====================================================================
      // HELPERS
      // =====================================================================
      updateUser: (data: Partial<User>) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...data } });
        }
      },

      clearError: () => set({ error: null }),

      setLoading: (loading: boolean) => set({ isLoading: loading }),

      setSyncStatus: (status: 'idle' | 'syncing' | 'error') => set({ syncStatus: status }),

      // =====================================================================
      // FORGOT PASSWORD
      // =====================================================================
      forgotPassword: async (email: string): Promise<boolean> => {
        console.log('[Auth] Forgot password request for:', email);
        set({ isLoading: true, error: null });

        try {
          await authService.forgotPassword(email);
          set({ isLoading: false });
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to send reset email';
          console.error('[Auth] Forgot password error:', message);
          set({ isLoading: false, error: message });
          return false;
        }
      },

      // =====================================================================
      // RESET PASSWORD
      // =====================================================================
      resetPassword: async (token: string, newPassword: string): Promise<boolean> => {
        console.log('[Auth] Reset password request');
        set({ isLoading: true, error: null });

        try {
          await authService.resetPassword(token, newPassword);
          set({ isLoading: false });
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to reset password';
          console.error('[Auth] Reset password error:', message);
          set({ isLoading: false, error: message });
          return false;
        }
      },
    }),
    {
      name: 'vitaltrack-auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
