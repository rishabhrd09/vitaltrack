/**
 * VitalTrack Mobile - Login Screen
 * User authentication with email/username and password
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

// Use the same base URL the API client uses so /health hits the right server.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

const MAX_RETRY_ATTEMPTS = 12; // 12 attempts × 5s = 60s window, matches Render's cold-start worst case
const RETRY_INTERVAL_MS = 5000;
const HEALTH_CHECK_TIMEOUT_MS = 8000;

// Map backend error messages to user-friendly text
const getFriendlyError = (error: string): string => {
    const errorMap: Record<string, string> = {
        'Incorrect email/username or password': 'Incorrect password or account not found. Please check your credentials.',
        'Account is disabled': 'Your account has been disabled. Please contact support.',
        'An error occurred': 'Unable to connect to server. Please try again.',
        'Session expired. Please log in again.': 'Your session has expired. Please log in again.',
    };
    // Check for rate limit errors
    if (error.includes('Rate limit') || error.includes('rate limit')) {
        return 'Too many attempts. Please wait a moment and try again.';
    }
    return errorMap[error] || error;
};

export default function LoginScreen() {
    const theme = useTheme();
    const { login, isLoading, error, isColdStart, clearError, clearColdStart } = useAuthStore();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Auto-retry state — ReturnType<typeof setInterval>, not NodeJS.Timeout (doesn't exist in RN)
    const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [retryState, setRetryState] = useState<{
        isRetrying: boolean;
        attempt: number;
        message: string;
        exhausted: boolean;
    }>({ isRetrying: false, attempt: 0, message: '', exhausted: false });

    // Clear stale errors when screen gains focus
    useFocusEffect(
        useCallback(() => {
            clearError();
            clearColdStart();
        }, [clearError, clearColdStart])
    );

    const stopRetry = useCallback(() => {
        if (retryIntervalRef.current) {
            clearInterval(retryIntervalRef.current);
            retryIntervalRef.current = null;
        }
    }, []);

    const cancelRetry = useCallback(() => {
        stopRetry();
        setRetryState({ isRetrying: false, attempt: 0, message: '', exhausted: false });
        clearColdStart();
        clearError();
    }, [stopRetry, clearColdStart, clearError]);

    // Cleanup on unmount — prevents memory leak from orphaned interval
    useEffect(() => {
        return () => {
            stopRetry();
        };
    }, [stopRetry]);

    // When login succeeds and we were retrying, stop the retry loop
    useEffect(() => {
        if (!isColdStart && retryIntervalRef.current) {
            stopRetry();
            setRetryState({ isRetrying: false, attempt: 0, message: '', exhausted: false });
        }
    }, [isColdStart, stopRetry]);

    const startAutoRetry = useCallback((loginIdentifier: string, loginPassword: string) => {
        setRetryState({
            isRetrying: true,
            attempt: 1,
            message: 'CareKosh server is waking up...',
            exhausted: false,
        });

        const tick = async () => {
            // Health check with manual timeout (AbortSignal.timeout not reliable on Hermes)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

            try {
                const response = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    // Server is awake — stop retrying and attempt login once
                    stopRetry();
                    setRetryState({
                        isRetrying: false,
                        attempt: 0,
                        message: 'Server ready! Logging in...',
                        exhausted: false,
                    });

                    const success = await login(loginIdentifier, loginPassword);
                    if (success) {
                        router.replace('/(tabs)');
                    }
                    return;
                }
                // Non-ok response — count as a failed attempt
                throw new Error(`Health check returned ${response.status}`);
            } catch {
                clearTimeout(timeoutId);
                setRetryState(prev => {
                    const nextAttempt = prev.attempt + 1;
                    if (nextAttempt > MAX_RETRY_ATTEMPTS) {
                        stopRetry();
                        return {
                            isRetrying: false,
                            attempt: prev.attempt,
                            message: 'Unable to connect. Please check your internet and try again.',
                            exhausted: true,
                        };
                    }
                    return {
                        isRetrying: true,
                        attempt: nextAttempt,
                        message: nextAttempt >= 4
                            ? 'Still connecting... This can take up to 60 seconds after inactivity.'
                            : 'CareKosh server is waking up...',
                        exhausted: false,
                    };
                });
            }
        };

        retryIntervalRef.current = setInterval(tick, RETRY_INTERVAL_MS);
    }, [login, stopRetry]);

    // When login() flags a cold-start error, kick off the auto-retry
    useEffect(() => {
        if (isColdStart && !retryIntervalRef.current && !retryState.exhausted) {
            startAutoRetry(identifier.trim(), password);
        }
        // Intentionally only trigger on isColdStart transitions — credentials are
        // captured at the time of the failed login attempt, not on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isColdStart]);

    const handleLogin = async () => {
        if (!identifier.trim() || !password.trim()) {
            return;
        }

        clearError();
        clearColdStart();
        setRetryState({ isRetrying: false, attempt: 0, message: '', exhausted: false });

        try {
            const success = await login(identifier.trim(), password);

            if (success) {
                router.replace('/(tabs)');
            }
            // On failure, useAuthStore sets `error` and possibly `isColdStart`.
            // The isColdStart effect above handles retry dispatch.
        } catch (err) {
            // Handle email not verified error
            const error = err as Error;
            if (error.message === 'EMAIL_NOT_VERIFIED') {
                router.push({
                    pathname: '/(auth)/verify-email-pending' as const,
                    params: { email: identifier.trim() }
                } as never);
            }
            // Other errors are handled by useAuthStore and shown via error state
        }
    };

    const colors = theme.colors;

    const isRetrying = retryState.isRetrying;
    const retryExhausted = retryState.exhausted;
    const signInButtonDisabled = isLoading || isRetrying;

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Logo/Header */}
                <View style={styles.header}>
                    <Ionicons name="medical" size={60} color={colors.primary} />
                    <Text style={[styles.title, { color: colors.text }]}>CareKosh</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        Home ICU Inventory Management
                    </Text>
                </View>

                {/* Login Form */}
                <View style={styles.form}>
                    {/* Error Message — hide when we're in an active retry (retry box shows instead) */}
                    {error && !isRetrying && !retryExhausted && !isColdStart && (
                        <>
                            <View style={[styles.errorBox, { backgroundColor: colors.error + '20' }]}>
                                <Ionicons name="alert-circle" size={20} color={colors.error} />
                                <Text style={[styles.errorText, { color: colors.error }]}>{getFriendlyError(error)}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() =>
                                    Alert.alert(
                                        'Account deleted',
                                        'If you recently confirmed an account deletion email, your account has been removed. You can register a new account with the same email.',
                                        [{ text: 'OK' }]
                                    )
                                }
                                style={styles.deletedHelpLink}
                            >
                                <Text style={[styles.deletedHelpText, { color: colors.textSecondary }]}>
                                    Recently deleted your account?
                                </Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {/* Email/Username Input */}
                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>
                            Email or Username
                        </Text>
                        <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Enter your email or username"
                                placeholderTextColor={colors.textSecondary}
                                value={identifier}
                                onChangeText={setIdentifier}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="email-address"
                                editable={!isRetrying}
                            />
                        </View>
                    </View>

                    {/* Password Input */}
                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>
                            Password
                        </Text>
                        <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Enter your password"
                                placeholderTextColor={colors.textSecondary}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                editable={!isRetrying}
                            />
                            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} disabled={isRetrying}>
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color={colors.textSecondary}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Forgot Password Link */}
                    <Link href="/(auth)/forgot-password" asChild>
                        <TouchableOpacity style={styles.forgotPassword} disabled={isRetrying}>
                            <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>
                                Forgot Password?
                            </Text>
                        </TouchableOpacity>
                    </Link>

                    {/* Login Button */}
                    <TouchableOpacity
                        style={[
                            styles.button,
                            { backgroundColor: colors.primary },
                            signInButtonDisabled && styles.buttonDisabled,
                        ]}
                        onPress={handleLogin}
                        disabled={signInButtonDisabled}
                    >
                        {isLoading || isRetrying ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>{retryExhausted ? 'Try Again' : 'Sign In'}</Text>
                        )}
                    </TouchableOpacity>

                    {/* Retry in progress */}
                    {isRetrying && (
                        <View style={[styles.retryBox, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
                            <View style={styles.retryHeader}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                <Text style={[styles.retryTitle, { color: colors.text }]}>
                                    {retryState.message}
                                </Text>
                            </View>
                            <Text style={[styles.retrySubtext, { color: colors.textSecondary }]}>
                                Attempt {retryState.attempt} of {MAX_RETRY_ATTEMPTS}
                            </Text>
                            <TouchableOpacity onPress={cancelRetry} style={styles.cancelButton}>
                                <Text style={[styles.cancelButtonText, { color: colors.primary }]}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Retry exhausted */}
                    {retryExhausted && (
                        <Text style={[styles.coldStartHint, { color: colors.textSecondary }]}>
                            {retryState.message}
                        </Text>
                    )}

                    {/* Register Link */}
                    <View style={styles.registerContainer}>
                        <Text style={[styles.registerText, { color: colors.textSecondary }]}>
                            Don't have an account?{' '}
                        </Text>
                        <Link href="/(auth)/register" asChild>
                            <TouchableOpacity disabled={isRetrying}>
                                <Text style={[styles.registerLink, { color: colors.primary }]}>
                                    Sign Up
                                </Text>
                            </TouchableOpacity>
                        </Link>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        marginTop: 16,
    },
    subtitle: {
        fontSize: 16,
        marginTop: 8,
    },
    form: {
        width: '100%',
    },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        gap: 8,
    },
    errorText: {
        flex: 1,
        fontSize: 14,
    },
    deletedHelpLink: {
        alignSelf: 'flex-end',
        marginTop: -8,
        marginBottom: 16,
        paddingVertical: 4,
    },
    deletedHelpText: {
        fontSize: 13,
        textDecorationLine: 'underline',
    },
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 8,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 52,
        gap: 12,
    },
    input: {
        flex: 1,
        fontSize: 16,
        height: '100%',
    },
    forgotPassword: {
        alignSelf: 'flex-end',
        marginBottom: 24,
    },
    forgotPasswordText: {
        fontSize: 14,
        fontWeight: '500',
    },
    button: {
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    retryBox: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
        alignItems: 'center',
        gap: 8,
    },
    retryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    retryTitle: {
        fontSize: 15,
        fontWeight: '600',
        flexShrink: 1,
    },
    retrySubtext: {
        fontSize: 13,
    },
    cancelButton: {
        marginTop: 4,
        paddingVertical: 6,
        paddingHorizontal: 16,
    },
    cancelButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    coldStartHint: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: -8,
        marginBottom: 16,
        paddingHorizontal: 16,
        lineHeight: 18,
    },
    registerContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    registerText: {
        fontSize: 14,
    },
    registerLink: {
        fontSize: 14,
        fontWeight: '600',
    },
});
