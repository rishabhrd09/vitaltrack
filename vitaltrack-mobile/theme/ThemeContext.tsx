/**
 * VitalTrack Theme Context
 * Provides dark/light mode switching with persistence
 * DEFAULT: Dark Mode (as per user requirement)
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors as darkColors } from './colors';

/**
 * Light theme colors - Industry-standard warm colors
 * Following Claude Android app aesthetic with cream/white combinations
 */
export const lightColors = {
    // Background System - Warm whites and cream
    bgPrimary: '#FAF9F7',      // Warm off-white (like Claude)
    bgSecondary: '#FFFFFF',    // Pure white for cards
    bgCard: '#FFFFFF',         // White cards
    bgTertiary: '#F5F3F0',     // Warm cream/beige tint
    bgHover: '#F0EEE9',
    bgPressed: '#EBE8E3',
    bgGlass: 'rgba(255, 255, 255, 0.95)',

    // Border System - Soft warm grays
    borderPrimary: '#E8E5E0',   // Warmer gray border
    borderSecondary: '#DDD9D2',
    borderFocus: '#5B9CF6',
    borderError: '#A65D5D',

    // Text System - Warm dark tones
    textPrimary: '#1C1917',     // Warm black (slightly brown tint)
    textSecondary: '#57534E',   // Warm gray
    textTertiary: '#78716C',    // Medium warm gray
    textMuted: '#A8A29E',       // Light warm gray
    textInverse: '#FAFAF9',

    // Accent System - Slightly muted blue
    accentBlue: '#4F8EE6',
    accentBlueHover: '#3F7ED6',
    accentBluePressed: '#2F6EC6',
    accentBlueBg: 'rgba(79, 142, 230, 0.08)',
    accentBlueBorder: 'rgba(79, 142, 230, 0.15)',

    // Status System - Muted, aesthetic colors
    statusGreen: '#4A9668',
    statusGreenHover: '#3A8658',
    statusGreenBg: 'rgba(74, 150, 104, 0.08)',
    statusGreenBorder: 'rgba(74, 150, 104, 0.12)',

    statusOrange: '#B8860B',    // Goldenrod/amber (warm warning)
    statusOrangeHover: '#C8960B',
    statusOrangeBg: 'rgba(184, 134, 11, 0.08)',
    statusOrangeBorder: 'rgba(184, 134, 11, 0.12)',

    statusRed: '#B85450',       // Dusty rose red (soft, not cringy)
    statusRedHover: '#C86460',
    statusRedBg: 'rgba(184, 84, 80, 0.06)',
    statusRedBorder: 'rgba(184, 84, 80, 0.10)',

    statusGray: '#78716C',
    statusGrayBg: 'rgba(120, 113, 108, 0.08)',

    statusYellow: '#B8860B',
    statusYellowBg: 'rgba(184, 134, 11, 0.08)',

    // Overlays
    overlayDark: 'rgba(28, 25, 23, 0.5)',
    overlayLight: 'rgba(28, 25, 23, 0.2)',

    white: '#FFFFFF',
    transparent: 'transparent',

    // ============================================================================
    // ALIAS PROPERTIES (Required by auth screens & ThemeContext)
    // These map old property names to new ones for backward compatibility
    // ============================================================================
    background: '#FAF9F7',     // Alias for bgPrimary
    text: '#1C1917',           // Alias for textPrimary
    primary: '#4F8EE6',        // Alias for accentBlue
    success: '#4A9668',        // Alias for statusGreen
    error: '#B85450',          // Alias for statusRed
    warning: '#B8860B',        // Alias for statusOrange
    info: '#4F8EE6',           // Alias for accentBlue
    border: '#E8E5E0',         // Alias for borderPrimary
    surface: '#FFFFFF',        // Alias for bgCard
    card: '#FFFFFF',           // Alias for bgCard
    muted: '#57534E',          // Alias for textSecondary
    accent: '#4F8EE6',         // Alias for accentBlue
};

type ThemeColors = typeof darkColors;

interface ThemeContextType {
    isDarkMode: boolean;
    toggleTheme: () => void;
    colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType>({
    isDarkMode: true,
    toggleTheme: () => { },
    colors: darkColors,
});

const THEME_STORAGE_KEY = '@vitaltrack_theme';

interface ThemeProviderProps {
    children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
    // DEFAULT: Dark mode (as per user requirement)
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load saved theme preference, default to DARK
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
                if (savedTheme !== null) {
                    setIsDarkMode(savedTheme === 'dark');
                } else {
                    // Default to dark mode if no preference saved
                    setIsDarkMode(true);
                }
            } catch (error) {
                console.warn('Failed to load theme preference:', error);
                setIsDarkMode(true); // Fallback to dark
            } finally {
                setIsLoaded(true);
            }
        };
        loadTheme();
    }, []);

    const toggleTheme = async () => {
        const newTheme = !isDarkMode;
        setIsDarkMode(newTheme);
        try {
            await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme ? 'dark' : 'light');
        } catch (error) {
            console.warn('Failed to save theme preference:', error);
        }
    };

    const colors = isDarkMode ? darkColors : lightColors;

    if (!isLoaded) {
        return null;
    }

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme, colors }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

export { darkColors };
