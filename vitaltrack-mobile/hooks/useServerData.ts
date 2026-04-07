import { useQuery } from '@tanstack/react-query';
import { itemService } from '@/services/items';
import { categoryService } from '@/services/categories';
import { orderService } from '@/services/orders';
import type { Item, Category, SavedOrder, DashboardStats } from '@/types';

export const queryKeys = {
  items: ['items'] as const,
  categories: ['categories'] as const,
  orders: ['orders'] as const,
  stats: ['items', 'stats'] as const,
  item: (id: string) => ['items', id] as const,
};

export function useItems() {
  return useQuery({
    queryKey: queryKeys.items,
    queryFn: async (): Promise<Item[]> => {
      const response = await itemService.getAll({ limit: 999 });
      return response.items;
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: async (): Promise<Category[]> => {
      const response = await categoryService.getAll();
      return response.categories;
    },
  });
}

export function useOrders() {
  return useQuery({
    queryKey: queryKeys.orders,
    queryFn: async (): Promise<SavedOrder[]> => {
      const response = await orderService.getAll();
      return response.orders;
    },
  });
}

export function useStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: (): Promise<DashboardStats> => itemService.getStats(),
  });
}
