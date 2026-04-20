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
import { ApiClientError } from '@/services/api';
import { SEED_DATA, ESSENTIAL_ITEM_KEYWORDS } from '@/data/seedData';
import { queryKeys } from './useServerData';
import type { Item, Category } from '@/types';

interface SeedProgress {
  phase: 'categories' | 'items';
  phaseCompleted: number;
  phaseTotal: number;
  currentAction: string;
}

export interface SeedResult {
  createdCategories: number;
  createdItems: number;
  skippedExisting: number;
  skippedExistingNames: string[];
  trueFailures: string[];
}

// A duplicate-name collision that slipped past the pre-fetch is NOT a failure —
// it's an expected outcome. Classify by status code first (409 once Task 9 ships)
// and fall back to detail-string matching while the backend still returns 400.
function isDuplicateNameError(err: unknown): boolean {
  if (!(err instanceof ApiClientError)) return false;
  if (err.status === 409) return true;
  if (err.status === 400 && /already exists/i.test(err.message)) return true;
  return false;
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
    const totalCategories = SEED_DATA.length;
    const totalItems = SEED_DATA.reduce((sum, c) => sum + c.items.length, 0);
    let categoriesHandled = 0;
    let itemsHandled = 0;
    let createdCategories = 0;
    let createdItems = 0;
    let skippedExisting = 0;
    const skippedExistingNames: string[] = [];
    const trueFailures: string[] = [];

    const updateCategoryProgress = (action: string) => {
      setProgress({
        phase: 'categories',
        phaseCompleted: categoriesHandled,
        phaseTotal: totalCategories,
        currentAction: action,
      });
    };
    const updateItemProgress = (action: string) => {
      setProgress({
        phase: 'items',
        phaseCompleted: itemsHandled,
        phaseTotal: totalItems,
        currentAction: action,
      });
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
        updateCategoryProgress(seedCat.name);

        let categoryId: string;

        // Skip if this category already exists (case-insensitive)
        const existing = existingCategories.find(
          (c) => c.name.toLowerCase().trim() === seedCat.name.toLowerCase().trim()
        );
        if (existing) {
          categoryId = existing.id;
          skippedExisting++;
          skippedExistingNames.push(seedCat.name);
        } else {
          try {
            const created = await categoryService.create({
              name: seedCat.name,
              description: seedCat.description,
              displayOrder: catIdx,
            });
            categoryId = created.id;
            existingCategories.push(created);
            createdCategories++;
          } catch (err) {
            if (isDuplicateNameError(err)) {
              // Race condition — another client created it; treat as skipped.
              skippedExisting++;
              skippedExistingNames.push(seedCat.name);
              categoriesHandled++;
              itemsHandled += seedCat.items.length;
              continue;
            }
            const msg = err instanceof Error ? err.message : String(err);
            trueFailures.push(`Category "${seedCat.name}": ${msg}`);
            console.warn('[Seed] Category create failed:', seedCat.name, msg);
            // Skip items for this category since we have no categoryId
            categoriesHandled++;
            itemsHandled += seedCat.items.length;
            continue;
          }
        }
        categoriesHandled++;
        updateCategoryProgress(seedCat.name);

        // Create items under this category — skip if name already exists in this category
        for (const seedItem of seedCat.items) {
          const key = existingItemKey(categoryId, seedItem.name);
          if (existingItemKeys.has(key)) {
            updateItemProgress(`Skipping existing: ${seedItem.name}`);
            skippedExisting++;
            skippedExistingNames.push(seedItem.name);
            itemsHandled++;
            continue;
          }
          updateItemProgress(seedItem.name);
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
            createdItems++;
          } catch (err) {
            if (isDuplicateNameError(err)) {
              existingItemKeys.add(key);
              skippedExisting++;
              skippedExistingNames.push(seedItem.name);
            } else {
              const msg = err instanceof Error ? err.message : String(err);
              trueFailures.push(`Item "${seedItem.name}": ${msg}`);
              console.warn('[Seed] Item create failed:', seedItem.name, msg);
            }
          }
          itemsHandled++;
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

    return { createdCategories, createdItems, skippedExisting, skippedExistingNames, trueFailures };
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
): { name: string; unit: string; minimumStock: number; description?: string; isCritical: boolean }[] {
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
  const fileUri = `${dir}CareKosh-AutoBackup-${dateStr}.json`;
  await FileSystem.writeAsStringAsync(fileUri, json);
  return fileUri;
}

/**
 * Replace-all delete — wipes every item and every category, including the
 * 10 "protected" default categories. The user reaches this only by tapping
 * through two confirmation dialogs, so the protection (which exists to stop
 * accidental long-press deletions from the Build Inventory screen) is
 * intentionally bypassed here. The subsequent seed step re-creates the
 * defaults, so any category whose delete fails server-side (e.g., backend
 * also enforces protection) will still be present and get merged correctly.
 *
 * Item-before-category ordering matters because of the FK from items to
 * categories; categories with items cannot be deleted.
 */
export async function deleteAllInventory(
  items: Item[],
  categories: Category[]
): Promise<{ itemsDeleted: number; categoriesDeleted: number; errors: string[] }> {
  const errors: string[] = [];
  let itemsDeleted = 0;
  let categoriesDeleted = 0;

  for (const item of items) {
    try {
      await itemService.delete(item.id);
      itemsDeleted++;
    } catch (err) {
      errors.push(`Item "${item.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const cat of categories) {
    try {
      await categoryService.delete(cat.id);
      categoriesDeleted++;
    } catch (err) {
      // Backend may still protect defaults — seed() will find them and skip.
      errors.push(`Category "${cat.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { itemsDeleted, categoriesDeleted, errors };
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
