/**
 * Core Module Exports
 *
 * Centralized exports for core services and error handling.
 */

export { GlobalErrorHandler } from './error-handler.js';
export { ErrorBoundaryService } from './error-boundary.service.js';
export { ErrorBoundaryComponent } from './error-boundary.component.js';
export { EnhancedGlobalErrorHandler } from './error-boundary.handler.js';
export type {
  RendererErrorContext,
  RendererErrorConfig,
  RendererErrorHandler,
  ErrorReport,
} from './error-boundary.types.js';
