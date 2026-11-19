import { useEffect, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { useAuthStore } from '@/store/useAuthStore';
import { captureSession, assertSession } from '@/services/assistantSession';
import { supplyReview } from '@/services/supplyReview';
/** Additive entry: an old/disabled backend leaves the normal profile intact. */
export default function SupplyReviewEntry() {
  const { colors } = useTheme(), router = useRouter();
  const owner = useAuthStore(s => s.isAuthenticated ? s.user?.id : undefined);
  const [availability, setAvailability] = useState({ visible: false, enabled: false });
  useEffect(() => {
    setAvailability({ visible: false, enabled: false }); const abort = new AbortController(); let mounted = true;
    if (owner) {
      try {
        const session = captureSession();
        if (session.owner === owner) void supplyReview.capabilities(session, abort.signal).then(caps => {
          assertSession(session); if (mounted && !abort.signal.aborted) setAvailability({ visible: caps.enabled || caps.has_history === true, enabled: caps.enabled });
        }).catch(() => {});
      } catch { /* Logout can invalidate the session before this effect starts. */ }
    }
    return () => { mounted = false; abort.abort(); };
  }, [owner]);
  if (!availability.visible) return null;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open Supply Review" onPress={() => router.push('/supply-review' as Href)}
    style={{ minHeight: 56, borderRadius: 14, padding: 16, backgroundColor: colors.accentBlueBg, marginBottom: 20 }}>
    <Text style={{ color: colors.accentBlue, fontSize: 17, lineHeight: 24, fontWeight: '600' }}>{availability.enabled ? 'Supply Review' : 'Supply review history'}</Text>
    <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>{availability.enabled ? 'Current stock, incoming orders and a proposal you approve.' : 'Check saved reviews and original orders while new reviews are paused.'}</Text>
  </TouchableOpacity>;
}
