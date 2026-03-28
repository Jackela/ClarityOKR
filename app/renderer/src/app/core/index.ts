/**
 * Core Module Exports
 *
 * Centralized exports for core services and error handling.
 */

export { GlobalErrorHandler } from './error-handler.js';
export {
  ErrorBoundaryService,
  ErrorBoundaryComponent,
  EnhancedGlobalErrorHandler,
} from './error-boundary.service.js';
export type {
  RendererErrorContext,
  RendererErrorConfig,
  RendererErrorHandler,
} from './error-boundary.service.js';
