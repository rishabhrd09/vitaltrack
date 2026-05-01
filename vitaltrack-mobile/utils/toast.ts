/**
 * Toast wrapper around react-native-toast-message.
 *
 * Why a wrapper rather than calling Toast.show directly at every site:
 *  - Centralises copy length, duration, and visual position so all toasts
 *    feel the same across the app.
 *  - Provides a small, opinionated API (success / error / info) that's
 *    harder to misuse than the raw config object.
 *  - Lets us swap libraries later (e.g. burnt once we move off Expo Go)
 *    without touching every call site.
 *
 * The pattern is the Gmail / Notion / Slack ambient-feedback pattern:
 *  - success: brief, auto-dismiss (2s). User can keep working.
 *  - info:    brief, auto-dismiss (2.5s). Used for in-flight acknowledgements.
 *  - error:   longer (5s) and accepts an onRetry handler so failed mutations
 *             stay actionable instead of silently disappearing.
 *
 * Mount <Toast /> once at the root in app/_layout.tsx so toasts can render
 * over any screen, including modal-presentation routes.
 */

import Toast from 'react-native-toast-message';

const SUCCESS_DURATION_MS = 2000;
const INFO_DURATION_MS = 2500;
const ERROR_DURATION_MS = 5000;

export const toast = {
  success(message: string, description?: string): void {
    Toast.show({
      type: 'success',
      text1: message,
      text2: description,
      position: 'bottom',
      visibilityTime: SUCCESS_DURATION_MS,
      autoHide: true,
      bottomOffset: 80,
    });
  },

  info(message: string, description?: string): void {
    Toast.show({
      type: 'info',
      text1: message,
      text2: description,
      position: 'bottom',
      visibilityTime: INFO_DURATION_MS,
      autoHide: true,
      bottomOffset: 80,
    });
  },

  /**
   * Show an error toast. If `onRetry` is supplied the toast stays visible
   * longer and the message should hint at the recovery path
   * (e.g. "Couldn't update Nebulizer Machine — Tap to retry").
   * The retry handler runs on toast tap; the toast hides immediately after.
   */
  error(
    message: string,
    options?: { description?: string; onRetry?: () => void },
  ): void {
    Toast.show({
      type: 'error',
      text1: message,
      text2: options?.description,
      position: 'bottom',
      visibilityTime: ERROR_DURATION_MS,
      autoHide: true,
      bottomOffset: 80,
      onPress: options?.onRetry
        ? () => {
            Toast.hide();
            options.onRetry?.();
          }
        : undefined,
    });
  },

  hide(): void {
    Toast.hide();
  },
};
