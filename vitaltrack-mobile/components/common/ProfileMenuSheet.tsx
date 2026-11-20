/**
 * Profile Menu Bottom Sheet
 * Displays user info, theme toggle, and menu options
 */

import { useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Modal, Pressable, PanResponder, Animated, Dimensions, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
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
    onEditProfile?: () => void;
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
    onAbout,
    onHelp,
    onLogout,
}: ProfileMenuSheetProps) {
    const { colors } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const appVersion = Constants.expoConfig?.version ?? '1.0.0';

    const translateY = useRef(new Animated.Value(0)).current;

    // The sheet has three dismissal paths: swipe gesture completion,
    // backdrop Pressable onPress, and Modal's onRequestClose (Android
    // back). They can race — swipe-end can fire onDismiss at the same
    // frame as a stray backdrop touch — which caused the "close, flash
    // back open, close" flicker in prior builds. Gate every dismiss
    // through a ref so the second call is a no-op.
    const isDismissingRef = useRef(false);
    const handleDismiss = useCallback(() => {
        if (isDismissingRef.current) return;
        isDismissingRef.current = true;
        onDismiss();
    }, [onDismiss]);

    // Reset the guard whenever the sheet is freshly opened, so the next
    // close path can proceed. Paired with the visible prop so we don't
    // leak state across mount cycles.
    useEffect(() => {
        if (visible) isDismissingRef.current = false;
    }, [visible]);

    const panResponder = useRef(
        PanResponder.create({
            // Restrict swiping to the handle and heading so list gestures can scroll freely.
            onStartShouldSetPanResponder: () => false,
            onStartShouldSetPanResponderCapture: () => false,
            onMoveShouldSetPanResponder: (_, gs) => gs.dy > 30 && gs.dy > Math.abs(gs.dx) * 1.5,
            onMoveShouldSetPanResponderCapture: () => false,
            onPanResponderTerminationRequest: () => true,
            onPanResponderTerminate: () => {
                Animated.spring(translateY, {
                    toValue: 0,
                    bounciness: 4,
                    useNativeDriver: true,
                }).start();
            },
            onPanResponderMove: (_, gs) => {
                if (gs.dy > 0) translateY.setValue(gs.dy);
            },
            onPanResponderRelease: (_, gs) => {
                // Dismiss on distance OR velocity — matches iOS/Material bottom-sheet
                // behavior where a short, fast flick also closes.
                const shouldDismiss = gs.dy > 100 || gs.vy > 0.5;
                if (shouldDismiss) {
                    Animated.timing(translateY, {
                        toValue: Dimensions.get('window').height,
                        duration: 200,
                        useNativeDriver: true,
                    }).start(() => {
                        // Dismiss first so the parent unmounts the Modal on
                        // the next render. Only reset the translate after a
                        // short delay — calling setValue(0) while the Modal
                        // is still visible snaps the sheet back to its
                        // resting position for one frame, which is the
                        // visible flash-back users reported.
                        handleDismiss();
                        setTimeout(() => translateY.setValue(0), 50);
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
            onRequestClose={handleDismiss}
        >
            <View style={[styles.overlay, { backgroundColor: colors.overlayDark, paddingTop: insets.top }]}>
                <Pressable accessibilityRole="button" accessibilityLabel="Dismiss account menu"
                    style={StyleSheet.absoluteFill} onPress={handleDismiss} />
                <Animated.View accessibilityViewIsModal style={[styles.sheetWrapper, {
                    backgroundColor: colors.bgCard, paddingBottom: insets.bottom, transform: [{ translateY }],
                }]}>
                    <View {...panResponder.panHandlers} style={styles.sheetHeader}>
                        <View style={[styles.dragHandle, { backgroundColor: colors.borderSecondary }]} />
                        <View style={styles.headingRow}>
                            <Text accessibilityRole="header" style={[styles.heading, { color: colors.textPrimary }]}>Account menu</Text>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close account menu"
                                onPress={handleDismiss} style={[styles.closeButton, { backgroundColor: colors.bgTertiary }]}>
                                <Ionicons name="close" size={21} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <ScrollView style={styles.scroll} contentContainerStyle={styles.sheet}>
                        <View style={[styles.profileHeader, { backgroundColor: colors.bgTertiary }]}>
                            <View style={[styles.largeAvatar, { backgroundColor: colors.accentBlueBg }]}>
                                <Text style={[styles.largeInitials, { color: colors.accentBlue }]}>{getInitials(userName)}</Text>
                            </View>
                            <View style={styles.menuTextContainer}>
                                <Text style={[styles.userName, { color: colors.textPrimary }]}>{userName}</Text>
                                <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>{userEmail}</Text>
                            </View>
                        </View>
                        <View style={styles.group}>
                            <MenuItem
                                icon="person-outline"
                                title="Edit profile"
                                onPress={() => {
                                    onEditProfile?.();
                                    onDismiss();
                                }}
                            />

                            <MenuItem
                                icon="mic-outline"
                                title="Voice setup"
                                subtitle="Microphone, language processing and playback"
                                onPress={() => { onDismiss(); router.navigate({ pathname: '/assistant', params: { mode: 'settings' } }); }}
                            />

                            <View style={styles.menuItem}>
                                <View style={[styles.menuIconContainer, { backgroundColor: colors.bgTertiary }]}>
                                    <Ionicons name="moon-outline" size={21} color={colors.textSecondary} />
                                </View>
                                <Text style={[styles.menuTitle, styles.menuTextContainer, { color: colors.textPrimary }]}>Dark mode</Text>
                                <Switch accessibilityLabel="Dark mode" value={isDarkTheme} onValueChange={onThemeToggle}
                                    trackColor={{ false: colors.borderSecondary, true: colors.accentBlue }}
                                />
                            </View>
                        </View>
                        <View style={[styles.group, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.borderPrimary }]}>
                            <MenuItem
                                icon="information-circle-outline"
                                title="About CareKosh"
                                subtitle={`Version ${appVersion}`}
                                onPress={() => {
                                    onAbout?.();
                                    onDismiss();
                                }}
                            />

                            <MenuItem
                                icon="help-circle-outline"
                                title="Help and support"
                                onPress={() => {
                                    onHelp?.();
                                    onDismiss();
                                }}
                            />
                        </View>
                        <TouchableOpacity accessibilityRole="button"
                            style={[styles.logoutButton, { backgroundColor: colors.statusRedBg }]}
                            onPress={() => {
                                onLogout?.();
                                onDismiss();
                            }}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="log-out-outline" size={20} color={colors.statusRed} />
                            <Text style={[styles.logoutText, { color: colors.statusRed }]}>Log out</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
}

interface MenuItemProps {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    onPress: () => void;
}

function MenuItem({ icon, title, subtitle, onPress }: MenuItemProps) {
    const { colors } = useTheme();

    return (
        <TouchableOpacity accessibilityRole="button" style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
            <View style={[styles.menuIconContainer, { backgroundColor: colors.bgTertiary }]}>
                <Ionicons name={icon} size={21} color={colors.textSecondary} />
            </View>
            <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>{title}</Text>
                {subtitle && <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
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
    sheetWrapper: { width: '100%', maxWidth: 560, maxHeight: '94%', alignSelf: 'center',
        borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
    sheetHeader: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
    dragHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
    headingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
    heading: { flex: 1, fontSize: fontSize.xxxl, fontWeight: fontWeight.semibold },
    closeButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    scroll: { flexShrink: 1 },
    sheet: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.sm },
    profileHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: 16, padding: spacing.lg },
    largeAvatar: { minWidth: 48, minHeight: 48, padding: 6, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    largeInitials: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
    userName: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
    group: { paddingVertical: spacing.xs },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm },
    menuIconContainer: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    menuTextContainer: { flex: 1, minWidth: 0 },
    menuTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.medium },
    menuSubtitle: { fontSize: 13, lineHeight: 19, marginTop: 2 },
    logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: spacing.md,
        minHeight: 48, borderRadius: borderRadius.lg, gap: spacing.sm },
    logoutText: { fontSize: fontSize.lg, fontWeight: fontWeight.medium },
});
