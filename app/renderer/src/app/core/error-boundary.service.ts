/**
 * Error Boundary Service for Renderer Process (Angular)
 *
 * Provides centralized error handling for the Angular renderer with features for
 * error reporting, severity-based handling, and recovery suggestions. The service
 * prevents duplicate error processing, sends reports to the main process, and
 * executes custom error handlers when configured.
 *
 * Key Responsibilities:
 * - Wrap functions with error boundary protection (async and sync)
 * - Normalize errors into standardized ClarityOkrError format
 * - Prevent duplicate error handling within a time window
 * - Send error reports to the main process via IPC
 * - Execute severity-appropriate logging and recovery actions
 * - Provide component-scoped error handling helpers
 *
 * Error Handling Patterns:
 * - Critical errors trigger onCriticalError callbacks
 * - Duplicate errors (same code + message + operation) are suppressed for 5 seconds
 * - Recovery suggestions are displayed when available
 * - Custom handlers can be registered for specific error codes
 *
 * Dependencies:
 * - Logger: For severity-based logging
 * - NgZone: For running error handlers outside Angular's change detection
 * - @clarityokr/contracts: For error types and severity functions
 *
 * @module core/error-boundary.service
 *
 * @example
 * ```typescript
 * // In a component
 * @Component({...})
 * export class MyComponent {
 *   constructor(private errorService: ErrorBoundaryService) {}
 *
 *   async doSomething() {
 *     await this.errorService.guard(
 *       async () => {
 *         // Your async operation
 *         const result = await this.api.fetchData();
 *         return result;
 *       },
 *       { operation: 'fetchData', component: 'MyComponent' }
 *     );
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Using component-scoped helper
 * @Component({...})
 * export class MyComponent {
 *   private errorGuard = inject(ErrorBoundaryService).forComponent('MyComponent');
 *
 *   async handleUserAction() {
 *     await this.errorGuard.guard(
 *       () => this.processAction(),
 *       'processAction',
 *       { userId: this.currentUser.id }
 *     );
 *   }
 * }
 * ```
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
 * Enhanced error service for Angular renderer.
 *
 * This service wraps Angular's error handling with additional features:
 * - Duplicate error prevention (5-second window)
 * - Automatic error reporting to the main process
 * - Severity-based logging and handling
 * - Recovery suggestion display
 * - Critical error escalation
 *
 * The service works with the Logger for output and NgZone to manage
 * change detection during error handling.
 *
 * @example
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
   * Execute a function with error boundary protection (async).
   *
   * Wraps an async function with try-catch logic and automatically routes any
   * caught errors through the centralized error handling pipeline. Returns the
   * function result on success, or undefined if an error occurred.
   *
   * This is the primary method for adding error protection to async operations.
   *
   * @param fn - The async function to execute with protection
   * @param context - Context information for error reporting (operation name, component, metadata)
   * @returns Promise resolving to the function result, or undefined if an error was caught
   *
   * @example
   * ```typescript
   * const result = await errorService.guard(
   *   async () => {
   *     const data = await api.fetchUserData(userId);
   *     return data;
   *   },
   *   {
   *     operation: 'fetchUserData',
   *     component: 'UserProfileComponent',
   *     metadata: { userId }
   *   }
   * );
   *
   * if (result === undefined) {
   *   // Error was handled - check logs or UI for details
   * } else {
   *   // Use the result
   * }
   * ```
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
   * Execute a synchronous function with error boundary protection.
   *
   * Wraps a sync function with try-catch logic. Uses NgZone.runOutsideAngular
   * to prevent triggering change detection during error handling, which helps
   * avoid cascading errors and improves performance.
   *
   * Use this for synchronous operations that need error protection without
   * triggering Angular's change detection cycle.
   *
   * @param fn - The synchronous function to execute with protection
   * @param context - Context information for error reporting (operation name, component, metadata)
   * @returns The function result, or undefined if an error was caught
   *
   * @example
   * ```typescript
   * const result = errorService.guardSync(
   *   () => {
   *     // Synchronous operation
   *     return JSON.parse(jsonString);
   *   },
   *   {
   *     operation: 'parseJson',
   *     component: 'DataViewerComponent',
   *     metadata: { source: 'user-input' }
   *   }
   * );
   * ```
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
   * Handle an error with full context and routing.
   *
   * This is the core error handling method that processes all errors. It:
   * 1. Normalizes the error into a ClarityOkrError
   * 2. Prevents duplicate handling (5-second deduplication window)
   * 3. Logs the error with appropriate severity
   * 4. Executes any custom handler registered for this error code
   * 5. Sends the error report to the main process via IPC
   * 6. Triggers recovery suggestions if available
   * 7. Escalates critical errors to the onCriticalError callback
   *
   * Use this method when you need to handle an error directly rather than
   * wrapping a function with guard/guardSync.
   *
   * @param error - The error to handle (Error object, string, or unknown)
   * @param context - Context information for error reporting
   * @returns Promise resolving to the normalized ClarityOkrError
   *
   * @example
   * ```typescript
   * try {
   *   await riskyOperation();
   * } catch (error) {
   *   await errorService.handleError(error, {
   *     operation: 'riskyOperation',
   *     component: 'MyComponent',
   *     metadata: { input: userInput }
   *   });
   * }
   * ```
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
   * Create a component-scoped error handling helper.
   *
   * Returns a pre-bound object with guard, guardSync, and handle methods
   * that automatically include the component name in the error context.
   * This reduces boilerplate when the same component handles multiple operations.
   *
   * @param componentName - The name of the component (used in all error contexts)
   * @returns Object with bound guard, guardSync, and handle methods
   *
   * @example
   * ```typescript
   * @Component({...})
   * export class WizardComponent {
   *   private errorGuard = inject(ErrorBoundaryService).forComponent('WizardComponent');
   *
   *   async loadData() {
   *     await this.errorGuard.guard(
   *       () => this.api.fetchData(),
   *       'loadData'
   *     );
   *   }
   *
   *   async saveData() {
   *     await this.errorGuard.guard(
   *       () => this.api.save(),
   *       'saveData',
   *       { timestamp: Date.now() }
   *     );
   *   }
   *
   *   handleManualError(error: unknown) {
   *     this.errorGuard.handle(error, 'manualValidation');
   *   }
   * }
   * ```
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
