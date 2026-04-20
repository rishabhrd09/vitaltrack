import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAuthStore } from '@/store/useAuthStore';

export default function NetworkBanner() {
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetworkStatus();
  const isBackendColdStarting = useAuthStore((state) => state.isBackendColdStarting);

  // Pad the top by the system-status-bar inset so the banner sits below the
  // clock/battery row (and the Pixel 9 Pro XL camera punch-hole) instead of
  // rendering underneath them at y=0.
  const paddingTop = insets.top + 6;

  if (!isOnline) {
    return (
      <View
        style={{
          backgroundColor: '#f59e0b',
          paddingTop,
          paddingBottom: 6,
          paddingHorizontal: 16,
        }}
      >
        <Text style={{ color: '#000', fontSize: 13, textAlign: 'center', fontWeight: '500' }}>
          You're offline — changes won't save until reconnected
        </Text>
      </View>
    );
  }

  // Backend cold-start: the user is online but the server is still
  // warming from sleep. Mutations will feel slow for ~30-60s. Amber
  // instead of red so it reads as "heads up" rather than "broken."
  if (isBackendColdStarting) {
    return (
      <View
        style={{
          backgroundColor: '#fbbf24',
          paddingTop,
          paddingBottom: 6,
          paddingHorizontal: 16,
        }}
      >
        <Text style={{ color: '#000', fontSize: 13, textAlign: 'center', fontWeight: '500' }}>
          Server is starting up, changes may be slow...
        </Text>
      </View>
    );
  }

  return null;
}
