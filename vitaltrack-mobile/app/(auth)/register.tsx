/**
 * VitalTrack Mobile - Register Screen
 * FIXED VERSION 3.0 - Proper navigation timing
 * 
 * CRITICAL FIXES:
 * 1. Navigation uses setTimeout to ensure root layout is mounted
 * 2. Loading state properly prevents double-submit
 * 3. Better error display from API
 */

import { useState } from 'react';
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
} from 'react-native';
import { Link, router } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

export default function RegisterScreen() {
    const theme = useTheme();
    const { register, isLoading, error, clearError } = useAuthStore();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleRegister = async () => {
        // Prevent double-submit
        if (isSubmitting || isLoading) {
            console.log('[Register] Already submitting, ignoring');
            return;
        }

        setLocalError(null);
        clearError();

        // Basic Required Fields Check
        if (!name.trim() || !password.trim()) {
            setLocalError('Name and Password are required');
            return;
        }

        // Identifier Check (Must have at least one)
        if (!email.trim() && !username.trim()) {
            setLocalError('Please provide either an Email or a Username');
            return;
        }

        // Username Validation (Optional but strict if provided)
        if (username.trim()) {
            const usernameRegex = /^[a-z0-9_]{3,50}$/;
            if (!usernameRegex.test(username.trim())) {
                setLocalError('Username must be 3-50 chars, lowercase letters, numbers, or _');
                return;
            }
        }

        // Email Validation (Only if provided)
        if (email.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                setLocalError('Please enter a valid email address');
                return;
            }
        }

        // Password Match Check
        if (password !== confirmPassword) {
            setLocalError('Passwords do not match');
            return;
        }

        // Strict Password Complexity Check
        // Backend requires: Min 8 chars, 1 Uppercase, 1 Lowercase, 1 Digit
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {
            setLocalError(
                'Password must be 8+ chars, with at least 1 Uppercase, 1 Lowercase, and 1 Number'
            );
            return;
        }

        console.log('[Register] Starting registration');
        setIsSubmitting(true);

        try {
            const success = await register({
                email: email.trim() || undefined,
                password,
                name: name.trim(),
                username: username.trim() || undefined,
            });

            if (success) {
                // If email was provided, redirect to verification screen
                // If only username (no email), go directly to app
                if (email.trim()) {
                    console.log('[Register] Registration successful, redirecting to email verification');
                    setTimeout(() => {
                        router.replace({
                            pathname: '/(auth)/verify-email-pending' as const,
                            params: { email: email.trim() }
                        } as never);
                    }, 100);
                } else {
                    console.log('[Register] Username-only registration, navigating to tabs');
                    setTimeout(() => {
                        try {
                            router.replace('/(tabs)');
                        } catch (navError) {
                            console.warn('[Register] Navigation failed, retrying:', navError);
                            setTimeout(() => {
                                router.replace('/(tabs)');
                            }, 500);
                        }
                    }, 100);
                }
            } else {
                console.log('[Register] Registration returned false');
            }
        } catch (err) {
            console.error('[Register] Registration error:', err);
            setLocalError('An unexpected error occurred. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const colors = theme.colors;
    const displayError = localError || error;

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header */}
                <View style={styles.header}>
                    <Ionicons name="medical" size={50} color={colors.primary} />
                    <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        Join VitalTrack to manage your inventory
                    </Text>
                </View>

                {/* Register Form */}
                <View style={styles.form}>
                    {/* Error Message */}
                    {displayError && (
                        <View style={[styles.errorBox, { backgroundColor: colors.error + '20' }]}>
                            <Ionicons name="alert-circle" size={20} color={colors.error} />
                            <Text style={[styles.errorText, { color: colors.error }]}>{displayError}</Text>
                        </View>
                    )}

                    {/* Name Input */}
                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Full Name *</Text>
                        <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Enter your full name"
                                placeholderTextColor={colors.textSecondary}
                                value={name}
                                onChangeText={setName}
                                autoCorrect={false}
                                editable={!isLoading && !isSubmitting}
                            />
                        </View>
                    </View>

                    {/* Username Input */}
                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Username (Optional)</Text>
                        <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Ionicons name="at-outline" size={20} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="unique_username"
                                placeholderTextColor={colors.textSecondary}
                                value={username}
                                onChangeText={(text) => setUsername(text.toLowerCase())}
                                autoCapitalize="none"
                                autoCorrect={false}
                                editable={!isLoading && !isSubmitting}
                            />
                        </View>
                    </View>

                    {/* Email Input */}
                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Email (Optional)</Text>
                        <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Enter your email"
                                placeholderTextColor={colors.textSecondary}
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="email-address"
                                editable={!isLoading && !isSubmitting}
                            />
                        </View>
                    </View>

                    {/* Password Input */}
                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Password *</Text>
                        <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Create a password"
                                placeholderTextColor={colors.textSecondary}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                editable={!isLoading && !isSubmitting}
                            />
                            <TouchableOpacity
                                onPress={() => setShowPassword(!showPassword)}
                                disabled={isLoading || isSubmitting}
                            >
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color={colors.textSecondary}
                                />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.hint, { color: colors.textSecondary }]}>
                            Min 8 characters, 1 uppercase, 1 number
                        </Text>
                    </View>

                    {/* Confirm Password Input */}
                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm Password *</Text>
                        <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Confirm your password"
                                placeholderTextColor={colors.textSecondary}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                editable={!isLoading && !isSubmitting}
                            />
                        </View>
                    </View>

                    {/* Register Button */}
                    <TouchableOpacity
                        style={[
                            styles.button,
                            { backgroundColor: colors.primary },
                            (isLoading || isSubmitting) && styles.buttonDisabled,
                        ]}
                        onPress={handleRegister}
                        disabled={isLoading || isSubmitting}
                    >
                        {(isLoading || isSubmitting) ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>Create Account</Text>
                        )}
                    </TouchableOpacity>

                    {/* Login Link */}
                    <View style={styles.loginContainer}>
                        <Text style={[styles.loginText, { color: colors.textSecondary }]}>
                            Already have an account?{' '}
                        </Text>
                        <Link href="/(auth)/login" asChild>
                            <TouchableOpacity disabled={isLoading || isSubmitting}>
                                <Text style={[styles.loginLink, { color: colors.primary }]}>
                                    Sign In
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
        marginBottom: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginTop: 12,
    },
    subtitle: {
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
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
    hint: {
        fontSize: 12,
        marginTop: 6,
    },
    button: {
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
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
    loginContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loginText: {
        fontSize: 14,
    },
    loginLink: {
        fontSize: 14,
        fontWeight: '600',
    },
});
