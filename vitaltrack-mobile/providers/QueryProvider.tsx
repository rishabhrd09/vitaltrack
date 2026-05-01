import React from 'react';
import { AppState } from 'react-native';
import { MutationCache, QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { toast } from '@/utils/toast';

/**
 * Safety notes — why this is different from the old Zustand persist that caused data corruption:
 *
 * - Cache is READ-ONLY for display. Mutations always hit the server; the server is the
 *   source of truth. Cached data is never written back.
 * - Data flows one direction: server → cache → screen. A stale entry can at worst show
 *   the wrong thing briefly before the background refetch replaces it (staleTime=30s).
 * - Auth-related queries are excluded from persistence via shouldDehydrateQuery, so a
 *   deleted account cannot appear "logged in" from disk.
 * - On logout/login we clear both the in-memory cache and the AsyncStorage blob so shared
 *   devices don't leak data between users.
 */

// React Native doesn't have "window focus" events. Wire AppState to TanStack Query's
// focus manager so refetchOnWindowFocus actually triggers when the app returns to foreground.
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => subscription.remove();
});

/**
 * Set to false to instantly disable cache persistence.
 * When false, app behaves exactly as before this PR.
 */
const ENABLE_CACHE_PERSISTENCE = true;

const CACHE_STORAGE_KEY = 'carekosh-query-cache';

const queryClient = new QueryClient({
  // Global safety net for mutation errors the caller didn't handle.
  // Non-blocking toast (instead of Alert) so it doesn't interrupt whichever
  // screen the user navigated to during a slow background save. Tapping
  // the toast re-runs the same mutation through TanStack Query's state
  // machine via Mutation.execute(variables), so per-item "Updating…"
  // indicators light up again on retry.
  mutationCache: new MutationCache({
    onError: (error, variables, _context, mutation) => {
      if (mutation.options.onError) return;
      const msg = error instanceof Error ? error.message : String(error);
      toast.error("Couldn't save", {
        description: `${msg} — Tap to retry`,
        onRetry: () => {
          // execute() re-runs the mutationFn through the existing Mutation
          // instance, so onSuccess / invalidateQueries fire normally. Cast
          // is needed because MutationCache.onError types variables as
          // unknown; the runtime contract is that they're the same object
          // the caller originally passed to mutate().
          void mutation.execute(variables as never);
        },
      });
    },
  }),
  defaultOptions: {
    queries: {
      // 30 seconds — medical inventory needs fresh data. Two caregivers on two
      // devices must see each other's updates within 30 seconds. staleTime controls
      // refetch frequency; gcTime below controls persistence lifetime. Independent concerns.
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24, // 24 hours — cache survives on disk between app sessions
      retry: 3,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // Serve cached data when offline instead of failing the query. With the
      // default ('online') networkMode, TanStack Query pauses and the screen
      // renders a "Failed to load data" state. 'offlineFirst' returns the last
      // cached value immediately so users still see their inventory/orders;
      // a background refetch runs once connectivity returns.
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 0,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: CACHE_STORAGE_KEY,
  throttleTime: 1000,
});

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  if (ENABLE_CACHE_PERSISTENCE) {
    return (
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: asyncStoragePersister,
          // Schema version buster — when app version changes, old cached data is
          // discarded automatically. Prevents runtime crashes from cached data with
          // old response shapes after API changes.
          buster: Constants.expoConfig?.version ?? '1.0.0',
          dehydrateOptions: {
            // SECURITY: Do NOT persist auth-related queries to disk. After account
            // deletion, a cached /auth/me would show user as "logged in" until the
            // network round-trip replaces it. Only persist inventory/order/category data.
            shouldDehydrateQuery: (query) => {
              const key = query.queryKey[0];
              const isAuthQuery = key === 'auth' || key === 'user' || key === 'me';
              return query.state.status === 'success' && !isAuthQuery;
            },
          },
        }}
      >
        {children}
      </PersistQueryClientProvider>
    );
  }

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export { queryClient, CACHE_STORAGE_KEY };
