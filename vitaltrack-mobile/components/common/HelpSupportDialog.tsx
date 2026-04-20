/**
 * Help & Support Dialog
 *
 * Replaces the native Alert.alert so "Refresh from server" can be a small,
 * subtle inline link rather than an equal-weight peer of the OK button.
 * The previous peer-button layout made the sheet feel like a 50/50 choice
 * between "ok" and "nuke the cache."
 */

import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';

interface HelpSupportDialogProps {
    visible: boolean;
    onDismiss: () => void;
    onRefreshFromServer: () => void;
}

export default function HelpSupportDialog({
    visible,
    onDismiss,
    onRefreshFromServer,
}: HelpSupportDialogProps) {
    const { colors } = useTheme();

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
            <Pressable
                style={[styles.backdrop, { backgroundColor: colors.overlayDark }]}
                onPress={onDismiss}
            >
                <Pressable
                    style={[styles.dialog, { backgroundColor: colors.bgCard }]}
                    onPress={(e) => e.stopPropagation()}
                >
                    <Text style={[styles.title, { color: colors.textPrimary }]}>
                        Help & Support
                    </Text>

                    <Text style={[styles.body, { color: colors.textSecondary }]}>
                        Contact support@carekosh.com for assistance.
                    </Text>

                    <TouchableOpacity
                        onPress={() => {
                            onDismiss();
                            onRefreshFromServer();
                        }}
                        activeOpacity={0.6}
                        style={styles.refreshLink}
                    >
                        <Text style={[styles.refreshLinkText, { color: colors.accentBlue }]}>
                            If your inventory looks out of sync, tap here to refresh from server.
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.okButton, { backgroundColor: colors.accentBlue }]}
                        onPress={onDismiss}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.okButtonText, { color: colors.white }]}>OK</Text>
                    </TouchableOpacity>
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
        padding: spacing.xl,
    },
    title: {
        fontSize: fontSize.lg,
        fontWeight: fontWeight.semibold,
        marginBottom: spacing.md,
    },
    body: {
        fontSize: fontSize.md,
        lineHeight: 22,
        marginBottom: spacing.lg,
    },
    refreshLink: {
        paddingVertical: spacing.sm,
        marginBottom: spacing.lg,
    },
    refreshLinkText: {
        fontSize: fontSize.sm,
        lineHeight: 18,
        textDecorationLine: 'underline',
    },
    okButton: {
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    okButtonText: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.semibold,
    },
});
