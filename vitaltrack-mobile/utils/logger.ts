type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

function sanitizeDetail(detail: unknown): unknown {
  if (detail instanceof Error) {
    return { name: detail.name, message: detail.message };
  }

  if (typeof detail === 'string') {
    return detail.length > 180 ? `${detail.slice(0, 180)}...` : detail;
  }

  return detail;
}

function write(level: LogLevel, scope: string, message: string, detail?: unknown): void {
  if (!isDev) return;

  const prefix = `[${scope}]`;
  if (detail === undefined) {
    console[level](prefix, message);
    return;
  }

  console[level](prefix, message, sanitizeDetail(detail));
}

export const logger = {
  debug: (scope: string, message: string, detail?: unknown) => write('debug', scope, message, detail),
  info: (scope: string, message: string, detail?: unknown) => write('info', scope, message, detail),
  warn: (scope: string, message: string, detail?: unknown) => write('warn', scope, message, detail),
  error: (scope: string, message: string, detail?: unknown) => write('error', scope, message, detail),
};
