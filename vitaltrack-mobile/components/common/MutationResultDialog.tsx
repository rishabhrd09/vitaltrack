/**
 * Mutation Result Dialog
 *
 * Centred modal overlay shown for slow-success and connection-failure
 * mutation outcomes — the cold-start scenarios where the user has been
 * waiting and a small bottom toast is too easy to miss.
 *
 * Subscribes to useResultDialogStore. Renders the head of the queue;
 * dismiss pops it and the next one appears. Self-contained — call sites
 * push to the queue via utils/mutationFeedback.ts and forget.
 *
 * Visual style mirrors HelpSupportDialog (centred card on a dimmed
 * backdrop, theme tokens, 400 px max width). Keeps the app feeling
 * consistent rather than introducing a new modal idiom.
 */

import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import { useResultDialogStore } from '@/store/useResultDialogStore';

export default function MutationResultDialog() {
  const { colors } = useTheme();
  const queue = useResultDialogStore((s) => s.queue);
  const dismissCurrent = useResultDialogStore((s) => s.dismissCurrent);

  const current = queue[0];
  const visible = !!current;

  // While dismissing, capture the payload so the modal animates out with
  // its content intact instead of flashing to empty during the fade.
  const payload = current;

  if (!payload) {
    // Mount the Modal with visible=false so React keeps the host alive
    // for the next dispatch — avoids first-show animation lag.
    return (
      <Modal visible={false} transparent animationType="fade" onRequestClose={() => {}}>
        <View />
      </Modal>
    );
  }

  const isSuccess = payload.kind === 'success-slow';
  const iconName = isSuccess ? 'checkmark-circle' : 'cloud-offline-outline';
  const iconColor = isSuccess ? colors.statusGreen : colors.statusRed;
  const iconBg = isSuccess ? colors.statusGreenBg : colors.statusRedBg;

  const handleRetry = () => {
    const cb = payload.onRetry;
    dismissCurrent();
    cb?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismissCurrent}
      // Sits over EVERYTHING including the bottom Toast host, which is
      // what we want — the dialog is the primary feedback surface for
      // these outcomes.
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlayDark }]}
        onPress={dismissCurrent}
      >
        <Pressable
          style={[styles.dialog, { backgroundColor: colors.bgCard }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Close (X) — top right, always present */}
          <TouchableOpacity
            onPress={dismissCurrent}
            style={styles.closeButton}
            hitSlop={12}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          {/* Status icon */}
          <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName as any} size={32} color={iconColor} />
          </View>

          {/* Title + subtitle */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {payload.title}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {payload.subtitle}
          </Text>

          {/* Body copy — 2-3 lines explaining the outcome */}
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {payload.body}
          </Text>

          {/* Actions — Retry (if provided) + Close */}
          <View style={styles.actions}>
            {payload.onRetry && (
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.accentBlue }]}
                onPress={handleRetry}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.accentBlue }]}>
                  Retry
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: colors.accentBlue },
                payload.onRetry ? styles.primaryButtonShared : styles.primaryButtonAlone,
              ]}
              onPress={dismissCurrent}
              activeOpacity={0.8}
            >
              <Text style={[styles.primaryButtonText, { color: colors.white }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    // Match HelpSupportDialog's footprint and the system Alert visual weight.
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: spacing.xs,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  primaryButton: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryButtonAlone: {
    width: '100%',
  },
  primaryButtonShared: {
    flex: 1,
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
});
