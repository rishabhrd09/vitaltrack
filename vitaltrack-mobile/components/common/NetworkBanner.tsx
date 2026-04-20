import { View, Text } from 'react-native';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export default function NetworkBanner() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <View
      style={{
        backgroundColor: '#f59e0b',
        paddingVertical: 6,
        paddingHorizontal: 16,
      }}
    >
      <Text style={{ color: '#000', fontSize: 13, textAlign: 'center', fontWeight: '500' }}>
        You're offline — changes won't save until reconnected
      </Text>
    </View>
  );
}
