/**
 * VitalTrack Mobile - Auth Store
 * Handles authentication state, login, register, logout.
 * Uses React Query cache invalidation on auth transitions.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, RegisterRequest } from '@/types';
import { authService } from '@/services/auth';
import { tokenStorage, ApiClientError } from '@/services/api';

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
  isColdStart: boolean;
  // True while the backend is believed to be waking from a Render cold
  // start after session init fell back to cached auth. Separate from
  // isColdStart, which is tied to login-failure UX. StatusPill reads
  // this to render the inline "Connecting…" pill, and the Edit Item
  // screen reads it for its cold-start pre-flight warning.
  isBackendColdStarting: boolean;
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
  clearColdStart: () => void;
  setLoading: (loading: boolean) => void;
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
      isColdStart: false,
      isBackendColdStarting: false,
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
                // Flip on the amber banner so the user understands why
                // subsequent mutations may take 30-60s.
                isBackendColdStarting: true,
              });
              // Retry in background after server wakes
              setTimeout(async () => {
                try {
                  const freshUser = await authService.getProfile();
                  set({ user: freshUser, isBackendColdStarting: false });
                  console.log('[Auth] Background profile refresh succeeded');
                } catch {
                  // Leave the flag set — the backend may still be warming
                  // and the next successful API call will clear it.
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
        set({ isLoading: true, error: null, isColdStart: false });

        try {
          const response = await authService.login({ identifier, password });

          console.log('[Auth] Login successful:', response.user.email || response.user.username);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            isColdStart: false,
          });

          // SECURITY: Clear any stale cache from a previous user session on this device
          // before fetching fresh data for the new user. Belt-and-suspenders in case
          // logout's cache clear failed (crash, force-quit).
          try {
            const { queryClient, CACHE_STORAGE_KEY } = await import('@/providers/QueryProvider');
            queryClient.clear();
            try { await AsyncStorage.removeItem(CACHE_STORAGE_KEY); } catch { /* non-critical */ }
          } catch (err) {
            console.warn('[Auth] Failed to clear cache on login:', err);
          }

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

          // Detect cold-start: network failure (status 0) or upstream gateway errors.
          // The login screen watches isColdStart to kick off auto-retry.
          const isColdStart =
            error instanceof ApiClientError &&
            (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504);

          set({
            isLoading: false,
            error: isColdStart
              ? 'CareKosh server is waking up...'
              : err.message || 'Login failed. Please try again.',
            isAuthenticated: false,
            user: null,
            isColdStart,
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

          // Registration must NOT authenticate the user. The backend may still
          // return tokens today for backwards compatibility; we defensively
          // discard them so the account is unverified-and-logged-out until the
          // user confirms their email. Flow then:
          //   register screen → verify-email-pending screen → user clicks email link
          //   → user logs in fresh → dashboard.
          // See PR: registration must not persist auth tokens.
          await tokenStorage.clearTokens();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });

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
      // LOGOUT - Clear all user data for isolation
      // =====================================================================
      logout: async () => {
        // Prevent double-tap
        if (get().isLoggingOut) return;
        // Immediately deauthenticate so the UI redirects to login
        set({ isAuthenticated: false, isLoggingOut: true });

        console.log('[Auth] ========== LOGOUT STARTED ==========');

        try {
          // Logout from backend
          try { await authService.logout(); } catch { /* ignore */ }

          // SECURITY: Clear React Query cache (memory + disk) so the next user on
          // a shared family device cannot see the previous user's inventory data.
          try {
            const { queryClient, CACHE_STORAGE_KEY } = await import('@/providers/QueryProvider');
            queryClient.clear();
            try { await AsyncStorage.removeItem(CACHE_STORAGE_KEY); } catch { /* non-critical — buster will invalidate */ }
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
            isColdStart: false,
            isBackendColdStarting: false,
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

      clearColdStart: () => set({ isColdStart: false }),

      setLoading: (loading: boolean) => set({ isLoading: loading }),

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
