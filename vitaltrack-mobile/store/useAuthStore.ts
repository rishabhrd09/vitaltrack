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
import { syncQueue, isOnline } from '@/services/sync';

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
          const user = await authService.getProfile();

          console.log('[Auth] Profile loaded:', user.email || user.username);
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            isInitialized: true
          });

          // Load user data in background - don't block auth
          setTimeout(async () => {
            try {
              const { useAppStore } = await import('./useAppStore');
              await useAppStore.getState().loadUserData(user.id);

              // Process any queued operations
              const queueSize = await syncQueue.getSize();
              if (queueSize > 0) {
                console.log(`[Auth] Found ${queueSize} queued operations, processing...`);
                await syncQueue.processQueue();
              }
            } catch (err) {
              console.warn('[Auth] Failed to load user data:', err);
            }
          }, 100);
        } catch (error) {
          console.error('[Auth] Initialize failed:', error);
          await tokenStorage.clearTokens();
          set({
            isAuthenticated: false,
            user: null,
            isLoading: false,
            isInitialized: true,
            error: null,
          });
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

          // Load user data in background
          setTimeout(async () => {
            try {
              const { useAppStore } = await import('./useAppStore');
              await useAppStore.getState().loadUserData(response.user.id);

              // Process any queued operations from previous session
              const queueSize = await syncQueue.getSize();
              if (queueSize > 0) {
                console.log(`[Auth] Found ${queueSize} queued operations, processing...`);
                await syncQueue.processQueue();
              }
            } catch (err) {
              console.warn('[Auth] Failed to load user data after login:', err);
            }
          }, 100);

          return true;
        } catch (error) {
          const err = error as Error;
          console.error('[Auth] Login failed:', err.message);
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
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          // Load user data in background - don't block navigation
          setTimeout(async () => {
            try {
              const { useAppStore } = await import('./useAppStore');
              await useAppStore.getState().loadUserData(response.user.id);
            } catch (err) {
              console.warn('[Auth] Failed to load user data after register:', err);
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
        console.log('[Auth] ========== LOGOUT STARTED ==========');
        set({ isLoading: true, syncStatus: 'syncing' });

        try {
          // Check if online
          const online = await isOnline();

          if (online) {
            // Step 0: SYNC LOCAL CHANGES TO BACKEND BEFORE CLEARING (prevents data loss)
            console.log('[Auth] Step 0: Syncing local changes to backend...');
            try {
              const { useAppStore } = await import('./useAppStore');

              // First, process any queued operations
              const queueSize = await syncQueue.getSize();
              if (queueSize > 0) {
                console.log(`[Auth] Processing ${queueSize} queued operations first...`);
                await syncQueue.processQueue();
              }

              // Then sync current state
              const synced = await useAppStore.getState().syncToBackend();
              if (synced) {
                console.log('[Auth] Sync complete');
                set({ syncStatus: 'idle' });
              } else {
                console.warn('[Auth] Sync returned false, but continuing with logout');
              }
            } catch (syncErr) {
              console.warn('[Auth] Sync failed (data queued for next login):', syncErr);
              set({ syncStatus: 'error' });
              // Don't throw - we still want to logout even if sync fails
              // Data is preserved in the sync queue
            }
          } else {
            console.log('[Auth] Offline - skipping sync (data preserved in queue)');
          }

          // Step 1: Clear auth tokens from backend (if online)
          if (online) {
            console.log('[Auth] Step 1: Logging out from backend...');
            try {
              await authService.logout();
            } catch (err) {
              console.warn('[Auth] Backend logout failed (continuing):', err);
            }
          }

          // Step 2: DO NOT clear sync queue - preserve it for data recovery
          // The queue will be processed on next login
          console.log('[Auth] Step 2: Preserving sync queue for data recovery');
          const remainingOps = await syncQueue.getSize();
          if (remainingOps > 0) {
            console.log(`[Auth] ${remainingOps} operations preserved in sync queue`);
          }

          // Step 3: Clear app store data
          console.log('[Auth] Step 3: Clearing app store...');
          try {
            const { useAppStore } = await import('./useAppStore');
            await useAppStore.getState().clearStore();
          } catch (err) {
            console.warn('[Auth] Failed to clear app store:', err);
          }

          // Step 4: Clear tokens from secure storage
          console.log('[Auth] Step 4: Clearing tokens...');
          await tokenStorage.clearTokens();

          // Step 5: Reset auth state
          console.log('[Auth] Step 5: Resetting auth state...');
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            syncStatus: 'idle',
          });

          console.log('[Auth] ========== LOGOUT COMPLETE ==========');
        } catch (error) {
          console.error('[Auth] Logout error:', error);
          // Force logout even on error
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            syncStatus: 'idle',
          });
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
