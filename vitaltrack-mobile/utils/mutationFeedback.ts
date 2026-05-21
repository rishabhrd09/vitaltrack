/**
 * Mutation Feedback Dispatcher
 *
 * Single decision point for what the user sees when a mutation settles.
 * Routes between the small bottom toast (fast warm-server outcomes) and
 * the prominent MutationResultDialog overlay (cold-start scenarios where
 * the user has been waiting and needs a clearer acknowledgement).
 *
 * Decision matrix:
 *
 *   outcome   | elapsed         | error kind                  | feedback
 *   ----------|-----------------|----------------------------- |---------
 *   success   | < 5 s           | -                           | toast
 *   success   | >= 5 s          | -                           | dialog
 *   failure   | -               | connection (status 0/5xx)   | dialog
 *   failure   | -               | validation/conflict (4xx)   | toast
 *
 * Connection-failure dialog includes a Retry button when the call site
 * provides a refire callback. Validation/conflict failures stay as toasts
 * because they happen instantly (not server-related) and the user needs
 * to fix something on their end, not retry the same payload.
 */

import { ApiClientError } from '@/services/api';
import { toast } from '@/utils/toast';
import { useResultDialogStore } from '@/store/useResultDialogStore';

const SLOW_THRESHOLD_MS = 5000;

const CONNECTION_STATUSES: ReadonlySet<number> = new Set([0, 502, 503, 504]);

function isConnectionError(error: unknown): boolean {
  return error instanceof ApiClientError && CONNECTION_STATUSES.has(error.status);
}

interface SuccessArgs {
  // Display name of the saved entity (item name, order id, etc).
  name: string;
  // Past-tense action verb for copy: "updated", "added", "deleted",
  // "restored", "created".
  action: string;
  // Date.now() captured immediately before .mutate() was called.
  startedAt: number;
}

interface FailureArgs {
  name: string;
  // Past-tense action verb: same options as success.
  action: string;
  startedAt: number;
  error: unknown;
  // Optional refire — when provided, the dialog shows a Retry button that
  // runs this callback before dismissing. Pass () => mutation.mutate(vars)
  // from the call site if you want one-tap retry.
  onRetry?: () => void;
}

export function dispatchMutationSuccess(args: SuccessArgs): void {
  const elapsed = Date.now() - args.startedAt;

  if (elapsed >= SLOW_THRESHOLD_MS) {
    useResultDialogStore.getState().enqueue({
      kind: 'success-slow',
      title: 'Saved',
      subtitle: args.name,
      body: `Your changes were saved successfully after the server warmed up (took ~${Math.round(elapsed / 1000)} seconds).`,
    });
    return;
  }

  toast.success(`${args.name} ${args.action}`);
}

export function dispatchMutationFailure(args: FailureArgs): void {
  if (isConnectionError(args.error)) {
    const errMessage =
      args.error instanceof Error ? args.error.message : String(args.error);
    useResultDialogStore.getState().enqueue({
      kind: 'failure-connection',
      title: `Couldn't ${args.action}`,
      subtitle: args.name,
      body: `${errMessage} Your changes were not saved. Please try again when your connection is stable.`,
      onRetry: args.onRetry,
    });
    return;
  }

  // Validation / conflict / other server errors: toast (current behaviour).
  // These happen quickly and are usually fixable inline (e.g. duplicate
  // name, OCC version conflict needing refresh) rather than retried as-is.
  const errMessage = args.error instanceof Error ? args.error.message : String(args.error);
  toast.error(`Couldn't ${args.action} ${args.name}`, {
    description: errMessage,
    onRetry: args.onRetry,
  });
}
