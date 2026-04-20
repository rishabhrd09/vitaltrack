/**
 * Collapse runs of same-action activity entries that happened in a tight time
 * window into a single summary row. Prevents bulk operations (Start Fresh,
 * Replace-all, seed) from flooding the dashboard activity feed with 20+
 * individual rows that crowd out genuinely important events.
 *
 * Heuristic: consecutive entries with the same `action`, all within
 * BULK_GROUP_WINDOW_MS of the first entry in the run, collapse when the run
 * length reaches MIN_GROUP_SIZE. Activities arrive newest-first; the run's
 * first entry is the newest.
 *
 * Purely client-side. The individual rows remain in the DB for audit; this
 * only affects what the UI shows.
 */
import type { ActivityActionType, ActivityLog } from '@/types';

const BULK_GROUP_WINDOW_MS = 10_000;
const MIN_GROUP_SIZE = 3;

function describeBulk(action: ActivityActionType, n: number): string {
  switch (action) {
    case 'item_delete':
      return `${n} items deleted`;
    case 'item_create':
      return `${n} items added`;
    case 'stock_update':
      return `${n} stock updates`;
    default:
      return `${n} ${action.replace(/_/g, ' ')} events`;
  }
}

export function groupBulkActivities(activities: ActivityLog[]): ActivityLog[] {
  if (activities.length < MIN_GROUP_SIZE) return activities;
  const result: ActivityLog[] = [];
  let i = 0;
  while (i < activities.length) {
    const anchor = activities[i];
    const anchorTime = new Date(anchor.timestamp).getTime();
    let j = i + 1;
    while (
      j < activities.length &&
      activities[j].action === anchor.action &&
      anchorTime - new Date(activities[j].timestamp).getTime() <= BULK_GROUP_WINDOW_MS
    ) {
      j++;
    }
    const runLength = j - i;
    if (runLength >= MIN_GROUP_SIZE) {
      result.push({
        ...anchor,
        id: `bulk-${anchor.id}`,
        itemName: describeBulk(anchor.action, runLength),
        details: `Bulk operation · ${runLength} items affected`,
      });
    } else {
      for (let k = i; k < j; k++) result.push(activities[k]);
    }
    i = j;
  }
  return result;
}
