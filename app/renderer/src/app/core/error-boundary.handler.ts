/**
 * Enhanced Global Error Handler for Renderer Process (Angular)
 *
 * @module error-boundary.handler
 * @filesource
 */

/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ErrorHandler, Injectable, Optional } from '@angular/core';

import { ErrorBoundaryService } from './error-boundary.service.js';
import { Logger } from './services/logger.service.js';

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
