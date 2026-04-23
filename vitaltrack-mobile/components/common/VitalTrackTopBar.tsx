/**
 * VitalTrack Top Bar
 * Groww-inspired professional top bar with web feature parity
 *
 * Layout: [Logo + App Name] [Search Icon] [Export] [Add] [Profile]
 *
 * The search icon routes to the full-screen /search experience. The old
 * inline expand-to-search affordance was removed because no consuming
 * screen filtered on that query — it was purely cosmetic. /search is a
 * real in-memory search over items and categories.
 */

import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import SavingStatusPill from './SavingStatusPill';

interface VitalTrackTopBarProps {
    onExportClick: () => void;
    onAddItemClick: () => void;
    onProfileClick: () => void;
    userName?: string;
    userPhotoUrl?: string | null;
}

export default function VitalTrackTopBar({
    onExportClick,
    onAddItemClick,
    onProfileClick,
    userName = 'User',
}: VitalTrackTopBarProps) {
    const { colors, isDarkMode } = useTheme();
    const router = useRouter();

    const openSearch = () => {
        router.push('/search');
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
                    {/* Brand mark — simplified clipboard+cross glyph optimised for
                        small rendering. Theme-aware: dark amber on light, warm gold
                        on dark so the glyph has enough contrast in both modes. 44×44
                        matches min touch-target + balances the profile avatar. */}
                    <Image
                        source={
                            isDarkMode
                                ? require('../../assets/carekosh-mark-dark.png')
                                : require('../../assets/carekosh-mark.png')
                        }
                        style={styles.logo}
                        resizeMode="contain"
                    />


                    {/* App Name */}
                    <View style={styles.appNameContainer}>
                        <Text style={[styles.appName, { color: colors.textPrimary }]}>CareKosh</Text>
                        <Text style={[styles.appSubtitle, { color: colors.textTertiary }]}>My Home ICU</Text>
                    </View>
                </View>

                {/* Right Section: Actions */}
                <View style={styles.rightSection}>
                    {/* Search — opens full-screen search */}
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={openSearch}
                        activeOpacity={0.7}
                        accessibilityLabel="Search inventory"
                    >
                        <Ionicons name="search" size={24} color={colors.textSecondary} />
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

            {/* Ambient saving indicator — renders nothing on fast writes, shows
                "Saving…" after 3s, upgrades to "server warming up" after 8s.
                Sits inside the top-bar container so it rides along on every
                screen that uses VitalTrackTopBar. Returns null when idle, so
                zero layout impact. */}
            <SavingStatusPill />
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
        width: 44,
        height: 44,
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
});
