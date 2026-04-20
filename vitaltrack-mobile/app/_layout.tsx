/**
 * VitalTrack Mobile - Root Layout
 * Sets up navigation, theme, auth guard, and initializes stores
 */

import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeContext';
import { QueryProvider } from '@/providers/QueryProvider';

// In non-dev builds (EAS preview/production APKs) the LogBox dev overlay
// shouldn't surface warnings to end users — the UI already handles errors
// gracefully. __DEV__ is true only in `expo start` / Metro.
if (!__DEV__) {
  LogBox.ignoreAllLogs();
}

function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const { isAuthenticated, isInitialized: authInitialized } = useAuthStore();

  useEffect(() => {
    if (!authInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Authenticated users shouldn't be in auth group — redirect to app
      router.replace('/(tabs)');
    }
    // Note: unauthenticated users in auth group (login, register, verify-email-pending)
    // stay where they are — this is correct behavior
  }, [isAuthenticated, authInitialized, segments, router]);
}

function RootLayoutContent() {
  const initializeApp = useAppStore((state) => state.initialize);
  const isAppInitialized = useAppStore((state) => state.isInitialized);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const isAuthInitialized = useAuthStore((state) => state.isInitialized);
  const { isDarkMode, colors } = useTheme();

  // Protect routes based on auth state
  useProtectedRoute();

  useEffect(() => {
    // Initialize both stores
    initializeAuth();
    initializeApp();
  }, [initializeAuth, initializeApp]);

  // Show loading while initializing
  if (!isAppInitialized || !isAuthInitialized) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accentBlue} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} backgroundColor={colors.bgPrimary} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgPrimary },
          animation: 'slide_from_right',
        }}
      >
        {/* Auth screens */}
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />

        {/* Main app screens */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="item/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="order/create"
          options={{
            presentation: 'card',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="builder"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="profile"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryProvider>
      <ThemeProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <RootLayoutContent />
        </GestureHandlerRootView>
      </ThemeProvider>
    </QueryProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
