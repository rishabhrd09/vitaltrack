/**
 * Result Dialog Queue
 *
 * UI-only Zustand store backing the MutationResultDialog overlay. The dialog
 * appears for slow-success and connection-failure mutation outcomes — the
 * scenarios where the user has been waiting long enough that a small bottom
 * toast is too easy to miss. Fast warm-server saves still use toast.
 *
 * Multiple results can be enqueued (e.g. user fired two saves before either
 * resolved). The dialog renders the first item in the queue; dismiss pops
 * it and the next one slides in.
 *
 * No persist middleware — purely in-session UI state. Matches useAppStore.
 */

import { create } from 'zustand';

export type ResultDialogKind = 'success-slow' | 'failure-connection';

export interface ResultDialogPayload {
  kind: ResultDialogKind;
  // Title shown at top of the dialog ("Saved", "Couldn't save").
  title: string;
  // Subtitle — typically the item or order name.
  subtitle: string;
  // Body copy explaining what happened. Keep to 2-3 lines.
  body: string;
  // Optional retry callback. When supplied, a Retry button is shown next
  // to Close. Tapping it dismisses the dialog and runs the callback.
  onRetry?: () => void;
}

interface ResultDialogState {
  queue: ResultDialogPayload[];
}

interface ResultDialogActions {
  enqueue: (payload: ResultDialogPayload) => void;
  dismissCurrent: () => void;
  clear: () => void;
}

export const useResultDialogStore = create<ResultDialogState & ResultDialogActions>(
  (set) => ({
    queue: [],
    enqueue: (payload) => set((s) => ({ queue: [...s.queue, payload] })),
    dismissCurrent: () => set((s) => ({ queue: s.queue.slice(1) })),
    clear: () => set({ queue: [] }),
  }),
);
