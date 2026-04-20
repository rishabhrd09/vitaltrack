/**
 * ConnectionStatusPill
 *
 * Small inline pill shown in the top bar when the device is offline or the
 * backend is cold-starting. Renders nothing when online — zero layout impact,
 * so there is no content shift when state changes. Pattern follows Gmail /
 * Linear / Notion connectivity indicators.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/ThemeContext';

type Status = 'online' | 'connecting' | 'offline';

export default function ConnectionStatusPill() {
  const { colors } = useTheme();
  const [isOnline, setIsOnline] = useState(true);
  const isBackendColdStarting = useAuthStore((s) => s.isBackendColdStarting);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected === true);
    });
    return () => unsub();
  }, []);

  let status: Status = 'online';
  if (!isOnline) status = 'offline';
  else if (isBackendColdStarting) status = 'connecting';

  if (status === 'online') return null;

  const isOffline = status === 'offline';

  return (
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
      accessibilityLabel={isOffline ? 'Offline' : 'Connecting to server'}
    >
      {isOffline ? (
        <View style={styles.dot} />
      ) : (
        <ActivityIndicator size="small" color={colors.textMuted} />
      )}
      <Text style={[styles.label, { color: colors.textMuted }]}>
        {isOffline ? 'Offline' : 'Connecting…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
