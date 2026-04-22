/**
 * BulkOperationOverlay — full-screen touch-blocking modal shown during
 * destructive bulk operations (Start Fresh, Seed, Replace-all).
 *
 * Hard-blocks user interaction so the user can't queue a second destructive
 * op while the first is mid-flight. Swallows the Android back button.
 *
 * Timing cues:
 *   - 10s: shows a "may be warming up" reassurance line
 *   - 60s: shows an escape affordance. Tapping it calls `onEscape` (supplied
 *     by the caller) which closes the overlay and refetches server state.
 *     The escape is NOT a cancel — the operation is already in flight
 *     server-side and may still complete. The label reflects that.
 */

import { useEffect, useState } from 'react';
import { Modal, View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';

export interface BulkOperationOverlayProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  progress?: { current: number; total: number };
  phase?: string;
  onEscape?: () => void;
}

export default function BulkOperationOverlay({
  visible,
  title,
  subtitle,
  progress,
  phase,
  onEscape,
}: BulkOperationOverlayProps) {
  const { colors } = useTheme();
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const [showEscape, setShowEscape] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowSlowMessage(false);
      setShowEscape(false);
      return;
    }
    const slowTimer = setTimeout(() => setShowSlowMessage(true), 10_000);
    // 60s is the sweet spot: cold starts are often 30–50s, so a shorter
    // deadline would interrupt ops that are about to succeed. Longer than
    // 90s and users already at "what's going on" don't benefit from more
    // waiting.
    const escapeTimer = setTimeout(() => setShowEscape(true), 60_000);
    return () => {
      clearTimeout(slowTimer);
      clearTimeout(escapeTimer);
    };
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
        // partial state, so the user must wait for it to complete — or use
        // the escape affordance that appears after 60s.
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
          {showSlowMessage && !showEscape && (
            <Text style={styles.slowMessage}>
              This is taking longer than usual. Server may be warming up.
            </Text>
          )}
          {showEscape && onEscape && (
            <TouchableOpacity
              onPress={onEscape}
              style={[styles.escapeButton, { borderColor: colors.borderPrimary }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.escapeText, { color: colors.accentBlue }]}>
                Still waiting? Tap to close and try again later.
              </Text>
            </TouchableOpacity>
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
  escapeButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  escapeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
});
