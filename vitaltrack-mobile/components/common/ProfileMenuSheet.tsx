/**
 * Profile Menu Bottom Sheet
 * Displays user info, theme toggle, and menu options
 */

import { View, Text, TouchableOpacity, StyleSheet, Switch, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';

interface ProfileMenuSheetProps {
    visible: boolean;
    onDismiss: () => void;
    userName: string;
    userEmail: string;
    photoUrl?: string | null;
    isDarkTheme: boolean;
    onThemeToggle: () => void;
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
    onSettings,
    onAbout,
    onHelp,
    onLogout,
}: ProfileMenuSheetProps) {
    const { colors } = useTheme();

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
                <Pressable style={[styles.sheet, { backgroundColor: colors.bgCard }]} onPress={(e) => e.stopPropagation()}>
                    {/* Drag Handle */}
                    <View style={[styles.dragHandle, { backgroundColor: colors.borderSecondary }]} />

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
                        title="About VitalTrack"
                        subtitle="Version 2.0.0"
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

                    {/* Bottom Spacing */}
                    <View style={{ height: spacing.xl }} />
                </Pressable>
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
    sheet: {
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.md,
        maxHeight: '80%',
    },
    dragHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: spacing.lg,
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

