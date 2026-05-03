import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from './useServerData';
import { itemService } from '@/services/items';
import { categoryService } from '@/services/categories';
import { orderService } from '@/services/orders';
import type { Item, Category, SavedOrder, OrderStatus } from '@/types';
import type { CreateItemRequest, UpdateItemRequest } from '@/services/items';
import type { CreateCategoryRequest, UpdateCategoryRequest } from '@/services/categories';
import type { CreateOrderRequest } from '@/services/orders';
import {
  dispatchMutationSuccess,
  dispatchMutationFailure,
} from '@/utils/mutationFeedback';

// ─── Items ───
// Tagged mutationKeys let usePendingItemIds identify in-flight item writes
// by inspecting the MutationCache. Variables for update/stock/delete/toggle
// always carry the item id, so a hook can map a mutation back to the row
// it affects without wrapping the mutation per-id.
//
// Feedback (toast / MutationResultDialog) is dispatched HOOK-LEVEL, not at
// the call site. Two reasons:
//
//  1. Hook-level callbacks are stored on the Mutation in the cache and fire
//     regardless of observer lifecycle. Call-site callbacks (mutate options
//     or .then on mutateAsync) bind to the React Query mutation observer,
//     which dies when the screen unmounts on safeBack(). The May 2 v3 audit
//     caught this — saves succeeded but no feedback fired because the
//     observer was already gone.
//
//  2. Hook-level dispatch suppresses the global MutationCache.onError toast
//     (because its check `if (mutation.options.onError) return;` becomes
//     true), eliminating the duplicate feedback (toast under the dialog)
//     visible in the May 4 screenshots.
//
// The trade-off: feedback is generic per mutation type rather than rich with
// call-site context (e.g. sanitized name from the form). We compensate by
// looking up the item name from variables (for create/update where the user
// just typed it) or from the items query cache (for delete/stock-update
// where variables only carry an id).

interface MutationContext {
  startedAt: number;
}

function lookupItemName(qc: QueryClient, id: string | undefined): string | undefined {
  if (!id) return undefined;
  const items = qc.getQueryData<Item[]>(queryKeys.items as unknown as string[]);
  return items?.find((i) => i.id === id)?.name;
}

/**
 * Find the just-errored Mutation in the cache and produce a callback that
 * re-executes it with the original variables. Used by hook-level onError
 * handlers to give the failure dialog a working Retry button.
 *
 * Hook-level onError doesn't receive a Mutation reference (only error,
 * variables, context). The reference equality check on `state.variables`
 * works because TanStack Query stores the same object the caller passed
 * to `mutate()`, so we can match the just-failed mutation back to its
 * Mutation instance and call execute() on it — which re-runs the
 * full lifecycle (onMutate → mutationFn → onSuccess/onError → cache
 * callbacks) so feedback dispatch fires again on the retry attempt.
 */
function makeRetry(
  qc: QueryClient,
  mutationKey: string,
  variables: unknown,
): (() => void) | undefined {
  return () => {
    const target = qc.getMutationCache().getAll().find((m) =>
      m.options.mutationKey?.[0] === mutationKey &&
      m.state.status === 'error' &&
      m.state.variables === variables,
    );
    target?.execute(variables as never);
  };
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation<Item, unknown, CreateItemRequest, MutationContext>({
    mutationKey: ['item-create'],
    mutationFn: (data) => itemService.create(data),
    onMutate: () => ({ startedAt: Date.now() }),
    onSuccess: (data, _variables, context) => {
      qc.invalidateQueries({ queryKey: queryKeys.items });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
      dispatchMutationSuccess({
        name: data.name,
        action: 'added',
        startedAt: context?.startedAt ?? Date.now(),
      });
    },
    onError: (error, variables, context) => {
      dispatchMutationFailure({
        name: variables.name || 'New item',
        action: 'add',
        startedAt: context?.startedAt ?? Date.now(),
        error,
        onRetry: makeRetry(qc, 'item-create', variables),
      });
    },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation<Item, unknown, UpdateItemRequest & { id: string; version: number; isActive?: boolean }, MutationContext>({
    mutationKey: ['item-update'],
    mutationFn: ({ id, ...data }) => itemService.update(id, data),
    onMutate: () => ({ startedAt: Date.now() }),
    onSuccess: (data, variables, context) => {
      qc.invalidateQueries({ queryKey: queryKeys.items });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
      const isRestoration = variables.isActive === true;
      dispatchMutationSuccess({
        name: data.name,
        action: isRestoration ? 'restored' : 'updated',
        startedAt: context?.startedAt ?? Date.now(),
      });
    },
    onError: (error, variables, context) => {
      const isRestoration = variables.isActive === true;
      const name = variables.name || lookupItemName(qc, variables.id) || 'this item';
      dispatchMutationFailure({
        name,
        action: isRestoration ? 'restore' : 'update',
        startedAt: context?.startedAt ?? Date.now(),
        error,
        onRetry: makeRetry(qc, 'item-update', variables),
      });
    },
  });
}

export function useUpdateStock() {
  const qc = useQueryClient();
  return useMutation<Item, unknown, { id: string; quantity: number; version: number }, MutationContext>({
    mutationKey: ['item-stock-update'],
    mutationFn: ({ id, quantity, version }) => itemService.updateStock(id, quantity, version),
    onMutate: () => ({ startedAt: Date.now() }),
    onSuccess: (data, _variables, context) => {
      qc.invalidateQueries({ queryKey: queryKeys.items });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
      dispatchMutationSuccess({
        name: data.name,
        action: 'updated',
        startedAt: context?.startedAt ?? Date.now(),
      });
    },
    onError: (error, variables, context) => {
      const name = lookupItemName(qc, variables.id) || 'this item';
      dispatchMutationFailure({
        name,
        action: 'update stock for',
        startedAt: context?.startedAt ?? Date.now(),
        error,
        onRetry: makeRetry(qc, 'item-stock-update', variables),
      });
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation<{ message: string }, unknown, string, MutationContext & { name?: string }>({
    mutationKey: ['item-delete'],
    mutationFn: (id) => itemService.delete(id),
    onMutate: (id) => ({
      startedAt: Date.now(),
      // Look up the name BEFORE the mutation removes the item from cache,
      // so the success/failure copy can still reference what was deleted.
      name: lookupItemName(qc, id),
    }),
    onSuccess: (_data, _variables, context) => {
      qc.invalidateQueries({ queryKey: queryKeys.items });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
      dispatchMutationSuccess({
        name: context?.name || 'Item',
        action: 'deleted',
        startedAt: context?.startedAt ?? Date.now(),
      });
    },
    onError: (error, variables, context) => {
      dispatchMutationFailure({
        name: context?.name || 'this item',
        action: 'delete',
        startedAt: context?.startedAt ?? Date.now(),
        error,
        onRetry: makeRetry(qc, 'item-delete', variables),
      });
    },
  });
}

export function useToggleItemCritical() {
  const qc = useQueryClient();
  return useMutation<Item, unknown, { id: string; isCritical: boolean; version: number }, MutationContext>({
    mutationKey: ['item-toggle-critical'],
    mutationFn: ({ id, isCritical, version }) => itemService.update(id, { isCritical, version }),
    onMutate: () => ({ startedAt: Date.now() }),
    onSuccess: (data, _variables, context) => {
      qc.invalidateQueries({ queryKey: queryKeys.items });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
      dispatchMutationSuccess({
        name: data.name,
        action: 'updated',
        startedAt: context?.startedAt ?? Date.now(),
      });
    },
    onError: (error, variables, context) => {
      const name = lookupItemName(qc, variables.id) || 'this item';
      dispatchMutationFailure({
        name,
        action: 'update',
        startedAt: context?.startedAt ?? Date.now(),
        error,
        onRetry: makeRetry(qc, 'item-toggle-critical', variables),
      });
    },
  });
}

// ─── Categories ───

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCategoryRequest): Promise<Category> => categoryService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateCategoryRequest & { id: string }): Promise<Category> =>
      categoryService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoryService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories });
      qc.invalidateQueries({ queryKey: queryKeys.items });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
    },
  });
}

// ─── Orders ───

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation<SavedOrder, unknown, CreateOrderRequest, MutationContext>({
    mutationKey: ['order-create'],
    mutationFn: (data) => orderService.create(data),
    onMutate: () => ({ startedAt: Date.now() }),
    onSuccess: (data, _variables, context) => {
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
      const orderId =
        (data as any).orderId ||
        (data as any).order_id ||
        (data as any).id ||
        'ORD-UNKNOWN';
      dispatchMutationSuccess({
        name: `Order ${orderId}`,
        action: 'created',
        startedAt: context?.startedAt ?? Date.now(),
      });
    },
    onError: (error, variables, context) => {
      dispatchMutationFailure({
        name: 'Order',
        action: 'create',
        startedAt: context?.startedAt ?? Date.now(),
        error,
        onRetry: makeRetry(qc, 'order-create', variables),
      });
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }): Promise<SavedOrder> =>
      orderService.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
    },
  });
}

export function useApplyOrderToStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string): Promise<SavedOrder> => orderService.applyToStock(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.items });
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
    },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orderService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      qc.invalidateQueries({ queryKey: queryKeys.activities });
    },
  });
}
