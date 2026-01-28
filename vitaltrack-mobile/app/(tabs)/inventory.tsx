/**
 * VitalTrack Mobile - Inventory Screen
 * Category-grouped inventory with search and dual view mode
 */

import { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/store/useAppStore';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import CategoryHeader from '@/components/inventory/CategoryHeader';
import ItemRow from '@/components/inventory/ItemRow';

type ViewMode = 'categories' | 'all';

export default function InventoryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [localSearch, setLocalSearch] = useState('');

  const categories = useAppStore((state) => state.categories);
  const items = useAppStore((state) => state.getActiveItems());
  const expandedCategories = useAppStore((state) => state.expandedCategories);
  const expandedItems = useAppStore((state) => state.expandedItems);
  const toggleCategoryExpand = useAppStore((state) => state.toggleCategoryExpand);
  const toggleItemExpand = useAppStore((state) => state.toggleItemExpand);

  const filteredItems = useMemo(() => {
    if (!localSearch.trim()) return items;
    const query = localSearch.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.brand?.toLowerCase().includes(query)
    );
  }, [items, localSearch]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Inventory</Text>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.accentBlue }]}
            onPress={() => router.push('/item/new')}
          >
            <Ionicons name="add" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search items..."
            placeholderTextColor={colors.textTertiary}
            value={localSearch}
            onChangeText={setLocalSearch}
          />
          {localSearch.length > 0 && (
            <TouchableOpacity onPress={() => setLocalSearch('')}>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* View Mode Toggle */}
        <View style={[styles.viewModeContainer, { backgroundColor: colors.bgSecondary }]}>
          <TouchableOpacity
            style={[
              styles.viewModeButton,
              viewMode === 'categories' && { backgroundColor: colors.bgCard },
            ]}
            onPress={() => setViewMode('categories')}
          >
            <Ionicons
              name="folder-outline"
              size={16}
              color={viewMode === 'categories' ? colors.accentBlue : colors.textTertiary}
            />
            <Text
              style={[
                styles.viewModeText,
                { color: viewMode === 'categories' ? colors.textPrimary : colors.textTertiary },
              ]}
            >
              Categories
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.viewModeButton,
              viewMode === 'all' && { backgroundColor: colors.bgCard },
            ]}
            onPress={() => setViewMode('all')}
          >
            <Ionicons
              name="list-outline"
              size={16}
              color={viewMode === 'all' ? colors.accentBlue : colors.textTertiary}
            />
            <Text
              style={[
                styles.viewModeText,
                { color: viewMode === 'all' ? colors.textPrimary : colors.textTertiary },
              ]}
            >
              All Items
            </Text>
          </TouchableOpacity>
        </View>

        {/* Item Count */}
        <View style={styles.countContainer}>
          <Text style={[styles.countText, { color: colors.textTertiary }]}>
            {filteredItems.length} items • {categories.length} categories
          </Text>
        </View>
      </View>

      {/* Search Results Banner */}
      {localSearch.trim() && (
        <View style={[styles.searchBanner, { backgroundColor: colors.accentBlueBg }]}>
          <Text style={[styles.searchBannerText, { color: colors.accentBlue }]}>
            Showing {filteredItems.length} results for "{localSearch}"
          </Text>
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {viewMode === 'categories' ? (
          categories.map((category) => {
            const categoryItems = filteredItems.filter(
              (item) => item.categoryId === category.id
            );
            if (localSearch.trim() && categoryItems.length === 0) return null;
            const isExpanded = expandedCategories.includes(category.id);

            return (
              <View key={category.id} style={styles.categorySection}>
                <CategoryHeader
                  category={category}
                  items={categoryItems}
                  isExpanded={isExpanded}
                  onToggle={() => toggleCategoryExpand(category.id)}
                  onAddItem={() => router.push('/item/new')}
                />
                {isExpanded && (
                  <View style={styles.itemsList}>
                    {categoryItems.length === 0 ? (
                      <View style={[styles.emptyCategory, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
                        <Text style={[styles.emptyCategoryText, { color: colors.textTertiary }]}>
                          No items in this category
                        </Text>
                      </View>
                    ) : (
                      categoryItems.map((item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          isExpanded={expandedItems.includes(item.id)}
                          onToggle={() => toggleItemExpand(item.id)}
                          onEdit={() => router.push(`/item/${item.id}`)}
                        />
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })
        ) : (
          <View style={styles.allItemsList}>
            {filteredItems
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  isExpanded={expandedItems.includes(item.id)}
                  onToggle={() => toggleItemExpand(item.id)}
                  onEdit={() => router.push(`/item/${item.id}`)}
                  showCategory
                />
              ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: fontSize.md,
    marginLeft: spacing.sm,
  },
  viewModeContainer: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    marginBottom: spacing.md,
  },
  viewModeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  viewModeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  countContainer: { alignItems: 'center' },
  countText: { fontSize: fontSize.sm },
  searchBanner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  searchBannerText: { fontSize: fontSize.sm },
  scrollView: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 130,
  },
  categorySection: { marginBottom: spacing.md },
  itemsList: { marginTop: spacing.sm, gap: spacing.sm },
  allItemsList: { gap: spacing.sm },
  emptyCategory: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyCategoryText: { fontSize: fontSize.sm },
});
