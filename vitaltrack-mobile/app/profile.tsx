/**
 * VitalTrack Mobile - Profile Screen
 * Displays user info and provides account deletion with email confirmation.
 */

import { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Alert,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { authService } from '@/services/auth';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';

export default function ProfileScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const user = useAuthStore((state) => state.user);
    const [isRequesting, setIsRequesting] = useState(false);

    const handleDeleteAccount = () => {
        Alert.alert(
            'Delete Account',
            'This will permanently delete your account and ALL your data — inventory items, categories, orders, and activity history.\n\nA confirmation email will be sent to your registered email address. Your account will only be deleted after you click the confirmation link.\n\nThis action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Yes, Send Confirmation',
                    style: 'destructive',
                    onPress: async () => {
                        setIsRequesting(true);
                        try {
                            const response = await authService.requestAccountDeletion();
                            Alert.alert(
                                'Check Your Email',
                                response.message,
                                [{ text: 'OK', onPress: () => router.back() }]
                            );
                        } catch (error) {
                            const err = error as Error;
                            Alert.alert(
                                'Error',
                                err.message || 'Failed to request deletion. Please try again.'
                            );
                        } finally {
                            setIsRequesting(false);
                        }
                    },
                },
            ]
        );
    };

    const dynamicStyles = createDynamicStyles(colors);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.borderPrimary }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Profile</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Avatar */}
                <View style={styles.avatarContainer}>
                    <View style={[styles.avatar, { backgroundColor: colors.accentBlue }]}>
                        <Text style={[styles.avatarInitials, { color: colors.white }]}>
                            {(user?.name || user?.username || '?')
                                .split(' ')
                                .map((p) => p[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)}
                        </Text>
                    </View>
                    <Text style={[styles.displayName, { color: colors.textPrimary }]}>
                        {user?.name || user?.username || '—'}
                    </Text>
                </View>

                {/* Personal Information Card */}
                <View style={[dynamicStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
                    <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Personal Information</Text>

                    <View style={[styles.field, { borderBottomColor: colors.borderPrimary }]}>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
                        <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>
                            {user?.name || '—'}
                        </Text>
                    </View>

                    <View style={[styles.field, { borderBottomColor: colors.borderPrimary }]}>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Username</Text>
                        <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>
                            {user?.username || 'Not set'}
                        </Text>
                    </View>

                    <View style={styles.fieldLast}>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
                        <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>
                            {user?.email || '—'}
                        </Text>
                    </View>
                </View>

                {/* Account deletion card — red border signals destructive intent without alarmist copy */}
                <View style={[dynamicStyles.card, dynamicStyles.dangerCard, { borderColor: colors.statusRed }]}>
                    <Text style={[styles.dangerDescription, { color: colors.textSecondary }]}>
                        Deleting your account will permanently remove all your data including inventory
                        items, categories, orders, and activity history. A confirmation email will be
                        sent before any data is deleted.
                    </Text>

                    <TouchableOpacity
                        style={[dynamicStyles.deleteButton, { backgroundColor: colors.statusRed }]}
                        onPress={handleDeleteAccount}
                        disabled={isRequesting}
                        activeOpacity={0.8}
                    >
                        {isRequesting ? (
                            <ActivityIndicator color={colors.white} size="small" />
                        ) : (
                            <>
                                <Ionicons name="trash-outline" size={18} color={colors.white} />
                                <Text style={[styles.deleteButtonText, { color: colors.white }]}>
                                    Delete My Account
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const createDynamicStyles = (colors: Record<string, string>) =>
    StyleSheet.create({
        card: {
            borderRadius: borderRadius.lg,
            borderWidth: 1,
            padding: spacing.lg,
            marginBottom: spacing.lg,
        },
        dangerCard: {
            backgroundColor: 'transparent',
        },
        deleteButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: spacing.md,
            borderRadius: borderRadius.md,
            gap: spacing.sm,
            marginTop: spacing.lg,
        },
    });

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: spacing.xs,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: fontSize.lg,
        fontWeight: fontWeight.semibold,
    },
    headerSpacer: {
        width: 32,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: spacing.lg,
        paddingBottom: spacing.xxl || spacing.xl * 2,
    },
    avatarContainer: {
        alignItems: 'center',
        marginBottom: spacing.xl,
        marginTop: spacing.md,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    avatarInitials: {
        fontSize: 32,
        fontWeight: fontWeight.bold,
    },
    displayName: {
        fontSize: fontSize.xl,
        fontWeight: fontWeight.semibold,
    },
    cardTitle: {
        fontSize: fontSize.sm,
        fontWeight: fontWeight.medium,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing.md,
    },
    field: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
    },
    fieldLast: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: spacing.md,
    },
    fieldLabel: {
        fontSize: fontSize.md,
    },
    fieldValue: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.medium,
        maxWidth: '60%',
        textAlign: 'right',
    },
    dangerDescription: {
        fontSize: fontSize.sm,
        lineHeight: 20,
    },
    deleteButtonText: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.medium,
    },
});
