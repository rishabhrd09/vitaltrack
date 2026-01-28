/**
 * VitalTrack Top Bar
 * Groww-inspired professional top bar with web feature parity
 * 
 * Layout: [Logo + App Name] [Search Icon] [Export] [Add] [Profile]
 */

import { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Animated,
    Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';

interface VitalTrackTopBarProps {
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
    onExportClick: () => void;
    onAddItemClick: () => void;
    onProfileClick: () => void;
    userName?: string;
    userPhotoUrl?: string | null;
}

export default function VitalTrackTopBar({
    searchQuery,
    onSearchQueryChange,
    onExportClick,
    onAddItemClick,
    onProfileClick,
    userName = 'User',
}: VitalTrackTopBarProps) {
    const { colors } = useTheme();
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const searchInputRef = useRef<TextInput>(null);
    const searchBarHeight = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(searchBarHeight, {
            toValue: isSearchExpanded ? 56 : 0,
            duration: 200,
            useNativeDriver: false,
        }).start();

        if (isSearchExpanded) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isSearchExpanded, searchBarHeight]);

    const toggleSearch = () => {
        if (isSearchExpanded) {
            onSearchQueryChange('');
            Keyboard.dismiss();
        }
        setIsSearchExpanded(!isSearchExpanded);
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((part) => part[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderPrimary }]}>
            {/* Main Top Bar Row */}
            <View style={styles.mainRow}>
                {/* Left Section: Logo + App Name */}
                <View style={styles.leftSection}>
                    {/* Logo */}
                    <View style={[styles.logo, { backgroundColor: colors.accentBlue }]}>
                        <Text style={[styles.logoText, { color: colors.white }]}>V</Text>
                    </View>

                    {/* App Name */}
                    <View style={styles.appNameContainer}>
                        <Text style={[styles.appName, { color: colors.textPrimary }]}>VitalTrack</Text>
                        <Text style={[styles.appSubtitle, { color: colors.textTertiary }]}>My Home ICU</Text>
                    </View>
                </View>

                {/* Right Section: Actions */}
                <View style={styles.rightSection}>
                    {/* Search Toggle */}
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={toggleSearch}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name={isSearchExpanded ? 'close' : 'search'}
                            size={24}
                            color={colors.textSecondary}
                        />
                    </TouchableOpacity>

                    {/* Export Button */}
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={onExportClick}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="download-outline" size={24} color={colors.textSecondary} />
                    </TouchableOpacity>

                    {/* Add Button */}
                    <TouchableOpacity
                        style={[styles.addButton, { backgroundColor: colors.accentBlue }]}
                        onPress={onAddItemClick}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="add" size={20} color={colors.white} />
                    </TouchableOpacity>

                    {/* Profile Avatar */}
                    <TouchableOpacity
                        style={styles.profileButton}
                        onPress={onProfileClick}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.profileAvatar, { backgroundColor: colors.accentBlueBg, borderColor: colors.accentBlueBorder }]}>
                            <Text style={[styles.profileInitials, { color: colors.accentBlue }]}>{getInitials(userName)}</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Expandable Search Bar */}
            <Animated.View style={[styles.searchBarContainer, { height: searchBarHeight }]}>
                <View style={[styles.searchBar, { backgroundColor: colors.bgTertiary }]}>
                    <Ionicons name="search" size={20} color={colors.textTertiary} />
                    <TextInput
                        ref={searchInputRef}
                        style={[styles.searchInput, { color: colors.textPrimary }]}
                        value={searchQuery}
                        onChangeText={onSearchQueryChange}
                        placeholder="Search items..."
                        placeholderTextColor={colors.textTertiary}
                        returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => onSearchQueryChange('')}>
                            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                        </TouchableOpacity>
                    )}
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderBottomWidth: 1,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    mainRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: 64,
        paddingHorizontal: spacing.md,
    },
    leftSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    logo: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoText: {
        fontSize: 22,
        fontWeight: fontWeight.bold,
    },
    appNameContainer: {
        flexDirection: 'column',
    },
    appName: {
        fontSize: fontSize.lg,
        fontWeight: fontWeight.semibold,
    },
    appSubtitle: {
        fontSize: fontSize.xs,
        marginTop: -2,
    },
    rightSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    iconButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 22,
    },
    addButton: {
        width: 36,
        height: 36,
        borderRadius: borderRadius.md,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: spacing.xs,
    },
    profileButton: {
        marginLeft: spacing.sm,
    },
    profileAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileInitials: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.bold,
    },
    searchBarContainer: {
        overflow: 'hidden',
        paddingHorizontal: spacing.md,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: borderRadius.md,
        paddingHorizontal: spacing.md,
        height: 44,
        marginBottom: spacing.sm,
        gap: spacing.sm,
    },
    searchInput: {
        flex: 1,
        fontSize: fontSize.md,
        padding: 0,
    },
});

