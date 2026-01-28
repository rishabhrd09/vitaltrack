/**
 * VitalTrack Mobile - Reset Password Screen
 * Enter new password with reset token
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
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

export default function ResetPasswordScreen() {
    const theme = useTheme();
    const { token } = useLocalSearchParams<{ token: string }>();
    const { resetPassword, isLoading, error, clearError } = useAuthStore();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async () => {
        setLocalError(null);
        clearError();

        if (!password.trim()) {
            setLocalError('Please enter a new password');
            return;
        }

        if (password !== confirmPassword) {
            setLocalError('Passwords do not match');
            return;
        }

        if (password.length < 8) {
            setLocalError('Password must be at least 8 characters');
            return;
        }

        if (!token) {
            setLocalError('Invalid reset link. Please request a new one.');
            return;
        }

        const result = await resetPassword(token, password);

        if (result) {
            setSuccess(true);
        }
    };

    const colors = theme.colors;
    const displayError = localError || error;

    if (success) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.successContent}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.success + '20' }]}>
                        <Ionicons name="checkmark-circle" size={50} color={colors.success} />
                    </View>
                    <Text style={[styles.successTitle, { color: colors.text }]}>Password Reset!</Text>
                    <Text style={[styles.successText, { color: colors.textSecondary }]}>
                        Your password has been successfully reset. You can now log in with your new password.
                    </Text>
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.primary }]}
                        onPress={() => router.replace('/(auth)/login')}
                    >
                        <Text style={styles.buttonText}>Go to Login</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

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
                    <View style={[styles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
                        <Ionicons name="lock-open" size={40} color={colors.primary} />
                    </View>
                    <Text style={[styles.title, { color: colors.text }]}>Reset Password</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        Enter your new password below.
                    </Text>
                </View>

                {/* Form */}
                <View style={styles.form}>
                    {/* Error Message */}
                    {displayError && (
                        <View style={[styles.errorBox, { backgroundColor: colors.error + '20' }]}>
                            <Ionicons name="alert-circle" size={20} color={colors.error} />
                            <Text style={[styles.errorText, { color: colors.error }]}>{displayError}</Text>
                        </View>
                    )}

                    {/* New Password Input */}
                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>New Password</Text>
                        <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Enter new password"
                                placeholderTextColor={colors.textSecondary}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                            />
                            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
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
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm Password</Text>
                        <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Confirm new password"
                                placeholderTextColor={colors.textSecondary}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    {/* Submit Button */}
                    <TouchableOpacity
                        style={[
                            styles.button,
                            { backgroundColor: colors.primary },
                            isLoading && styles.buttonDisabled,
                        ]}
                        onPress={handleSubmit}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>Reset Password</Text>
                        )}
                    </TouchableOpacity>
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
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 14,
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
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    successContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    successTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    successText: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
});
