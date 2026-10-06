/**
 * Force-sync hook — invalidates inventory reads and re-fetches
 * items and categories from the server. Used by the Help & Support
 * "Refresh from server" button as a last-resort recovery from cache drift
 * (phantom IDs locally, shadow records on server) without requiring the
 * user to reinstall or log out.
 */

import { useQueryClient } from '@tanstack/react-query';
import { itemService } from '@/services/items';
import { categoryService } from '@/services/categories';
import { queryKeys } from './useServerData';
import type { Item, Category } from '@/types';

export function useForceSync() {
  const qc = useQueryClient();

  return async (): Promise<{ itemCount: number; categoryCount: number }> => {
    if (qc.isMutating()) throw new Error('Wait for pending changes before refreshing.');
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.items, refetchType: 'none' }),
      qc.invalidateQueries({ queryKey: queryKeys.categories, refetchType: 'none' }),
    ]);

    const [items, categories] = await Promise.all([
      qc.fetchQuery<Item[]>({
        queryKey: queryKeys.items,
        structuralSharing: false,
        queryFn: async ({ signal }) => {
          const resp = await itemService.getAll({ limit: 999 }, signal);
          return resp.items;
        },
      }),
      qc.fetchQuery<Category[]>({
        queryKey: queryKeys.categories,
        queryFn: async () => {
          const resp = await categoryService.getAll();
          return resp.categories;
        },
      }),
    ]);

    return {
      itemCount: items.length,
      categoryCount: categories.length,
    };
  };
}
