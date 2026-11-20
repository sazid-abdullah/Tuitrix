import * as Sentry from '@sentry/react';

export function initSentry(): boolean {
  const dsn = (import.meta.env.VITE_SENTRY_DSN || '').trim();
  if (!dsn || import.meta.env.MODE === 'test') {
    return false;
  }

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      sendDefaultPii: false,
      ignoreErrors: [
        'ResizeObserver loop',
        'Failed to fetch dynamically imported module',
      ],
    } as any);
    return true;
  } catch (error) {
    console.warn('[Sentry] Failed to initialize:', error);
    return false;
  }
}

export function getReactRootErrorHandlers() {
  return {
    onUncaughtError: Sentry.reactErrorHandler(),
    onCaughtError: Sentry.reactErrorHandler(),
    onRecoverableError: Sentry.reactErrorHandler(),
  };
}
