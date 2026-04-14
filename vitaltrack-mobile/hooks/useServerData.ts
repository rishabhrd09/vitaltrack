import { useQuery } from '@tanstack/react-query';
import { itemService } from '@/services/items';
import { categoryService } from '@/services/categories';
import { orderService } from '@/services/orders';
import { api } from '@/services/api';
import type { Item, Category, SavedOrder, DashboardStats, ActivityLog } from '@/types';

export const queryKeys = {
  items: ['items'] as const,
  categories: ['categories'] as const,
  orders: ['orders'] as const,
  stats: ['items', 'stats'] as const,
  activities: ['activities'] as const,
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
    staleTime: 0,
  });
}

export function useStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: (): Promise<DashboardStats> => itemService.getStats(),
  });
}

export function useActivities(limit = 50) {
  return useQuery({
    queryKey: queryKeys.activities,
    queryFn: async (): Promise<ActivityLog[]> => {
      const response = await api.get<{ activities: ActivityLog[]; total: number }>(
        `/activities?limit=${limit}`
      );
      return response.activities;
    },
  });
}
