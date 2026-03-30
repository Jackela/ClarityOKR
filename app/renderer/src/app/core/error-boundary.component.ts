/**
 * Error Boundary Component for Renderer Process (Angular)
 *
 * @module error-boundary.component
 * @filesource
 */

/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Component, Input } from '@angular/core';
import { ClarityOkrError, getRecoverySuggestion, isClarityOkrError } from '@clarityokr/contracts';

import { ErrorBoundaryService, RendererErrorContext } from './error-boundary.service.js';

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
