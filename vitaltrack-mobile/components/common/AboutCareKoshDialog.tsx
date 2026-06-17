/**
 * About CareKosh Dialog
 * Launch-ready app information without placeholder legal links.
 */

import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';

const SUPPORT_EMAIL = 'support@carekosh.com';
const ABOUT_DESCRIPTION =
    'CareKosh helps family caregivers manage critical medical supplies at home.\n\nDesigned for families caring for loved ones with ALS, MND, stroke recovery, and other conditions requiring home ICU setups.';

interface AboutCareKoshDialogProps {
    visible: boolean;
    onDismiss: () => void;
}

export default function AboutCareKoshDialog({
    visible,
    onDismiss,
}: AboutCareKoshDialogProps) {
    const { colors } = useTheme();
    const version = Constants.expoConfig?.version ?? '1.0.0';
    const buildCode = Constants.expoConfig?.android?.versionCode;

    const openSupportEmail = () => {
        Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => { });
    };

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
                    <View style={[styles.iconCircle, { backgroundColor: colors.accentBlueBg }]}>
                        <Ionicons name="medical-outline" size={28} color={colors.accentBlue} />
                    </View>

                    <Text style={[styles.title, { color: colors.textPrimary }]}>CareKosh</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        Home ICU Inventory Management
                    </Text>

                    <Text style={[styles.description, { color: colors.textSecondary }]}>
                        {ABOUT_DESCRIPTION}
                    </Text>

                    <View style={[styles.infoBlock, { borderColor: colors.borderPrimary }]}>
                        <View style={styles.infoRow}>
                            <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Version</Text>
                            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                                v{version}
                            </Text>
                        </View>
                        {typeof buildCode === 'number' && (
                            <View style={styles.infoRow}>
                                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Build</Text>
                                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                                    {buildCode}
                                </Text>
                            </View>
                        )}
                        <View style={styles.infoRow}>
                            <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Contact support</Text>
                            <Text
                                style={[styles.infoValue, styles.emailLink, { color: colors.accentBlue }]}
                                onPress={openSupportEmail}
                            >
                                {SUPPORT_EMAIL}
                            </Text>
                        </View>
                    </View>

                    <Text style={[styles.footer, { color: colors.textMuted }]}>
                        Copyright 2026 CareKosh. All rights reserved.
                    </Text>

                    <TouchableOpacity
                        style={[styles.closeButton, { backgroundColor: colors.accentBlue }]}
                        onPress={onDismiss}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.closeButtonText, { color: colors.white }]}>OK</Text>
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
        maxWidth: 420,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        alignItems: 'center',
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.md,
    },
    title: {
        fontSize: fontSize.xxl,
        fontWeight: fontWeight.bold,
        marginBottom: spacing.xs,
    },
    subtitle: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.medium,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    description: {
        fontSize: fontSize.md,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    infoBlock: {
        alignSelf: 'stretch',
        borderWidth: 1,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md,
    },
    infoLabel: {
        fontSize: fontSize.sm,
        flex: 1,
    },
    infoValue: {
        fontSize: fontSize.sm,
        fontWeight: fontWeight.medium,
        textAlign: 'right',
        flexShrink: 1,
    },
    emailLink: {
        textDecorationLine: 'underline',
    },
    footer: {
        fontSize: fontSize.xs,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    closeButton: {
        alignSelf: 'stretch',
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    closeButtonText: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.semibold,
    },
});
