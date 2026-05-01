/**
 * SavingStatusPill
 *
 * Passive indicator that reflects TanStack Query mutation state. Renders
 * nothing on fast writes (<3s). Shows "Saving…" when a mutation has been
 * pending 3+ seconds. Expands to "server warming up" after 8+ seconds.
 * Disappears silently when all mutations settle.
 *
 * Pattern: Google Docs / Notion ambient save indicator. Does not modify
 * any mutation — reads pending count from the QueryClient via
 * useIsMutating(). Worst-case bug is a misleading pill; edits themselves
 * stay untouched.
 */

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useIsMutating } from '@tanstack/react-query';
import { useDelayedPending } from '@/hooks/useDelayedPending';
import { useTheme } from '@/theme/ThemeContext';

export default function SavingStatusPill() {
    const { colors } = useTheme();
    const pendingCount = useIsMutating();
    const isPending = pendingCount > 0;

    // Only show after 3 seconds of continuous pending state.
    const showBase = useDelayedPending(isPending, 3000);
    // After a further 5 seconds (8s total), upgrade the copy.
    const showWarming = useDelayedPending(isPending, 8000);

    if (!showBase) return null;

    return (
        <View style={styles.row}>
            <View
                style={[styles.pill, { backgroundColor: 'rgba(255, 255, 255, 0.06)' }]}
                accessibilityRole="text"
                accessibilityLabel={showWarming ? 'Saving, server warming up' : 'Saving'}
            >
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={[styles.label, { color: colors.textMuted }]}>
                    {showWarming ? 'Saving… server warming up' : 'Saving…'}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    // Shape/sizing deliberately mirrors ConnectionStatusPill so the two pills
    // feel consistent when both render simultaneously (offline + pending).
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
    label: {
        fontSize: 11,
        fontWeight: '500',
    },
});
