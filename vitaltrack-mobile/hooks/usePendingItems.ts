/**
 * usePendingItemIds
 *
 * Returns the set of item ids that currently have an in-flight server
 * mutation (update, stock change, delete, or critical toggle). Used to
 * render per-row "Updating…" indicators on the inventory and dashboard
 * surfaces during the cold-start window where mutations can take 30–60s.
 *
 * Why a Set rather than a per-id boolean hook: a single Set lookup at the
 * parent avoids subscribing each row to mutation-cache changes, which
 * would re-render every visible row on every state transition.
 *
 * Identification works via mutationKey tags on the item mutation hooks
 * (see useServerMutations.ts). Variables for these mutations always carry
 * the affected item's id, so the cache entry maps cleanly back to a row
 * without needing per-id mutation wrappers.
 *
 * Server-first note: this hook only reads in-flight server mutations from
 * the TanStack Query cache. It does not touch query data, does not
 * optimistically modify any cache entry, and its worst failure mode is
 * a stuck "Updating…" badge — the underlying item values are unaffected.
 */

import { useMemo } from 'react';
import { useMutationState } from '@tanstack/react-query';

const ITEM_MUTATION_KEYS: ReadonlySet<string> = new Set([
  'item-update',
  'item-stock-update',
  'item-delete',
  'item-toggle-critical',
]);

function extractItemId(variables: unknown): string | null {
  if (typeof variables === 'string') return variables;
  if (variables && typeof variables === 'object' && 'id' in variables) {
    const id = (variables as { id: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

export function usePendingItemIds(): Set<string> {
  const ids = useMutationState({
    filters: {
      status: 'pending',
      predicate: (m) => {
        const k = m.options.mutationKey?.[0];
        return typeof k === 'string' && ITEM_MUTATION_KEYS.has(k);
      },
    },
    select: (m) => extractItemId(m.state.variables),
  });

  return useMemo(
    () => new Set(ids.filter((x): x is string => !!x)),
    // ids is a fresh array per render but stable in content; depending
    // on its identity is fine because useMutationState only fires when
    // matching mutations actually change.
    [ids],
  );
}
