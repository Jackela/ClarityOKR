import type { ErrorCode } from '@clarityokr/contracts';
import { isClarityOkrError, ClarityOkrError } from '@clarityokr/contracts';

/**
 * Error context for renderer operations
 */
export interface RendererErrorContext {
  /** Component where error occurred */
  component?: string;
  /** Operation being performed */
  operation: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error report for sending to main process
 */
export interface ErrorReport {
  error: ClarityOkrError;
  context: RendererErrorContext;
  timestamp: string;
  url: string;
  userAgent: string;
}

/**
 * Error handler function type
 */
export type RendererErrorHandler = (
  error: ClarityOkrError,
  context: RendererErrorContext,
) => void | Promise<void>;

/**
 * Configuration for renderer error handling
 */
export interface RendererErrorConfig {
  /** Whether to send errors to main process */
  sendToMain: boolean;
  /** Whether to show UI notifications */
  showNotifications: boolean;
  /** Custom error handlers by error code */
  customHandlers?: Partial<Record<ErrorCode, RendererErrorHandler>>;
  /** Callback when recovery suggestion is available */
  onRecoverySuggestion?: (suggestion: string) => void;
  /** Callback for critical errors */
  onCriticalError?: (error: ClarityOkrError, context: RendererErrorContext) => void;
}

/**
 * Default error configuration
 */
export const DEFAULT_ERROR_CONFIG: RendererErrorConfig = {
  sendToMain: true,
  showNotifications: true,
};

/**
 * Normalize any error to ClarityOkrError
 */
export function normalizeError(error: unknown, context: RendererErrorContext): ClarityOkrError {
  if (isClarityOkrError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new ClarityOkrError(error.message, {
      cause: error,
      context: { originalName: error.name, ...context.metadata },
    });
  }

  return new ClarityOkrError(String(error), { context: context.metadata });
}
