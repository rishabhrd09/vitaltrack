/**
 * VitalTrack Mobile - Profile Screen
 * Displays user info and provides account deletion with email confirmation.
 */

import { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Alert,
    ActivityIndicator,
    TouchableOpacity,
    TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/useAuthStore';
import { authService } from '@/services/auth';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import { safeBack } from '@/utils/navigation';
import { logger } from '@/utils/logger';

const DELETION_POLL_INTERVAL_MS = 5000;
const DELETION_POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export default function ProfileScreen() {
    const { colors } = useTheme();
    const user = useAuthStore((state) => state.user);
    const updateUser = useAuthStore((state) => state.updateUser);
    const [isRequesting, setIsRequesting] = useState(false);
    const [name, setName] = useState(user?.name ?? '');
    const [username, setUsername] = useState((user?.username ?? '').toLowerCase());
    const [touchedFields, setTouchedFields] = useState({ name: false, username: false });
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Interval for polling /auth/me after deletion email is sent. When the
    // backend deletes the account, the next poll returns 401/404 → the api.ts
    // interceptor triggers auto-logout → route guard redirects to /login.
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        setName(user?.name ?? '');
        setUsername((user?.username ?? '').toLowerCase());
        setTouchedFields({ name: false, username: false });
        setUsernameError(null);
        setFormError(null);
    }, [user?.id, user?.name, user?.username]);

    const currentName = (user?.name ?? '').trim();
    const currentUsername = (user?.username ?? '').trim().toLowerCase();
    const trimmedName = name.trim();
    const normalizedUsername = username.trim().toLowerCase();
    const emailVerificationState =
        typeof user?.isEmailVerified === 'boolean' ? user.isEmailVerified : null;

    const nameValidationError = trimmedName.length === 0 ? 'Name is required.' : null;
    const usernameValidationError =
        normalizedUsername.length === 0
            ? 'Username is required.'
            : normalizedUsername.length < 3 || normalizedUsername.length > 50
                ? 'Username must be 3-50 characters.'
                : USERNAME_PATTERN.test(normalizedUsername)
                    ? null
                    : 'Use lowercase letters, numbers, and underscores only.';
    const hasChanges = trimmedName !== currentName || normalizedUsername !== currentUsername;
    const isSaveDisabled =
        !hasChanges ||
        isSaving ||
        Boolean(nameValidationError) ||
        Boolean(usernameValidationError) ||
        Boolean(usernameError);

    const handleNameChange = (value: string) => {
        setName(value);
        setFormError(null);
    };

    const handleUsernameChange = (value: string) => {
        setUsername(value.toLowerCase());
        setUsernameError(null);
        setFormError(null);
    };

    const handleSave = async () => {
        setTouchedFields({ name: true, username: true });
        if (isSaveDisabled) return;

        setIsSaving(true);
        setUsernameError(null);
        setFormError(null);

        try {
            const profile = await authService.updateProfile({
                name: trimmedName,
                username: normalizedUsername,
            });
            updateUser(profile);
            Alert.alert('Profile updated', 'Your profile has been saved.');
        } catch (error) {
            const status = (error as { status?: number }).status;
            const message = error instanceof Error ? error.message : 'Failed to save profile.';
            if (status === 400 && message === 'Username already taken') {
                setUsernameError(message);
            } else {
                setFormError(message);
                Alert.alert('Unable to save profile', message);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const startDeletionPolling = () => {
        if (pollRef.current) return;
        const pollStart = Date.now();
        logger.info('Auth', 'Account deletion polling started');

        pollRef.current = setInterval(async () => {
            if (Date.now() - pollStart > DELETION_POLL_TIMEOUT_MS) {
                if (pollRef.current) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                }
                logger.info('Auth', 'Account deletion polling timed out');
                return;
            }
            try {
                await authService.getProfile();
                logger.debug('Auth', 'Account deletion poll still authenticated');
            } catch (err) {
                const status = (err as { status?: number }).status;
                if (status === 401 || status === 404) {
                    if (pollRef.current) {
                        clearInterval(pollRef.current);
                        pollRef.current = null;
                    }
                    logger.info('Auth', 'Account deletion poll detected deletion');
                    Alert.alert(
                        'Account Deleted',
                        'Your CareKosh account has been permanently deleted.',
                        [{ text: 'OK' }]
                    );
                    // api.ts interceptor already triggered logout() on the 401;
                    // the route guard handles navigation back to /login.
                }
            }
        }, DELETION_POLL_INTERVAL_MS);
    };

    const handleDeleteAccount = () => {
        // Guard 1: re-entry check — prevents a second Alert from opening while
        // one is already being processed. Critical during cold starts where
        // the network request hangs 30-60s and the button is visually active
        // but still in-flight.
        if (isRequesting) return;

        // Guard 2: flip the busy flag BEFORE opening the Alert. That keeps
        // the TouchableOpacity's `disabled` prop true and the spinner visible
        // for the entire interaction, not just the network wait.
        setIsRequesting(true);

        Alert.alert(
            'Delete Account',
            'This will permanently delete your account and ALL your data — inventory items, categories, orders, and activity history.\n\nA confirmation email will be sent to your registered email address. Your account will only be deleted after you click the confirmation link.\n\nThis action cannot be undone.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    // Reset the busy flag if they back out — otherwise the button
                    // stays permanently disabled until the screen remounts.
                    onPress: () => setIsRequesting(false),
                },
                {
                    text: 'Send confirmation email',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const response = await authService.requestAccountDeletion();
                            logger.info('Auth', 'Account deletion requested');
                            Alert.alert(
                                'Check your email',
                                response.message ||
                                    'Tap the confirmation link in your email to complete deletion. You will be signed out automatically.',
                                [{ text: 'OK' }]
                            );
                            startDeletionPolling();
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
            ],
            // If the user dismisses the Alert by tapping outside (Android),
            // onDismiss fires without either button's onPress — reset here too.
            { onDismiss: () => setIsRequesting(false) }
        );
    };

    const dynamicStyles = createDynamicStyles(colors);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.borderPrimary }]}>
                <TouchableOpacity onPress={() => safeBack()} style={styles.backButton} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Edit profile</Text>
                <TouchableOpacity
                    onPress={handleSave}
                    style={[
                        styles.saveButton,
                        { backgroundColor: colors.accentBlue },
                        isSaveDisabled && styles.saveButtonDisabled,
                    ]}
                    disabled={isSaveDisabled}
                    activeOpacity={0.8}
                >
                    {isSaving ? (
                        <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                        <Text style={[styles.saveButtonText, { color: colors.white }]}>Save</Text>
                    )}
                </TouchableOpacity>
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
                        {trimmedName || normalizedUsername || '—'}
                    </Text>
                </View>

                {/* Personal Information Card */}
                <View style={[dynamicStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
                    <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Personal Information</Text>

                    <View style={[styles.field, { borderBottomColor: colors.borderPrimary }]}>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
                        <TextInput
                            style={[
                                styles.fieldInput,
                                { color: colors.textPrimary, borderColor: colors.borderPrimary },
                            ]}
                            value={name}
                            onChangeText={handleNameChange}
                            onFocus={() => setTouchedFields((fields) => ({ ...fields, name: true }))}
                            placeholder="Enter your name"
                            placeholderTextColor={colors.textTertiary}
                            autoCorrect={false}
                            returnKeyType="next"
                        />
                        {touchedFields.name && nameValidationError && (
                            <Text style={[styles.fieldError, { color: colors.statusRed }]}>
                                {nameValidationError}
                            </Text>
                        )}
                    </View>

                    <View style={[styles.field, { borderBottomColor: colors.borderPrimary }]}>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Username</Text>
                        <TextInput
                            style={[
                                styles.fieldInput,
                                { color: colors.textPrimary, borderColor: colors.borderPrimary },
                            ]}
                            value={username}
                            onChangeText={handleUsernameChange}
                            onFocus={() => setTouchedFields((fields) => ({ ...fields, username: true }))}
                            placeholder="username"
                            placeholderTextColor={colors.textTertiary}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="done"
                        />
                        {touchedFields.username && usernameValidationError && (
                            <Text style={[styles.fieldError, { color: colors.statusRed }]}>
                                {usernameValidationError}
                            </Text>
                        )}
                        {usernameError && (
                            <Text style={[styles.fieldError, { color: colors.statusRed }]}>
                                {usernameError}
                            </Text>
                        )}
                    </View>

                    <View style={styles.fieldLast}>
                        <View style={styles.emailLabelRow}>
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
                            {emailVerificationState !== null && (
                                <View
                                    style={[
                                        styles.emailBadge,
                                        {
                                            backgroundColor: emailVerificationState
                                                ? colors.statusGreenBg
                                                : colors.statusOrangeBg,
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.emailBadgeText,
                                            {
                                                color: emailVerificationState
                                                    ? colors.statusGreen
                                                    : colors.statusOrange,
                                            },
                                        ]}
                                    >
                                        {emailVerificationState ? 'Verified' : 'Unverified'}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <TextInput
                            style={[
                                styles.fieldInput,
                                styles.readOnlyInput,
                                {
                                    color: colors.textSecondary,
                                    borderColor: colors.borderPrimary,
                                    backgroundColor: colors.bgTertiary,
                                },
                            ]}
                            value={user?.email ?? ''}
                            placeholder="No email on file"
                            placeholderTextColor={colors.textTertiary}
                            editable={false}
                        />
                        <Text style={[styles.fieldCaption, { color: colors.textTertiary }]}>
                            To change your email, contact support.
                        </Text>
                    </View>

                    {formError && (
                        <Text style={[styles.formError, { color: colors.statusRed }]}>
                            {formError}
                        </Text>
                    )}
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
                            <>
                                <ActivityIndicator color={colors.white} size="small" />
                                <Text style={[styles.deleteButtonText, { color: colors.white }]}>
                                    Sending…
                                </Text>
                            </>
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
        width: 40,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: fontSize.lg,
        fontWeight: fontWeight.semibold,
    },
    saveButton: {
        minWidth: 64,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.md,
        paddingHorizontal: spacing.md,
    },
    saveButtonDisabled: {
        opacity: 0.45,
    },
    saveButtonText: {
        fontSize: fontSize.sm,
        fontWeight: fontWeight.semibold,
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
        letterSpacing: 0,
        marginBottom: spacing.md,
    },
    field: {
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
    },
    fieldLast: {
        paddingTop: spacing.md,
    },
    fieldLabel: {
        fontSize: fontSize.sm,
        marginBottom: 4,
    },
    fieldInput: {
        borderWidth: 1,
        borderRadius: borderRadius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        fontSize: fontSize.md,
        fontWeight: fontWeight.medium,
        minHeight: 44,
    },
    readOnlyInput: {
        opacity: 0.9,
    },
    fieldCaption: {
        fontSize: fontSize.xs,
        lineHeight: 16,
        marginTop: spacing.xs,
    },
    fieldError: {
        fontSize: fontSize.xs,
        lineHeight: 16,
        marginTop: spacing.xs,
    },
    formError: {
        fontSize: fontSize.sm,
        lineHeight: 18,
        marginTop: spacing.md,
    },
    emailLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: 4,
    },
    emailBadge: {
        borderRadius: borderRadius.full,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
    },
    emailBadgeText: {
        fontSize: fontSize.xs,
        fontWeight: fontWeight.medium,
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
