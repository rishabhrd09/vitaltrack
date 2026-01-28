/**
 * VitalTrack Mobile - Auth Stack Layout
 * Layout for authentication screens
 */

import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';

export default function AuthLayout() {
    const theme = useTheme();

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.background },
                animation: 'slide_from_right',
            }}
        >
            <Stack.Screen name="login" />
            <Stack.Screen name="register" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="reset-password" />
        </Stack>
    );
}
