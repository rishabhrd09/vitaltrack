/**
 * StatusPill
 *
 * Single ambient status indicator that consolidates the previously-separate
 * ConnectionStatusPill ("Offline" / "Connecting…") and SavingStatusPill
 * ("Saving…" / "Saving… server warming up") into one component with a clear
 * priority order:
 *
 *   1. Offline                       (no network at all — user can't do anything)
 *   2. Saving…                       (active mutation pending 3+ seconds)
 *   3. Saving… server warming up     (active mutation pending 8+ seconds)
 *   4. Connecting…                   (backend cold-starting, no user action yet)
 *   5. Connecting… server warming up (cold start lingering 5+ seconds)
 *
 * Saving wins over Connecting because the user just took an action and the
 * more specific feedback is more useful. Renders nothing when everything is
 * fine, so zero layout impact in the steady state.
 *
 * Pattern follows Gmail / Linear / Notion ambient connectivity indicators:
 * a small pill anchored under the top bar, no blocking UI.
 *
 * Server-first compliance: this component only reads state from
 * useNetworkStatus, useAuthStore, and TanStack Query's useIsMutating. It
 * never mutates anything, so its worst-case bug is showing the wrong copy
 * — underlying writes and cache are unaffected.
 */

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useIsMutating } from '@tanstack/react-query';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/ThemeContext';
import { useDelayedPending } from '@/hooks/useDelayedPending';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const SAVING_SHOW_DELAY_MS = 3000;
const SAVING_WARMING_DELAY_MS = 8000;
const CONNECTING_WARMING_DELAY_MS = 5000;

type Status =
  | 'online'
  | 'offline'
  | 'saving'
  | 'saving-warming'
  | 'connecting'
  | 'connecting-warming';

export default function StatusPill() {
  const { colors } = useTheme();
  const { isOnline } = useNetworkStatus();
  const isBackendColdStarting = useAuthStore((s) => s.isBackendColdStarting);
  const pendingCount = useIsMutating();
  const isPending = pendingCount > 0;

  // Saving copy ramps after 3s and escalates at 8s.
  const showSaving = useDelayedPending(isPending, SAVING_SHOW_DELAY_MS);
  const showSavingWarming = useDelayedPending(isPending, SAVING_WARMING_DELAY_MS);

  // Connecting escalates after 5s — useDelayedPending doesn't care that the
  // input isn't strictly a mutation, just that it's a sticky boolean.
  const showConnectingWarming = useDelayedPending(
    isBackendColdStarting,
    CONNECTING_WARMING_DELAY_MS,
  );

  const status: Status = !isOnline
    ? 'offline'
    : showSaving
      ? showSavingWarming
        ? 'saving-warming'
        : 'saving'
      : isBackendColdStarting
        ? showConnectingWarming
          ? 'connecting-warming'
          : 'connecting'
        : 'online';

  if (status === 'online') return null;

  const isOffline = status === 'offline';
  const label =
    status === 'offline'
      ? 'Offline'
      : status === 'saving'
        ? 'Saving…'
        : status === 'saving-warming'
          ? 'Saving… server warming up'
          : status === 'connecting'
            ? 'Connecting…'
            : 'Connecting… server warming up';

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: isOffline
              ? 'rgba(245, 158, 11, 0.15)'
              : 'rgba(255, 255, 255, 0.06)',
          },
        ]}
        accessibilityRole="text"
        accessibilityLabel={label}
      >
        {isOffline ? (
          <View style={styles.dot} />
        ) : (
          <ActivityIndicator size="small" color={colors.textMuted} />
        )}
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sizing matches the prior ConnectionStatusPill / SavingStatusPill so any
  // screen swapping its existing pill for StatusPill keeps the same visual
  // footprint and rhythm under the header.
  row: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
});
