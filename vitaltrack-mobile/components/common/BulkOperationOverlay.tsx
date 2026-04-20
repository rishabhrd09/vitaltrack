/**
 * BulkOperationOverlay — full-screen touch-blocking modal shown during
 * destructive bulk operations (Start Fresh, Seed, Replace-all).
 *
 * Hard-blocks user interaction so the user can't queue a second destructive
 * op while the first is mid-flight. Swallows the Android back button. After
 * 10s visible, shows a secondary "may be warming up" line to reassure the
 * user on cold-start.
 */

import { useEffect, useState } from 'react';
import { Modal, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';

export interface BulkOperationOverlayProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  progress?: { current: number; total: number };
  phase?: string;
}

export default function BulkOperationOverlay({
  visible,
  title,
  subtitle,
  progress,
  phase,
}: BulkOperationOverlayProps) {
  const { colors } = useTheme();
  const [showSlowMessage, setShowSlowMessage] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowSlowMessage(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowMessage(true), 10_000);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Intentionally swallow Android back button. The operation in progress
        // cannot be cancelled mid-flight without leaving inventory in a
        // partial state, so the user must wait for it to complete.
      }}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          {phase && (
            <Text style={[styles.phase, { color: colors.accentBlue }]}>{phase}</Text>
          )}
          {progress && (
            <Text style={[styles.progress, { color: colors.textTertiary }]}>
              {progress.current} of {progress.total}
            </Text>
          )}
          {subtitle && (
            <Text style={[styles.subtitle, { color: colors.textTertiary }]} numberOfLines={2}>
              {subtitle}
            </Text>
          )}
          {showSlowMessage && (
            <Text style={styles.slowMessage}>
              This is taking longer than usual. Server may be warming up.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    minWidth: 280,
    maxWidth: '90%',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  phase: {
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  progress: {
    fontSize: fontSize.xs,
    marginTop: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.xs,
    marginTop: 4,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  slowMessage: {
    fontSize: 12,
    color: '#f59e0b',
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
