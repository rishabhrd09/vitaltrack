import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './useServerData';
import { itemService } from '@/services/items';
import { categoryService } from '@/services/categories';
import { orderService } from '@/services/orders';
import type { Item, Category, SavedOrder, OrderStatus } from '@/types';
import type { CreateItemRequest, UpdateItemRequest } from '@/services/items';
import type { CreateCategoryRequest, UpdateCategoryRequest } from '@/services/categories';
import type { CreateOrderRequest } from '@/services/orders';

// ─── Items ───

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItemRequest): Promise<Item> => itemService.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.items }),
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateItemRequest & { id: string; version: number }): Promise<Item> =>
      itemService.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.items }),
  });
}

export function useUpdateStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity, version }: { id: string; quantity: number; version: number }): Promise<Item> =>
      itemService.updateStock(id, quantity, version),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.items }),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => itemService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.items }),
  });
}

export function useToggleItemCritical() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isCritical, version }: { id: string; isCritical: boolean; version: number }): Promise<Item> =>
      itemService.update(id, { isCritical, version }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.items }),
  });
}

// ─── Categories ───

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCategoryRequest): Promise<Category> => categoryService.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateCategoryRequest & { id: string }): Promise<Category> =>
      categoryService.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoryService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories });
      qc.invalidateQueries({ queryKey: queryKeys.items });
    },
  });
}

// ─── Orders ───

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrderRequest): Promise<SavedOrder> => orderService.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.orders }),
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }): Promise<SavedOrder> =>
      orderService.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.orders }),
  });
}

export function useApplyOrderToStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string): Promise<SavedOrder> => orderService.applyToStock(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.items });
      qc.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orderService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.orders }),
  });
}
