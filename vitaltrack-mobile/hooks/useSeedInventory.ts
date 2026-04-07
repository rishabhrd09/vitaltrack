/**
 * Seed inventory hook — creates the 32 default medical items on the server.
 *
 * Flow:
 * 1. Create each category via POST /categories, collect server IDs
 * 2. For each category's items, POST /items with the server categoryId
 * 3. Invalidate React Query caches at the end
 *
 * Handles partial failures: if a category already exists (e.g., retry),
 * it looks up the existing one and continues.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { categoryService } from '@/services/categories';
import { itemService } from '@/services/items';
import { SEED_DATA, ESSENTIAL_ITEM_KEYWORDS } from '@/data/seedData';
import { queryKeys } from './useServerData';
import type { Item, Category } from '@/types';

interface SeedProgress {
  total: number;
  completed: number;
  currentAction: string;
  errors: string[];
}

export interface SeedResult {
  completed: number;
  total: number;
  errors: string[];
}

// Matches the original Kotlin/React Native isCritical logic
function isCriticalSeedItem(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('ventilator') ||
    n.includes('bipap') ||
    n.includes('oxygen') ||
    n.includes('ambu') ||
    n.includes('suction') ||
    n.includes('nebulizer') ||
    n.includes('nebuliser') ||
    n.includes('tt tube') ||
    n.includes('catheter mount')
  );
}

export function useSeedInventory() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  const seed = async (): Promise<SeedResult> => {
    setIsSeeding(true);
    const totalSteps = SEED_DATA.reduce(
      (sum, cat) => sum + 1 + cat.items.length,
      0
    );
    let completed = 0;
    const errors: string[] = [];

    const updateProgress = (action: string) => {
      setProgress({ total: totalSteps, completed, currentAction: action, errors });
    };

    try {
      // Fetch existing categories AND items once so we can skip duplicates
      const [existingCategoriesResp, existingItemsResp] = await Promise.all([
        categoryService.getAll(),
        itemService.getAll({ limit: 999 }),
      ]);
      const existingCategories: Category[] = [...existingCategoriesResp.categories];
      const existingItems: Item[] = [...existingItemsResp.items];

      // Build a (categoryId, lowercased name) → item map for O(1) dedup checks
      const existingItemKey = (categoryId: string, name: string) =>
        `${categoryId}::${name.toLowerCase().trim()}`;
      const existingItemKeys = new Set(
        existingItems.map((i) => existingItemKey(i.categoryId, i.name))
      );

      for (let catIdx = 0; catIdx < SEED_DATA.length; catIdx++) {
        const seedCat = SEED_DATA[catIdx];
        updateProgress(`Checking category: ${seedCat.name}`);

        let categoryId: string;

        // Skip if this category already exists (case-insensitive)
        const existing = existingCategories.find(
          (c) => c.name.toLowerCase().trim() === seedCat.name.toLowerCase().trim()
        );
        if (existing) {
          categoryId = existing.id;
          completed++;
        } else {
          try {
            const created = await categoryService.create({
              name: seedCat.name,
              description: seedCat.description,
              displayOrder: catIdx,
            });
            categoryId = created.id;
            existingCategories.push(created);
            completed++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Category "${seedCat.name}": ${msg}`);
            console.warn('[Seed] Category create failed:', seedCat.name, msg);
            // Skip items for this category since we have no categoryId
            completed += seedCat.items.length;
            continue;
          }
        }

        // Create items under this category — skip if name already exists in this category
        for (const seedItem of seedCat.items) {
          const key = existingItemKey(categoryId, seedItem.name);
          if (existingItemKeys.has(key)) {
            updateProgress(`Skipping existing: ${seedItem.name}`);
            completed++;
            continue;
          }
          updateProgress(`Creating item: ${seedItem.name}`);
          try {
            const created = await itemService.create({
              categoryId,
              name: seedItem.name,
              description: seedItem.description,
              quantity: 0,
              unit: seedItem.unit,
              minimumStock: seedItem.minimumStock,
              isCritical: isCriticalSeedItem(seedItem.name),
            });
            existingItemKeys.add(key);
            existingItems.push(created);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Item "${seedItem.name}": ${msg}`);
            console.warn('[Seed] Item create failed:', seedItem.name, msg);
          }
          completed++;
        }
      }

      // Refresh everything
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.categories }),
        qc.invalidateQueries({ queryKey: queryKeys.items }),
        qc.invalidateQueries({ queryKey: queryKeys.activities }),
      ]);
    } finally {
      setIsSeeding(false);
      setProgress(null);
    }

    return { completed, total: totalSteps, errors };
  };

  return { seed, progress, isSeeding };
}

/**
 * Check whether an item should be preserved during "Start Fresh".
 * Essentials are critical life-support equipment.
 */
export function isEssentialItem(item: Item): boolean {
  const name = item.name.toLowerCase();
  return ESSENTIAL_ITEM_KEYWORDS.some((keyword) => name.includes(keyword));
}

/**
 * Set of protected category names (the 10 default medical domains from seedData.ts).
 * These represent the structural backbone of a home ICU and cannot be deleted by
 * Start Fresh or by the trash button in Build Inventory.
 */
const PROTECTED_CATEGORY_NAMES_LOWER = new Set(
  SEED_DATA.map((c) => c.name.toLowerCase().trim())
);

export function isProtectedCategory(name: string): boolean {
  return PROTECTED_CATEGORY_NAMES_LOWER.has(name.toLowerCase().trim());
}

/**
 * For a given category name, return the seed items that belong to it
 * but are NOT yet present in the user's existing items.
 *
 * Used by Build Inventory to show "Suggested Items" beneath existing ones.
 */
export function getSuggestedItemsForCategory(
  categoryName: string,
  existingItems: Item[]
): Array<{ name: string; unit: string; minimumStock: number; description?: string; isCritical: boolean }> {
  const seedCat = SEED_DATA.find(
    (c) => c.name.toLowerCase().trim() === categoryName.toLowerCase().trim()
  );
  if (!seedCat) return [];

  const existingNamesLower = new Set(
    existingItems.map((i) => i.name.toLowerCase().trim())
  );

  return seedCat.items
    .filter((s) => !existingNamesLower.has(s.name.toLowerCase().trim()))
    .map((s) => ({
      name: s.name,
      unit: s.unit,
      minimumStock: s.minimumStock,
      description: s.description,
      isCritical: isCriticalSeedItem(s.name),
    }));
}

/**
 * Silent auto-backup — writes a JSON snapshot to the app's document directory
 * and returns the file path. No share dialog. Used before destructive actions
 * like Start Fresh so the user can recover their data.
 */
export async function createAutoBackup(
  categories: Category[],
  items: Item[]
): Promise<string> {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories,
    items,
  };
  const json = JSON.stringify(backup, null, 2);
  const FileSystem = await import('expo-file-system/legacy');
  const dir = FileSystem.documentDirectory || '';
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileUri = `${dir}VitalTrack-AutoBackup-${dateStr}.json`;
  await FileSystem.writeAsStringAsync(fileUri, json);
  return fileUri;
}

/**
 * Start Fresh hook — deletes all non-essential items from the server.
 * Categories are preserved. Essential items (ventilator, oxygen, etc.) stay.
 */
export function useStartFresh() {
  const qc = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const startFresh = async (allItems: Item[]): Promise<{ deleted: number; kept: number; errors: string[] }> => {
    setIsResetting(true);
    const errors: string[] = [];
    let deleted = 0;
    let kept = 0;

    try {
      for (const item of allItems) {
        if (isEssentialItem(item)) {
          kept++;
          continue;
        }
        try {
          await itemService.delete(item.id);
          deleted++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${item.name}: ${msg}`);
        }
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.items }),
        qc.invalidateQueries({ queryKey: queryKeys.activities }),
      ]);
    } finally {
      setIsResetting(false);
    }

    return { deleted, kept, errors };
  };

  return { startFresh, isResetting };
}
