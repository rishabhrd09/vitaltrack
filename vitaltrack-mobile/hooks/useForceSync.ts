/**
 * Force-sync hook — drops the entire React Query cache and re-fetches
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
    // qc.clear() drops every cached query, forcing a cold read on next
    // subscribe. We then explicitly fetch items and categories into the
    // cache using the same unwrap shape useItems/useCategories expect
    // (Item[] / Category[]), so consumers get correctly-shaped data.
    qc.clear();

    const [items, categories] = await Promise.all([
      qc.fetchQuery<Item[]>({
        queryKey: queryKeys.items,
        queryFn: async () => {
          const resp = await itemService.getAll({ limit: 999 });
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
