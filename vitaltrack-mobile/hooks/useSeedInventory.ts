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

export type SeedResult =
  | { status: 'already-seeded' }
  | {
      status: 'seeded';
      createdCategories: number;
      createdItems: number;
      skippedExisting: number;
      skippedItemNames: string[];
      skippedCategoryNames: string[];
      trueFailures: string[];
    };

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

  const seed = async (
    onProgress?: (
      phase: 'categories' | 'items',
      current: number,
      total: number,
      currentName: string
    ) => void
  ): Promise<SeedResult> => {
    setIsSeeding(true);
    const totalCategories = SEED_DATA.length;
    const totalItems = SEED_DATA.reduce((sum, c) => sum + c.items.length, 0);
    let categoriesHandled = 0;
    let itemsHandled = 0;
    let createdCategories = 0;
    let createdItems = 0;
    let skippedExisting = 0;
    const skippedCategoryNames: string[] = [];
    const skippedItemNames: string[] = [];
    const trueFailures: string[] = [];

    const updateCategoryProgress = (action: string) => {
      setProgress({
        phase: 'categories',
        phaseCompleted: categoriesHandled,
        phaseTotal: totalCategories,
        currentAction: action,
      });
      onProgress?.('categories', categoriesHandled, totalCategories, action);
    };
    const updateItemProgress = (action: string) => {
      setProgress({
        phase: 'items',
        phaseCompleted: itemsHandled,
        phaseTotal: totalItems,
        currentAction: action,
      });
      onProgress?.('items', itemsHandled, totalItems, action);
    };

    try {
      // Fetch existing categories AND items once so we can skip duplicates
      const [existingCategoriesResp, existingItemsResp] = await Promise.all([
        categoryService.getAll(),
        itemService.getAll({ limit: 999 }),
      ]);
      const existingCategories: Category[] = [...existingCategoriesResp.categories];
      const existingItems: Item[] = [...existingItemsResp.items];

      // Short-circuit: if the defaults are already in place, skip the 42-op loop.
      // Tolerance of ≤4 missing items covers the case where the user intentionally
      // deleted a few seed items — in that case we still run the loop so the missing
      // ones get re-POSTed, and per-item dedup prevents the 28+ present ones from
      // being touched.
      const defaultCategoryNamesLower = SEED_DATA.map((c) => c.name.toLowerCase().trim());
      const defaultItemNamesLower = SEED_DATA.flatMap((c) =>
        c.items.map((i) => i.name.toLowerCase().trim())
      );
      const existingCatNamesLower = new Set(
        existingCategories.map((c) => c.name.toLowerCase().trim())
      );
      const existingItemNamesLower = new Set(
        existingItems.map((i) => i.name.toLowerCase().trim())
      );
      const allCategoriesPresent = defaultCategoryNamesLower.every((n) =>
        existingCatNamesLower.has(n)
      );
      const seedItemsPresent = defaultItemNamesLower.filter((n) =>
        existingItemNamesLower.has(n)
      ).length;
      if (allCategoriesPresent && seedItemsPresent >= 28) {
        return { status: 'already-seeded' };
      }

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
          skippedCategoryNames.push(seedCat.name);
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
              skippedCategoryNames.push(seedCat.name);
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
            skippedItemNames.push(seedItem.name);
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
              skippedItemNames.push(seedItem.name);
            } else {
              const msg = err instanceof Error ? err.message : String(err);
              trueFailures.push(`Item "${seedItem.name}": ${msg}`);
              console.warn('[Seed] Item create failed:', seedItem.name, msg);
            }
          }
          itemsHandled++;
        }
      }

    } finally {
      // Cache MUST be reconciled whether seed succeeded or threw —
      // a thrown error mid-loop still leaves the server with partial
      // changes, and the old cache no longer matches either state.
      // resetQueries drops the cache and shows skeletons; refetch
      // repopulates from source-of-truth.
      try {
        await Promise.all([
          qc.resetQueries({ queryKey: queryKeys.categories }),
          qc.resetQueries({ queryKey: queryKeys.items }),
          qc.resetQueries({ queryKey: queryKeys.activities }),
        ]);
        await Promise.all([
          qc.refetchQueries({ queryKey: queryKeys.categories }),
          qc.refetchQueries({ queryKey: queryKeys.items }),
        ]);
      } catch (reconcileErr) {
        console.warn('[Seed] Cache reconciliation failed:', reconcileErr);
      }
      setIsSeeding(false);
      setProgress(null);
    }

    return {
      status: 'seeded',
      createdCategories,
      createdItems,
      skippedExisting,
      skippedItemNames,
      skippedCategoryNames,
      trueFailures,
    };
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
 *
 * Fetches server state directly instead of trusting caller-supplied arrays.
 * The React Query cache can drift (phantom IDs locally, shadow records on
 * server), and issuing DELETEs for phantom IDs burns round-trips and
 * corrupts partial-failure accounting.
 */
export async function deleteAllInventory(): Promise<void> {
  // Source-of-truth reconciliation, not the React cache.
  const [serverItemsResp, serverCategoriesResp] = await Promise.all([
    itemService.getAll({ limit: 999 }),
    categoryService.getAll(),
  ]);
  const serverItems = serverItemsResp.items;
  const serverCategories = serverCategoriesResp.categories;

  const errors: string[] = [];

  for (const item of serverItems) {
    try {
      await itemService.delete(item.id);
    } catch (err) {
      // 404 is already swallowed in itemService.delete; this catches real failures.
      errors.push(`Item "${item.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const cat of serverCategories) {
    try {
      await categoryService.delete(cat.id);
    } catch (err) {
      errors.push(`Category "${cat.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Failed to delete ${errors.length} of ${serverItems.length + serverCategories.length} entries. ` +
        `First error: ${errors[0]}. ` +
        `Inventory may be in a partial state — please try Replace-all again.`
    );
  }
}

/**
 * Start Fresh hook — deletes all non-essential items from the server.
 * Categories are preserved. Essential items (ventilator, oxygen, etc.) stay.
 */
export function useStartFresh() {
  const qc = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const startFresh = async (
    onProgress?: (current: number, total: number, currentName: string) => void
  ): Promise<{ deleted: number; kept: number; errors: string[] }> => {
    setIsResetting(true);
    const errors: string[] = [];
    let deleted = 0;
    let kept = 0;

    try {
      // Fetch server state directly — the cache may have drifted and passing
      // in the React Query snapshot would issue DELETEs for phantom IDs.
      const serverItemsResp = await itemService.getAll({ limit: 999 });
      const allItems = serverItemsResp.items;
      const nonEssential = allItems.filter((i) => !isEssentialItem(i));
      kept = allItems.length - nonEssential.length;

      for (let i = 0; i < nonEssential.length; i++) {
        const item = nonEssential[i];
        onProgress?.(i, nonEssential.length, item.name);
        try {
          await itemService.delete(item.id);
          deleted++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${item.name}: ${msg}`);
        }
      }

    } finally {
      // Reset + refetch so the UI shows skeletons briefly, then renders the
      // actual post-operation state. invalidateQueries keeps stale data
      // visible for 30-60s on a cold-starting server — wrong for destructive ops.
      try {
        await Promise.all([
          qc.resetQueries({ queryKey: queryKeys.items }),
          qc.resetQueries({ queryKey: queryKeys.categories }),
          qc.resetQueries({ queryKey: queryKeys.activities }),
        ]);
        await Promise.all([
          qc.refetchQueries({ queryKey: queryKeys.items }),
          qc.refetchQueries({ queryKey: queryKeys.categories }),
        ]);
      } catch (reconcileErr) {
        console.warn('[StartFresh] Cache reconciliation failed:', reconcileErr);
      }
      setIsResetting(false);
    }

    return { deleted, kept, errors };
  };

  return { startFresh, isResetting };
}
