/**
 * VitalTrack Mobile - Email Verification Pending Screen
 * Shown when user tries to login without verifying email
 */

import { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '@/services';

export default function VerifyEmailPendingScreen() {
    const theme = useTheme();
    const colors = theme.colors;
    const { email } = useLocalSearchParams<{ email?: string }>();

    const [isResending, setIsResending] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleResendVerification = async () => {
        if (!email) return;

        setIsResending(true);
        setError(null);
        setResendSuccess(false);

        try {
            await authService.resendVerification(email);
            setResendSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to resend verification email');
        } finally {
            setIsResending(false);
        }
    };

    const handleBackToLogin = () => {
        router.replace('/(auth)/login');
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.content}>
                {/* Icon */}
                <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
                    <Ionicons name="mail-unread" size={64} color={colors.primary} />
                </View>

                {/* Title */}
                <Text style={[styles.title, { color: colors.text }]}>
                    Verify Your Email
                </Text>

                {/* Description */}
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                    We've sent a verification link to:
                </Text>
                <Text style={[styles.email, { color: colors.primary }]}>
                    {email || 'your email address'}
                </Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                    Please check your inbox and click the link to verify your account.
                </Text>

                {/* Success Message */}
                {resendSuccess && (
                    <View style={[styles.successBox, { backgroundColor: colors.success + '20' }]}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                        <Text style={[styles.successText, { color: colors.success }]}>
                            Verification email sent successfully!
                        </Text>
                    </View>
                )}

                {/* Error Message */}
                {error && (
                    <View style={[styles.errorBox, { backgroundColor: colors.error + '20' }]}>
                        <Ionicons name="alert-circle" size={20} color={colors.error} />
                        <Text style={[styles.errorText, { color: colors.error }]}>
                            {error}
                        </Text>
                    </View>
                )}

                {/* Resend Button */}
                <TouchableOpacity
                    style={[
                        styles.resendButton,
                        { borderColor: colors.primary },
                        isResending && styles.buttonDisabled,
                    ]}
                    onPress={handleResendVerification}
                    disabled={isResending || !email}
                >
                    {isResending ? (
                        <ActivityIndicator color={colors.primary} />
                    ) : (
                        <>
                            <Ionicons name="refresh" size={20} color={colors.primary} />
                            <Text style={[styles.resendButtonText, { color: colors.primary }]}>
                                Resend Verification Email
                            </Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Back to Login */}
                <TouchableOpacity
                    style={[styles.loginButton, { backgroundColor: colors.primary }]}
                    onPress={handleBackToLogin}
                >
                    <Text style={styles.loginButtonText}>Back to Login</Text>
                </TouchableOpacity>

                {/* Help Text */}
                <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                    Didn't receive the email? Check your spam folder or try resending.
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    content: {
        alignItems: 'center',
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 16,
        textAlign: 'center',
    },
    description: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 8,
        paddingHorizontal: 16,
    },
    email: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 16,
    },
    successBox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        marginTop: 16,
        gap: 8,
    },
    successText: {
        fontSize: 14,
        fontWeight: '500',
    },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        marginTop: 16,
        gap: 8,
    },
    errorText: {
        fontSize: 14,
        flex: 1,
    },
    resendButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 24,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        borderWidth: 2,
        width: '100%',
    },
    resendButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    loginButton: {
        marginTop: 16,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        width: '100%',
        alignItems: 'center',
    },
    loginButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    helpText: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 24,
        paddingHorizontal: 16,
    },
});
