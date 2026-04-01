import type { ErrorBoundaryConfig, ErrorBoundaryContext } from './error-boundary.types.js';
import { MainErrorBoundary } from './error-boundary.class.js';

// Re-export everything
export type {
  ErrorBoundaryContext,
  ErrorHandler,
  RecoveryStrategy,
  ErrorBoundaryConfig,
} from './error-boundary.types.js';
export { normalizeError } from './error-boundary.types.js';
export { MainErrorBoundary } from './error-boundary.class.js';
export {
  createRetryStrategy,
  createFallbackStrategy,
  createCircuitBreakerResetStrategy,
} from './error-boundary.strategies.js';

// Singleton management
let globalErrorBoundary: MainErrorBoundary | null = null;

export function getGlobalErrorBoundary(config?: Partial<ErrorBoundaryConfig>): MainErrorBoundary {
  if (!globalErrorBoundary) {
    globalErrorBoundary = new MainErrorBoundary(config);
  }
  return globalErrorBoundary;
}

export function resetGlobalErrorBoundary(): void {
  globalErrorBoundary = null;
}

export async function withErrorBoundary<T>(
  fn: () => Promise<T>,
  context: ErrorBoundaryContext,
): Promise<T> {
  return getGlobalErrorBoundary().guard(fn, context);
}

export function withErrorBoundarySync<T>(fn: () => T, context: ErrorBoundaryContext): T {
  return getGlobalErrorBoundary().guardSync(fn, context);
}
