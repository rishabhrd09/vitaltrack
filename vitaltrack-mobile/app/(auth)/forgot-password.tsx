/**
 * VitalTrack Mobile - Forgot Password Screen
 * Request password reset email
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

export default function ForgotPasswordScreen() {
    const theme = useTheme();
    const { forgotPassword, isLoading, error, clearError } = useAuthStore();

    const [email, setEmail] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async () => {
        if (!email.trim()) return;

        clearError();
        const result = await forgotPassword(email.trim());

        if (result) {
            setSuccess(true);
        }
    };

    const colors = theme.colors;

    if (success) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.successContent}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.success + '20' }]}>
                        <Ionicons name="mail" size={40} color={colors.success} />
                    </View>
                    <Text style={[styles.successTitle, { color: colors.text }]}>Check Your Email</Text>
                    <Text style={[styles.successText, { color: colors.textSecondary }]}>
                        We've sent a password reset link to{'\n'}
                        <Text style={{ fontWeight: '600' }}>{email}</Text>
                    </Text>
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.primary }]}
                        onPress={() => router.replace('/(auth)/login')}
                    >
                        <Text style={styles.buttonText}>Back to Login</Text>
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
                {/* Back Button */}
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>

                {/* Header */}
                <View style={styles.header}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
                        <Ionicons name="key" size={40} color={colors.primary} />
                    </View>
                    <Text style={[styles.title, { color: colors.text }]}>Forgot Password?</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        Enter your email address and we'll send you a link to reset your password.
                    </Text>
                </View>

                {/* Form */}
                <View style={styles.form}>
                    {/* Error Message */}
                    {error && (
                        <View style={[styles.errorBox, { backgroundColor: colors.error + '20' }]}>
                            <Ionicons name="alert-circle" size={20} color={colors.error} />
                            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                        </View>
                    )}

                    {/* Email Input */}
                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Email Address</Text>
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
                            <Text style={styles.buttonText}>Send Reset Link</Text>
                        )}
                    </TouchableOpacity>

                    {/* Back to Login */}
                    <Link href="/(auth)/login" asChild>
                        <TouchableOpacity style={styles.linkButton}>
                            <Ionicons name="arrow-back" size={16} color={colors.primary} />
                            <Text style={[styles.linkText, { color: colors.primary }]}>
                                Back to Login
                            </Text>
                        </TouchableOpacity>
                    </Link>
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
        padding: 24,
    },
    backButton: {
        marginBottom: 24,
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
        lineHeight: 20,
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
        marginBottom: 24,
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
    linkButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    linkText: {
        fontSize: 14,
        fontWeight: '500',
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
