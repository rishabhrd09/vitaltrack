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
import { logger } from '@/utils/logger';

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
      logger.warn('SecureStore', 'Failed to save value', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (error) {
      logger.warn('SecureStore', 'Failed to remove value', error);
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

// A cold-start attempt belongs to the session that started it. Logging in,
// registering, logging out or initializing again invalidates all old callbacks.
let initializationGeneration = 0;
let initializationController: AbortController | undefined;
let initializationRetry: ReturnType<typeof setTimeout> | undefined;
let initializationDeadline: ReturnType<typeof setTimeout> | undefined;
function invalidateInitialization() {
  initializationGeneration++;
  initializationController?.abort(); initializationController = undefined;
  if (initializationRetry !== undefined) clearTimeout(initializationRetry);
  if (initializationDeadline !== undefined) clearTimeout(initializationDeadline);
  initializationRetry = undefined; initializationDeadline = undefined;
}


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
        invalidateInitialization();
        const generation = initializationGeneration;
        const current = () => generation === initializationGeneration && !get().isLoggingOut;
        const assertCurrent = () => { if (!current()) throw new Error('Session changed.'); };
        set({ isLoading: true, error: null });
        try {
          const token = await tokenStorage.getAccessToken();
          if (!current()) return;
          if (!token) {
            set({ isAuthenticated: false, user: null, isLoading: false, isInitialized: true });
            return;
          }
          initializationController = new AbortController();
          let user: User;
          try {
            user = await Promise.race([
              authService.getProfile(initializationController.signal, assertCurrent),
              new Promise<never>((_, reject) => {
                initializationDeadline = setTimeout(() => reject(new Error('PROFILE_TIMEOUT')), 8000);
              }),
            ]);
          } catch (error) {
            if (!current()) return;
            if ((error as Error).message !== 'PROFILE_TIMEOUT') throw error;
            initializationController?.abort();
            set({ isAuthenticated: !!get().user, isLoading: false, isInitialized: true, isBackendColdStarting: true });
            initializationRetry = setTimeout(async () => {
              initializationRetry = undefined;
              if (!current()) return;
              initializationController = new AbortController();
              try {
                const freshUser = await authService.getProfile(initializationController.signal, assertCurrent);
                if (current()) set({ user: freshUser, isAuthenticated: true, isBackendColdStarting: false });
              } catch { /* A later foreground retry can recover without restoring an old account. */ }
            }, 5000);
            return;
          } finally {
            if (generation === initializationGeneration && initializationDeadline !== undefined) {
              clearTimeout(initializationDeadline); initializationDeadline = undefined;
            }
          }
          if (!current()) return;
          set({ user, isAuthenticated: true, isLoading: false, isInitialized: true, isBackendColdStarting: false });
          try {
            const { queryClient } = await import('@/providers/QueryProvider');
            if (current()) queryClient.invalidateQueries();
          } catch { /* Inventory fetches have their own recovery. */ }
        } catch (error) {
          if (!current()) return;
          if ((error as { status?: number }).status === 401) {
            await tokenStorage.clearTokens();
            if (current()) set({ user: null, isAuthenticated: false, isLoading: false, isInitialized: true, error: null });
          } else {
            set({ isAuthenticated: !!get().user, isLoading: false, isInitialized: true, error: null });
          }
        }
      },

      // =====================================================================
      // LOGIN
      // =====================================================================
      login: async (identifier: string, password: string) => {
        if (get().isLoggingOut) return false;
        invalidateInitialization();
        logger.debug('Auth', 'Login attempt');
        set({ isLoading: true, error: null, isColdStart: false });

        try {
          const response = await authService.login({ identifier, password });

          logger.debug('Auth', 'Login successful');
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
            logger.warn('Auth', 'Failed to clear cache on login', err);
          }

          // Invalidate React Query cache for the new user
          setTimeout(async () => {
            try {
              const { queryClient } = await import('@/providers/QueryProvider');
              queryClient.invalidateQueries();
            } catch (err) {
              logger.warn('Auth', 'Failed to invalidate queries after login', err);
            }
          }, 100);

          return true;
        } catch (error) {
          const err = error as Error;
          logger.warn('Auth', 'Login failed', err);

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
        if (get().isLoggingOut) return false;
        invalidateInitialization();
        logger.debug('Auth', 'Register attempt');
        set({ isLoading: true, error: null });

        try {
          await authService.register(data);
          logger.debug('Auth', 'Registration successful');

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
          logger.warn('Auth', 'Registration failed', err);
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
        invalidateInitialization();
        // Immediately deauthenticate so the UI redirects to login
        set({ user: null, isAuthenticated: false, isLoggingOut: true });

        logger.debug('Auth', 'Logout started');

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
          logger.warn('Auth', 'Logout error', error);
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
          logger.debug('Auth', 'Logout complete');
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
        logger.debug('Auth', 'Forgot password request');
        set({ isLoading: true, error: null });

        try {
          await authService.forgotPassword(email);
          set({ isLoading: false });
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to send reset email';
          logger.warn('Auth', 'Forgot password failed', error);
          set({ isLoading: false, error: message });
          return false;
        }
      },

      // =====================================================================
      // RESET PASSWORD
      // =====================================================================
      resetPassword: async (token: string, newPassword: string): Promise<boolean> => {
        logger.debug('Auth', 'Reset password request');
        set({ isLoading: true, error: null });

        try {
          await authService.resetPassword(token, newPassword);
          set({ isLoading: false });
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to reset password';
          logger.warn('Auth', 'Reset password failed', error);
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
