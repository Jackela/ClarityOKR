import type { ClarityOkrError } from '@clarityokr/contracts';
import { getErrorSeverity, getRecoverySuggestion, type ErrorCode } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { ErrorBoundaryConfig, ErrorBoundaryContext } from './error-boundary.types.js';
import { normalizeError } from './error-boundary.types.js';

export class MainErrorBoundary {
  private readonly config: ErrorBoundaryConfig;
  private readonly handledErrors = new Set<string>();

  constructor(config: Partial<ErrorBoundaryConfig> = {}) {
    this.config = {
      logErrors: true,
      showNotifications: false,
      ...config,
    };
  }

  async guard<T>(fn: () => Promise<T>, context: ErrorBoundaryContext): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      return await this.handleError(error, context);
    }
  }

  guardSync<T>(fn: () => T, context: ErrorBoundaryContext): T {
    try {
      return fn();
    } catch (error) {
      this.handleError(error, context).catch(() => {
        // Error already processed in handleError, just rethrow
      });
      throw error;
    }
  }

  private async handleError(error: unknown, context: ErrorBoundaryContext): Promise<never> {
    const clarityError = normalizeError(error, context);

    const errorKey = `${clarityError.code}:${clarityError.message}`;
    if (this.handledErrors.has(errorKey)) {
      throw clarityError;
    }
    this.handledErrors.add(errorKey);

    if (this.config.logErrors) {
      this.logError(clarityError, context);
    }

    const customHandler = this.config.customHandlers?.[clarityError.code as ErrorCode];
    if (customHandler) {
      try {
        await customHandler(clarityError, context);
      } catch (handlerError) {
        Logger.error('[MainErrorBoundary] Custom handler failed:', handlerError);
      }
    }

    const recovered = await this.attemptRecovery(clarityError, context);
    if (!recovered) {
      this.config.onRecoveryFailed?.(clarityError, context);

      const severity = getErrorSeverity(clarityError.code as ErrorCode);
      if (severity === 'CRITICAL') {
        this.config.onCriticalError?.(clarityError, context);
      }
    }

    setTimeout(() => {
      this.handledErrors.delete(errorKey);
    }, 5000);

    throw clarityError;
  }

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

    const suggestion = getRecoverySuggestion(error);
    if (suggestion) {
      Logger.info(`[MainErrorBoundary] Recovery suggestion: ${suggestion}`);
    }

    return false;
  }

  forComponent(component: string) {
    return {
      guard: <T>(fn: () => Promise<T>, operation: string, metadata?: Record<string, unknown>) =>
        this.guard(fn, { component, operation, metadata }),
      guardSync: <T>(fn: () => T, operation: string, metadata?: Record<string, unknown>) =>
        this.guardSync(fn, { component, operation, metadata }),
    };
  }
}
