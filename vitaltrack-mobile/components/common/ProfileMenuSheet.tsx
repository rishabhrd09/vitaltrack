/**
 * Profile Menu Bottom Sheet
 * Displays user info, theme toggle, and menu options
 */

import { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Modal, Pressable, PanResponder, Animated, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface ProfileMenuSheetProps {
    visible: boolean;
    onDismiss: () => void;
    userName: string;
    userEmail: string;
    photoUrl?: string | null;
    isDarkTheme: boolean;
    onThemeToggle: () => void;
    onEditProfile?: () => void;
    onSettings?: () => void;
    onAbout?: () => void;
    onHelp?: () => void;
    onLogout?: () => void;
}

export default function ProfileMenuSheet({
    visible,
    onDismiss,
    userName,
    userEmail,
    isDarkTheme,
    onThemeToggle,
    onEditProfile,
    onSettings,
    onAbout,
    onHelp,
    onLogout,
}: ProfileMenuSheetProps) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();

    const translateY = useRef(new Animated.Value(0)).current;

    const panResponder = useRef(
        PanResponder.create({
            // Only claim the gesture when there's a clear downward movement,
            // so taps on menu items are never intercepted.
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
            onPanResponderMove: (_, gs) => {
                if (gs.dy > 0) translateY.setValue(gs.dy);
            },
            onPanResponderRelease: (_, gs) => {
                // Dismiss on distance OR velocity — matches iOS/Material bottom-sheet
                // behavior where a short, fast flick also closes.
                const shouldDismiss = gs.dy > 100 || gs.vy > 0.5;
                if (shouldDismiss) {
                    Animated.timing(translateY, {
                        toValue: SCREEN_HEIGHT,
                        duration: 200,
                        useNativeDriver: true,
                    }).start(() => {
                        translateY.setValue(0);
                        onDismiss();
                    });
                } else {
                    Animated.spring(translateY, {
                        toValue: 0,
                        bounciness: 4,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((part) => part[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onDismiss}
        >
            <Pressable style={[styles.overlay, { backgroundColor: colors.overlayDark }]} onPress={onDismiss}>
                <Animated.View
                    {...panResponder.panHandlers}
                    style={[
                        styles.sheetWrapper,
                        {
                            backgroundColor: colors.bgCard,
                            paddingBottom: insets.bottom + spacing.md,
                            transform: [{ translateY }],
                        },
                    ]}
                >
                {/*
                  PanResponder is attached to the ancestor Animated.View (not the
                  drag-handle View below) so RN's move-phase responder bubbling
                  can actually reach it. When the inner Pressable holds the
                  responder after touch-start, onMoveShouldSetPanResponder is
                  called on the CURRENT responder and its ancestors — not on
                  descendants. Attaching panHandlers to a descendant View means
                  the move handler never runs, which is what made swipe-down
                  silently fail in the previous implementation.
                */}
                <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                    {/* Drag handle — purely visual now. Users can swipe down from anywhere on the sheet. */}
                    <View style={styles.dragHandleContainer}>
                        <View style={[styles.dragHandle, { backgroundColor: colors.borderSecondary }]} />
                    </View>

                    {/* Profile Header */}
                    <View style={styles.profileHeader}>
                        <View style={[styles.largeAvatar, { backgroundColor: colors.accentBlue }]}>
                            <Text style={[styles.largeInitials, { color: colors.white }]}>{getInitials(userName)}</Text>
                        </View>
                        <View style={styles.profileInfo}>
                            <Text style={[styles.userName, { color: colors.textPrimary }]}>{userName}</Text>
                            <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{userEmail}</Text>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.borderPrimary }]} />

                    {/* Appearance Toggle */}
                    <TouchableOpacity
                        style={[styles.appearanceRow, { backgroundColor: colors.bgTertiary }]}
                        onPress={onThemeToggle}
                        activeOpacity={0.7}
                    >
                        <View style={styles.menuIconContainer}>
                            <Ionicons
                                name={isDarkTheme ? 'moon' : 'sunny'}
                                size={24}
                                color={colors.accentBlue}
                            />
                        </View>
                        <View style={styles.menuTextContainer}>
                            <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>Appearance</Text>
                            <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>
                                {isDarkTheme ? 'Dark Mode' : 'Light Mode'}
                            </Text>
                        </View>
                        <Switch
                            value={isDarkTheme}
                            onValueChange={onThemeToggle}
                            trackColor={{ false: colors.borderSecondary, true: colors.accentBlueBg }}
                            thumbColor={isDarkTheme ? colors.accentBlue : colors.textTertiary}
                        />
                    </TouchableOpacity>

                    {/* Menu Items */}
                    <MenuItem
                        icon="person-outline"
                        title="Edit Profile"
                        subtitle="View and manage your account"
                        onPress={() => {
                            onEditProfile?.();
                            onDismiss();
                        }}
                    />

                    <MenuItem
                        icon="settings-outline"
                        title="Settings"
                        subtitle="App preferences and configuration"
                        onPress={() => {
                            onSettings?.();
                            onDismiss();
                        }}
                    />

                    <MenuItem
                        icon="information-circle-outline"
                        title="About CareKosh"
                        subtitle="Home ICU Inventory Management · v2.0.0"
                        onPress={() => {
                            onAbout?.();
                            onDismiss();
                        }}
                    />

                    <MenuItem
                        icon="help-circle-outline"
                        title="Help & Support"
                        subtitle="Get help and contact support"
                        onPress={() => {
                            onHelp?.();
                            onDismiss();
                        }}
                    />

                    <View style={[styles.divider, { backgroundColor: colors.borderPrimary }]} />

                    {/* Logout Button */}
                    <TouchableOpacity
                        style={[styles.logoutButton, { borderColor: colors.statusRed }]}
                        onPress={() => {
                            onLogout?.();
                            onDismiss();
                        }}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="log-out-outline" size={20} color={colors.statusRed} />
                        <Text style={[styles.logoutText, { color: colors.statusRed }]}>Logout</Text>
                    </TouchableOpacity>
                </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

interface MenuItemProps {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle: string;
    onPress: () => void;
}

function MenuItem({ icon, title, subtitle, onPress }: MenuItemProps) {
    const { colors } = useTheme();

    return (
        <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
            <View style={styles.menuIconContainer}>
                <Ionicons name={icon} size={24} color={colors.textSecondary} />
            </View>
            <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>{title}</Text>
                <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheetWrapper: {
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        maxHeight: '80%',
    },
    sheet: {
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.md,
    },
    dragHandleContainer: {
        alignItems: 'center',
        paddingVertical: spacing.md,
    },
    dragHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
    },
    profileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.xl,
    },
    largeAvatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    largeInitials: {
        fontSize: 28,
        fontWeight: fontWeight.bold,
    },
    profileInfo: {
        marginLeft: spacing.lg,
        flex: 1,
    },
    userName: {
        fontSize: fontSize.xl,
        fontWeight: fontWeight.semibold,
    },
    userEmail: {
        fontSize: fontSize.md,
        marginTop: 2,
    },
    divider: {
        height: 1,
        marginVertical: spacing.lg,
    },
    appearanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        borderRadius: borderRadius.lg,
        marginBottom: spacing.lg,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.md,
    },
    menuIconContainer: {
        width: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuTextContainer: {
        flex: 1,
        marginLeft: spacing.md,
    },
    menuTitle: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.medium,
    },
    menuSubtitle: {
        fontSize: fontSize.sm,
        marginTop: 2,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.md,
        borderWidth: 1,
        borderRadius: borderRadius.md,
        gap: spacing.sm,
    },
    logoutText: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.medium,
    },
});

