/**
 * Error Boundary for Renderer Process (Angular)
 *
 * Provides error boundary components and services for the Angular renderer.
 */

import { Component, ErrorHandler, Injectable, Input, NgZone, Optional } from '@angular/core';
import {
  ClarityOkrError,
  getErrorSeverity,
  getRecoverySuggestion,
  type ErrorCode,
  isClarityOkrError,
} from '@clarityokr/contracts';

import { Logger } from './services/logger.service.js';

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
interface ErrorReport {
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
    const clarityError = this.normalizeError(error, context);

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
   * Normalize any error to ClarityOkrError
   */
  private normalizeError(error: unknown, context: RendererErrorContext): ClarityOkrError {
    if (isClarityOkrError(error)) {
      return error;
    }

    if (error instanceof Error) {
      return new ClarityOkrError(error.message, {
        cause: error,
        context: {
          originalName: error.name,
          component: context.component,
          ...context.metadata,
        },
      });
    }

    return new ClarityOkrError(String(error), {
      context: {
        component: context.component,
        ...context.metadata,
      },
    });
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

/**
 * Error boundary component for catching child component errors
 *
 * @usage
 * ```html
 * <app-error-boundary
 *   [fallbackTemplate]="errorTemplate"
 *   (onError)="handleError($event)"
 * >
 *   <!-- Your components here -->
 * </app-error-boundary>
 *
 * <ng-template #errorTemplate let-error="error" let-recover="recover">
 *   <div class="error-fallback">
 *     <h3>Something went wrong</h3>
 *     <p>{{ error.message }}</p>
 *     <button (click)="recover()">Try Again</button>
 *   </div>
 * </ng-template>
 * ```
 */
@Component({
  selector: 'app-error-boundary',
  template: `
    @if (hasError) {
      @if (fallbackTemplate) {
        <ng-container
          *ngTemplateOutlet="fallbackTemplate; context: { $implicit: error, recover: recover }"
        ></ng-container>
      } @else {
        <div class="error-boundary-fallback">
          <div class="error-boundary-content">
            <h3>⚠️ Something went wrong</h3>
            <p>{{ error?.message }}</p>
            @if (recoverySuggestion) {
              <p class="recovery-suggestion">{{ recoverySuggestion }}</p>
            }
            <button (click)="recover()" class="retry-button">Try Again</button>
          </div>
        </div>
      }
    } @else {
      <ng-content></ng-content>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .error-boundary-fallback {
        padding: 20px;
        border: 2px solid #dc3545;
        border-radius: 8px;
        background: #fff5f5;
        text-align: center;
      }
      .error-boundary-content h3 {
        color: #dc3545;
        margin: 0 0 12px;
      }
      .error-boundary-content p {
        color: #666;
        margin: 0 0 16px;
      }
      .recovery-suggestion {
        font-style: italic;
        color: #888;
        font-size: 0.9em;
      }
      .retry-button {
        padding: 8px 16px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      .retry-button:hover {
        background: #c82333;
      }
    `,
  ],
})
export class ErrorBoundaryComponent {
  @Input() fallbackTemplate: unknown;
  @Input() onError?: (error: ClarityOkrError) => void;
  @Input() onRecover?: () => void;

  hasError = false;
  error: ClarityOkrError | null = null;
  recoverySuggestion: string | null = null;

  constructor(private errorService: ErrorBoundaryService) {}

  /**
   * Handle error from child components
   */
  handleError(error: unknown): void {
    this.hasError = true;

    if (isClarityOkrError(error)) {
      this.error = error;
    } else if (error instanceof Error) {
      this.error = new ClarityOkrError(error.message, { cause: error });
    } else {
      this.error = new ClarityOkrError(String(error));
    }

    this.recoverySuggestion = getRecoverySuggestion(this.error) ?? null;

    // Notify parent
    this.onError?.(this.error);

    // Log to service
    void this.errorService.handleError(error, {
      component: 'ErrorBoundaryComponent',
      operation: 'catchChildError',
    });
  }

  /**
   * Recover from error and retry
   */
  recover(): void {
    this.hasError = false;
    this.error = null;
    this.recoverySuggestion = null;
    this.onRecover?.();
  }
}

/**
 * Enhanced global error handler for Angular
 */
@Injectable()
export class EnhancedGlobalErrorHandler extends ErrorHandler {
  constructor(
    private errorService: ErrorBoundaryService,
    @Optional() private logger?: Logger,
  ) {
    super();
  }

  override handleError(error: Error): void {
    // Call parent handler for console output
    super.handleError(error);

    // Handle with our service
    void this.errorService.handleError(error, {
      component: 'Global',
      operation: 'unhandledError',
    });
  }
}
