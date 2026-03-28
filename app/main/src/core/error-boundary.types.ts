import type { ClarityOkrError, ErrorCode } from '@clarityokr/contracts';
import { isClarityOkrError } from '@clarityokr/contracts';

/**
 * Error boundary context for tracking where errors occurred
 */
export interface ErrorBoundaryContext {
  component: string;
  operation: string;
  metadata?: Record<string, unknown>;
}

/**
 * Error handler function type
 */
export type ErrorHandler = (
  error: ClarityOkrError,
  context: ErrorBoundaryContext,
) => void | Promise<void>;

/**
 * Recovery strategy function type
 */
export type RecoveryStrategy = (
  error: ClarityOkrError,
  context: ErrorBoundaryContext,
) => Promise<boolean>;

/**
 * Configuration for error boundary
 */
export interface ErrorBoundaryConfig {
  logErrors: boolean;
  showNotifications: boolean;
  customHandlers?: Partial<Record<ErrorCode, ErrorHandler>>;
  recoveryStrategies?: Partial<Record<ErrorCode, RecoveryStrategy>>;
  onRecoveryFailed?: (error: ClarityOkrError, context: ErrorBoundaryContext) => void;
  onCriticalError?: (error: ClarityOkrError, context: ErrorBoundaryContext) => void;
}

/**
 * Normalize any error to ClarityOkrError
 */
export function normalizeError(error: unknown, context: ErrorBoundaryContext): ClarityOkrError {
  if (isClarityOkrError(error)) {
    return error as ClarityOkrError;
  }
  if (error instanceof Error) {
    return new ClarityOkrError(error.message, {
      cause: error,
      context: { originalName: error.name, ...context.metadata },
    });
  }
  return new ClarityOkrError(String(error), { context: context.metadata });
}
