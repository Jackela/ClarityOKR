/**
 * Error Boundary Service for Renderer Process (Angular)
 *
 * @module error-boundary.service
 * @filesource
 */

/* eslint-disable @typescript-eslint/consistent-type-imports */
import { type NgZone } from '@angular/core';
import { Injectable } from '@angular/core';
import {
  ClarityOkrError,
  getErrorSeverity,
  getRecoverySuggestion,
  type ErrorCode,
} from '@clarityokr/contracts';

import { Logger } from './services/logger.service.js';
import {
  normalizeError,
  RendererErrorContext,
  type ErrorReport,
  type RendererErrorConfig,
} from './error-boundary.types.js';

// Re-export types for backwards compatibility
export type {
  RendererErrorContext,
  ErrorReport,
  RendererErrorConfig,
} from './error-boundary.types.js';
export { DEFAULT_ERROR_CONFIG } from './error-boundary.types.js';
export { normalizeError } from './error-boundary.types.js';

/**
 * Enhanced error service for Angular renderer
 *
 * @usage
 * ```typescript
 * @Component({...})
 * export class MyComponent {
 *   constructor(private errorService: ErrorBoundaryService) {}
 *
 *   async doSomething() {
 *     await this.errorService.guard(
 *       async () => {
 *         // Your async operation
 *       },
 *       { operation: 'doSomething' }
 *     );
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ErrorBoundaryService {
  private readonly config: RendererErrorConfig;
  private readonly handledErrors = new Set<string>();

  constructor(
    private logger: Logger,
    private ngZone: NgZone,
  ) {
    this.config = {
      sendToMain: true,
      showNotifications: true,
    };
  }

  /**
   * Execute a function with error boundary protection
   */
  async guard<T>(fn: () => Promise<T>, context: RendererErrorContext): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      await this.handleError(error, context);
      return undefined;
    }
  }

  /**
   * Execute a synchronous function with error boundary protection
   */
  guardSync<T>(fn: () => T, context: RendererErrorContext): T | undefined {
    try {
      return fn();
    } catch (error) {
      // Use ngZone.runOutsideAngular to prevent triggering change detection
      this.ngZone.runOutsideAngular(() => {
        this.handleError(error, context).catch(() => {
          // Error already processed
        });
      });
      return undefined;
    }
  }

  /**
   * Handle an error with context
   */
  async handleError(error: unknown, context: RendererErrorContext): Promise<ClarityOkrError> {
    const clarityError = normalizeError(error, context);

    // Prevent duplicate handling
    const errorKey = `${clarityError.code}:${clarityError.message}:${context.operation}`;
    if (this.handledErrors.has(errorKey)) {
      return clarityError;
    }
    this.handledErrors.add(errorKey);

    // Log the error
    this.logError(clarityError, context);

    // Execute custom handler if available
    const customHandler = this.config.customHandlers?.[clarityError.code as ErrorCode];
    if (customHandler) {
      try {
        await customHandler(clarityError, context);
      } catch (handlerError) {
        this.logger.error('Custom error handler failed:', handlerError);
      }
    }

    // Send to main process
    if (this.config.sendToMain) {
      await this.sendToMainProcess(clarityError, context);
    }

    // Show recovery suggestion
    const suggestion = getRecoverySuggestion(clarityError);
    if (suggestion && this.config.onRecoverySuggestion) {
      this.ngZone.run(() => {
        this.config.onRecoverySuggestion!(suggestion);
      });
    }

    // Handle critical errors
    const severity = getErrorSeverity(clarityError.code as ErrorCode);
    if (severity === 'CRITICAL' && this.config.onCriticalError) {
      this.ngZone.run(() => {
        this.config.onCriticalError!(clarityError, context);
      });
    }

    // Clean up after delay
    setTimeout(() => {
      this.handledErrors.delete(errorKey);
    }, 5000);

    return clarityError;
  }

  /**
   * Log error with appropriate severity
   */
  private logError(error: ClarityOkrError, context: RendererErrorContext): void {
    const severity = getErrorSeverity(error.code as ErrorCode);
    const message = `[${context.component ?? 'Unknown'}] ${context.operation}: ${error.message}`;

    switch (severity) {
      case 'CRITICAL':
        this.logger.error('CRITICAL:', message, error.toJSON());
        break;
      case 'ERROR':
        this.logger.error(message, error.toJSON());
        break;
      case 'WARNING':
        this.logger.warn(message, error.toJSON());
        break;
      case 'INFO':
        this.logger.info(message, error.toJSON());
        break;
    }
  }

  /**
   * Send error report to main process
   */
  private async sendToMainProcess(
    error: ClarityOkrError,
    context: RendererErrorContext,
  ): Promise<void> {
    try {
      const bridge = (
        window as { clarifyOkr?: { send?: (channel: string, payload: unknown) => void } }
      ).clarifyOkr;

      if (bridge?.send) {
        const report: ErrorReport = {
          error,
          context,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          userAgent: navigator.userAgent,
        };
        bridge.send('clarityokr:error:report', report);
      }
    } catch (e) {
      this.logger.warn('Failed to send error report to main process:', e);
    }
  }

  /**
   * Create a bound guard function for a specific component
   */
  forComponent(componentName: string) {
    return {
      guard: <T>(fn: () => Promise<T>, operation: string, metadata?: Record<string, unknown>) =>
        this.guard(fn, { component: componentName, operation, metadata }),
      guardSync: <T>(fn: () => T, operation: string, metadata?: Record<string, unknown>) =>
        this.guardSync(fn, { component: componentName, operation, metadata }),
      handle: (error: unknown, operation: string, metadata?: Record<string, unknown>) =>
        this.handleError(error, { component: componentName, operation, metadata }),
    };
  }
}
