/**
 * Core Module Exports - Main Process
 *
 * Centralized exports for core services and error handling.
 */

export { Logger, LogLevel } from './logger.js';
export {
  MainErrorBoundary,
  getGlobalErrorBoundary,
  resetGlobalErrorBoundary,
  withErrorBoundary,
  withErrorBoundarySync,
  createRetryStrategy,
  createFallbackStrategy,
  createCircuitBreakerResetStrategy,
} from './error-boundary.js';
export type {
  ErrorBoundaryContext,
  ErrorBoundaryConfig,
  ErrorHandler,
  RecoveryStrategy,
} from './error-boundary.js';
