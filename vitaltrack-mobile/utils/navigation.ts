/**
 * Navigation helpers
 *
 * safeBack() pops the current screen if there is a parent to return to;
 * otherwise it routes to the dashboard. Prevents the React Navigation
 * "GO_BACK was not handled" warning that surfaces (in dev / Expo Go) when
 * back is called on a screen with no parent — e.g. after a deep-link cold
 * launch, or when an Alert.alert callback fires after the user has already
 * navigated away during a slow background mutation.
 *
 * Use this everywhere in place of router.back() unless you specifically
 * need to no-op when there is no parent (rare).
 */

import { router } from 'expo-router';

export function safeBack(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/(tabs)');
}
