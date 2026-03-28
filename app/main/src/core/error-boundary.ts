/**
 * Error Boundary for Main Process
 *
 * Provides centralized error handling, logging, and recovery strategies
 * for the Electron main process.
 */

import {
  ClarityOkrError,
  getErrorSeverity,
  getRecoverySuggestion,
  type ErrorCode,
  ErrorCodes,
  isClarityOkrError,
} from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';

/**
 * Error boundary context for tracking where errors occurred
 */
export interface ErrorBoundaryContext {
  /** Component or module where error occurred */
  component: string;
  /** Operation being performed */
  operation: string;
  /** Additional context data */
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
  /** Whether to log all errors */
  logErrors: boolean;
  /** Whether to show error notifications */
  showNotifications: boolean;
  /** Custom error handlers by error code */
  customHandlers?: Partial<Record<ErrorCode, ErrorHandler>>;
  /** Recovery strategies by error code */
  recoveryStrategies?: Partial<Record<ErrorCode, RecoveryStrategy>>;
  /** Callback when recovery fails */
  onRecoveryFailed?: (error: ClarityOkrError, context: ErrorBoundaryContext) => void;
  /** Callback for critical errors */
  onCriticalError?: (error: ClarityOkrError, context: ErrorBoundaryContext) => void;
}

/**
 * Error boundary for main process operations
 *
 * @usage
 * ```typescript
 * const boundary = new MainErrorBoundary({
 *   logErrors: true,
 *   showNotifications: true,
 * });
 *
 * await boundary.guard(
 *   async () => {
 *     // Your operation here
 *   },
 *   { component: 'DatabaseService', operation: 'saveSession' }
 * );
 * ```
 */
export class MainErrorBoundary {
  private readonly config: ErrorBoundaryConfig;
  private readonly handledErrors: Set<string> = new Set();

  constructor(config: Partial<ErrorBoundaryConfig> = {}) {
    this.config = {
      logErrors: true,
      showNotifications: false,
      ...config,
    };
  }

  /**
   * Execute a function with error boundary protection
   *
   * @param fn - Function to execute
   * @param context - Context for error tracking
   * @returns Result of the function
   * @throws Error if recovery fails
   */
  async guard<T>(fn: () => Promise<T>, context: ErrorBoundaryContext): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      return await this.handleError(error, context);
    }
  }

  /**
   * Execute a synchronous function with error boundary protection
   *
   * @param fn - Synchronous function to execute
   * @param context - Context for error tracking
   * @returns Result of the function
   * @throws Error if recovery fails
   */
  guardSync<T>(fn: () => T, context: ErrorBoundaryContext): T {
    try {
      return fn();
    } catch (error) {
      // Convert to promise for consistent handling
      this.handleError(error, context).catch(() => {
        // Error already processed in handleError, just rethrow
      });
      throw error;
    }
  }

  /**
   * Handle an error with context
   *
   * @param error - The error to handle
   * @param context - Error context
   * @returns Never - always throws after handling
   */
  private async handleError(error: unknown, context: ErrorBoundaryContext): Promise<never> {
    // Normalize error to ClarityOkrError
    const clarityError = this.normalizeError(error, context);

    // Check if already handled (prevent duplicate handling)
    const errorKey = `${clarityError.code}:${clarityError.message}`;
    if (this.handledErrors.has(errorKey)) {
      throw clarityError;
    }
    this.handledErrors.add(errorKey);

    // Log the error
    if (this.config.logErrors) {
      this.logError(clarityError, context);
    }

    // Execute custom handler if available
    const customHandler = this.config.customHandlers?.[clarityError.code as ErrorCode];
    if (customHandler) {
      try {
        await customHandler(clarityError, context);
      } catch (handlerError) {
        Logger.error('[MainErrorBoundary] Custom handler failed:', handlerError);
      }
    }

    // Attempt recovery
    const recovered = await this.attemptRecovery(clarityError, context);
    if (!recovered) {
      this.config.onRecoveryFailed?.(clarityError, context);

      // For critical errors, trigger critical error handler
      const severity = getErrorSeverity(clarityError.code as ErrorCode);
      if (severity === 'CRITICAL') {
        this.config.onCriticalError?.(clarityError, context);
      }
    }

    // Clean up from handled set after a delay
    setTimeout(() => {
      this.handledErrors.delete(errorKey);
    }, 5000);

    throw clarityError;
  }

  /**
   * Normalize any error to ClarityOkrError
   */
  private normalizeError(error: unknown, context: ErrorBoundaryContext): ClarityOkrError {
    if (isClarityOkrError(error)) {
      return error;
    }

    if (error instanceof Error) {
      return new ClarityOkrError(error.message, {
        cause: error,
        context: {
          originalName: error.name,
          ...context.metadata,
        },
      });
    }

    return new ClarityOkrError(String(error), {
      context: context.metadata,
    });
  }

  /**
   * Log error with appropriate severity
   */
  private logError(error: ClarityOkrError, context: ErrorBoundaryContext): void {
    const severity = getErrorSeverity(error.code as ErrorCode);
    const logData = {
      component: context.component,
      operation: context.operation,
      error: error.toJSON(),
      suggestion: getRecoverySuggestion(error),
    };

    switch (severity) {
      case 'CRITICAL':
        Logger.error(`[MainErrorBoundary] CRITICAL error in ${context.component}:`, logData);
        break;
      case 'ERROR':
        Logger.error(`[MainErrorBoundary] Error in ${context.component}:`, logData);
        break;
      case 'WARNING':
        Logger.warn(`[MainErrorBoundary] Warning in ${context.component}:`, logData);
        break;
      case 'INFO':
        Logger.info(`[MainErrorBoundary] Info in ${context.component}:`, logData);
        break;
    }
  }

  /**
   * Attempt to recover from error
   */
  private async attemptRecovery(
    error: ClarityOkrError,
    context: ErrorBoundaryContext,
  ): Promise<boolean> {
    const strategy = this.config.recoveryStrategies?.[error.code as ErrorCode];

    if (strategy) {
      try {
        Logger.info(`[MainErrorBoundary] Attempting recovery for ${error.code}`);
        return await strategy(error, context);
      } catch (recoveryError) {
        Logger.error('[MainErrorBoundary] Recovery strategy failed:', recoveryError);
        return false;
      }
    }

    // Default recovery suggestions
    const suggestion = getRecoverySuggestion(error);
    if (suggestion) {
      Logger.info(`[MainErrorBoundary] Recovery suggestion: ${suggestion}`);
    }

    return false;
  }

  /**
   * Create a bound guard function for a specific component
   *
   * @param component - Component name
   * @returns Bound guard function
   */
  forComponent(component: string) {
    return {
      guard: <T>(fn: () => Promise<T>, operation: string, metadata?: Record<string, unknown>) =>
        this.guard(fn, { component, operation, metadata }),
      guardSync: <T>(fn: () => T, operation: string, metadata?: Record<string, unknown>) =>
        this.guardSync(fn, { component, operation, metadata }),
    };
  }
}

/**
 * Singleton instance for global error boundary
 */
let globalErrorBoundary: MainErrorBoundary | null = null;

/**
 * Get or create the global error boundary
 */
export function getGlobalErrorBoundary(config?: Partial<ErrorBoundaryConfig>): MainErrorBoundary {
  if (!globalErrorBoundary) {
    globalErrorBoundary = new MainErrorBoundary(config);
  }
  return globalErrorBoundary;
}

/**
 * Reset the global error boundary (useful for testing)
 */
export function resetGlobalErrorBoundary(): void {
  globalErrorBoundary = null;
}

/**
 * Guard a function with the global error boundary
 *
 * @param fn - Function to execute
 * @param context - Error context
 * @returns Function result
 */
export async function withErrorBoundary<T>(
  fn: () => Promise<T>,
  context: ErrorBoundaryContext,
): Promise<T> {
  return getGlobalErrorBoundary().guard(fn, context);
}

/**
 * Guard a synchronous function with the global error boundary
 *
 * @param fn - Synchronous function to execute
 * @param context - Error context
 * @returns Function result
 */
export function withErrorBoundarySync<T>(fn: () => T, context: ErrorBoundaryContext): T {
  return getGlobalErrorBoundary().guardSync(fn, context);
}

// =============================================================================
// Predefined Recovery Strategies
// =============================================================================

/**
 * Recovery strategy: Retry with exponential backoff
 */
export function createRetryStrategy(maxAttempts = 3, baseDelayMs = 1000): RecoveryStrategy {
  return async (error, context) => {
    const attempts = (context.metadata?.retryCount as number) ?? 0;

    if (attempts >= maxAttempts) {
      return false;
    }

    const delay = baseDelayMs * Math.pow(2, attempts);
    Logger.info(
      `[RecoveryStrategy] Retrying after ${delay}ms (attempt ${attempts + 1}/${maxAttempts})`,
    );

    await new Promise((resolve) => setTimeout(resolve, delay));
    return true;
  };
}

/**
 * Recovery strategy: Fallback to default value
 */
export function createFallbackStrategy<T>(fallbackValue: T): RecoveryStrategy {
  return async () => {
    Logger.info('[RecoveryStrategy] Using fallback value');
    // Note: This doesn't actually return the value, just signals success
    // The caller needs to handle the fallback value
    return true;
  };
}

/**
 * Recovery strategy: Circuit breaker reset
 */
export function createCircuitBreakerResetStrategy(
  resetFn: () => void | Promise<void>,
): RecoveryStrategy {
  return async () => {
    try {
      Logger.info('[RecoveryStrategy] Resetting circuit breaker');
      await resetFn();
      return true;
    } catch {
      return false;
    }
  };
}
