/**
 * Full-screen search — items and categories.
 *
 * Opens from the top-bar magnifying glass, autofocuses the input, and
 * filters the cached inventory in memory as the user types. Tapping a
 * result navigates to the item detail or the category in the builder
 * and dismisses the search screen. Purely client-side — inventories top
 * out around ~100 items per user so a substring filter is instant and
 * avoids round-tripping the server for every keystroke.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import { useItems, useCategories } from '@/hooks/useServerData';
import { isOutOfStock, isLowStock, type Item, type Category } from '@/types';

type ResultEntry =
    | { type: 'section-header'; key: string; label: string }
    | { type: 'category'; key: string; data: Category; itemCount: number }
    | { type: 'item'; key: string; data: Item; categoryName?: string };

export default function SearchScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [query, setQuery] = useState('');
    const inputRef = useRef<TextInput>(null);

    const { data: items = [] } = useItems();
    const { data: categories = [] } = useCategories();

    useEffect(() => {
        // The user tapped the search icon because they want to type.
        // Autofocus avoids an extra tap.
        const t = setTimeout(() => inputRef.current?.focus(), 80);
        return () => clearTimeout(t);
    }, []);

    const activeItems = useMemo(() => items.filter((i) => i.isActive), [items]);
    const categoriesById = useMemo(() => {
        const map = new Map<string, Category>();
        for (const c of categories) map.set(c.id, c);
        return map;
    }, [categories]);

    const { entries, totalResults } = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length === 0) return { entries: [] as ResultEntry[], totalResults: 0 };

        const catMatches = categories.filter((c) => c.name.toLowerCase().includes(q));
        const itemMatches = activeItems.filter((item) => {
            const name = item.name.toLowerCase();
            const brand = (item.brand || '').toLowerCase();
            return name.includes(q) || brand.includes(q);
        });

        const list: ResultEntry[] = [];
        if (catMatches.length > 0) {
            list.push({
                type: 'section-header',
                key: 'h-cat',
                label: `Categories (${catMatches.length})`,
            });
            for (const c of catMatches) {
                const count = activeItems.filter((i) => i.categoryId === c.id).length;
                list.push({ type: 'category', key: `c-${c.id}`, data: c, itemCount: count });
            }
        }
        if (itemMatches.length > 0) {
            list.push({
                type: 'section-header',
                key: 'h-item',
                label: `Items (${itemMatches.length})`,
            });
            for (const item of itemMatches) {
                list.push({
                    type: 'item',
                    key: `i-${item.id}`,
                    data: item,
                    categoryName: categoriesById.get(item.categoryId)?.name,
                });
            }
        }
        return { entries: list, totalResults: catMatches.length + itemMatches.length };
    }, [query, categories, activeItems, categoriesById]);

    const handleCategoryPress = (category: Category) => {
        // Dismiss search, then navigate. The builder screen doesn't currently
        // accept a category query param — we drop to the builder and rely on
        // its default selection. Future enhancement: deep-link param.
        Keyboard.dismiss();
        router.back();
        router.push('/builder');
    };

    const handleItemPress = (item: Item) => {
        Keyboard.dismiss();
        router.back();
        router.push(`/item/${item.id}`);
    };

    const renderEntry = ({ item: entry }: { item: ResultEntry }) => {
        if (entry.type === 'section-header') {
            return (
                <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>
                    {entry.label}
                </Text>
            );
        }
        if (entry.type === 'category') {
            return (
                <TouchableOpacity
                    style={[styles.resultRow, { borderBottomColor: colors.borderPrimary }]}
                    activeOpacity={0.7}
                    onPress={() => handleCategoryPress(entry.data)}
                >
                    <View style={[styles.iconBubble, { backgroundColor: colors.accentBlueBg }]}>
                        <Ionicons name="folder-outline" size={20} color={colors.accentBlue} />
                    </View>
                    <View style={styles.resultTextWrap}>
                        <Text style={[styles.resultName, { color: colors.textPrimary }]} numberOfLines={1}>
                            {entry.data.name}
                        </Text>
                        <Text style={[styles.resultMeta, { color: colors.textTertiary }]}>
                            {entry.itemCount} {entry.itemCount === 1 ? 'item' : 'items'}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
            );
        }
        const item = entry.data;
        const stockStatus = isOutOfStock(item)
            ? { label: 'Out of stock', color: colors.statusRed }
            : isLowStock(item)
                ? { label: 'Low stock', color: colors.statusOrange }
                : null;
        return (
            <TouchableOpacity
                style={[styles.resultRow, { borderBottomColor: colors.borderPrimary }]}
                activeOpacity={0.7}
                onPress={() => handleItemPress(item)}
            >
                <View style={[styles.iconBubble, { backgroundColor: colors.accentBlueBg }]}>
                    <Ionicons name="cube-outline" size={20} color={colors.accentBlue} />
                </View>
                <View style={styles.resultTextWrap}>
                    <Text style={[styles.resultName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <View style={styles.resultMetaRow}>
                        <Text style={[styles.resultMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                            {item.quantity} {item.unit}
                            {entry.categoryName ? ` · ${entry.categoryName}` : ''}
                        </Text>
                        {stockStatus && (
                            <Text style={[styles.stockTag, { color: stockStatus.color }]}>
                                · {stockStatus.label}
                            </Text>
                        )}
                    </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: colors.bgPrimary }]}
            edges={['top']}
        >
            <View
                style={[
                    styles.searchBarWrap,
                    {
                        backgroundColor: colors.bgSecondary,
                        borderBottomColor: colors.borderPrimary,
                    },
                ]}
            >
                <TouchableOpacity
                    onPress={() => router.back()}
                    hitSlop={10}
                    style={styles.backButton}
                    accessibilityLabel="Back"
                >
                    <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={[styles.searchBar, { backgroundColor: colors.bgTertiary }]}>
                    <Ionicons name="search" size={18} color={colors.textTertiary} />
                    <TextInput
                        ref={inputRef}
                        style={[styles.input, { color: colors.textPrimary }]}
                        placeholder="Search items, categories…"
                        placeholderTextColor={colors.textMuted}
                        value={query}
                        onChangeText={setQuery}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoCapitalize="none"
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {query.trim().length === 0 ? (
                <View style={styles.hintWrap}>
                    <Ionicons name="search-outline" size={40} color={colors.textMuted} />
                    <Text style={[styles.hintTitle, { color: colors.textSecondary }]}>
                        Search your inventory
                    </Text>
                    <Text style={[styles.hintBody, { color: colors.textTertiary }]}>
                        Type an item name, brand, or category to find it instantly.
                    </Text>
                </View>
            ) : totalResults === 0 ? (
                <View style={styles.hintWrap}>
                    <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
                    <Text style={[styles.hintTitle, { color: colors.textSecondary }]}>
                        No results for "{query.trim()}"
                    </Text>
                    <Text style={[styles.hintBody, { color: colors.textTertiary }]}>
                        Try a shorter query or check the spelling.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={entries}
                    keyExtractor={(entry) => entry.key}
                    renderItem={renderEntry}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.listContent}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    searchBarWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        gap: spacing.sm,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        height: 42,
        borderRadius: borderRadius.md,
    },
    input: {
        flex: 1,
        fontSize: fontSize.md,
        padding: 0,
    },
    hintWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        gap: spacing.sm,
    },
    hintTitle: {
        fontSize: fontSize.lg,
        fontWeight: fontWeight.semibold,
        marginTop: spacing.sm,
        textAlign: 'center',
    },
    hintBody: {
        fontSize: fontSize.sm,
        textAlign: 'center',
    },
    listContent: {
        paddingBottom: spacing.xxxl,
    },
    sectionHeader: {
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.sm,
    },
    resultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: spacing.md,
    },
    iconBubble: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    resultTextWrap: { flex: 1 },
    resultName: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.medium,
    },
    resultMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
        gap: spacing.xs,
        flexWrap: 'wrap',
    },
    resultMeta: {
        fontSize: fontSize.sm,
    },
    stockTag: {
        fontSize: fontSize.sm,
        fontWeight: fontWeight.medium,
    },
});
