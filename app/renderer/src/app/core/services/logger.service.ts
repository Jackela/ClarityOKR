import { Injectable } from '@angular/core';

/**
 * Log levels for the logger service.
 *
 * Controls which log messages are output based on severity.
 * Lower levels include all higher levels (e.g., DEBUG includes INFO, WARN, ERROR).
 *
 * @example
 * ```typescript
 * logger.setLevel(LogLevel.INFO); // Show INFO, WARN, and ERROR only
 * logger.debug('hidden');         // Not shown
 * logger.info('visible');         // Shown
 * ```
 */
export enum LogLevel {
  /** Most verbose level - for detailed debugging information */
  DEBUG = 0,
  /** General information messages - for normal operations */
  INFO = 1,
  /** Warning messages - for potential issues */
  WARN = 2,
  /** Error messages - for failures and exceptions */
  ERROR = 3,
}

/**
 * Logger Service - Centralized logging for the Angular renderer process.
 *
 * Provides a leveled logging system that filters messages based on the configured
 * log level. All log methods (debug, info, warn, error) accept multiple arguments
 * and only output when the current log level permits.
 *
 * Key Responsibilities:
 * - Filter log output based on configurable log level
 * - Provide consistent log formatting with level prefixes
 * - Support multiple arguments for rich log messages
 *
 * Dependencies:
 * - Angular Injectable for dependency injection
 *
 * @module core/services/logger
 *
 * @example
 * ```typescript
 * // In a component or service
 * constructor(private logger: Logger) {}
 *
 * // Debug logging (only shown when level is DEBUG)
 * this.logger.debug('Component initialized', { id: 123 });
 *
 * // Info logging
 * this.logger.info('User action completed', 'save', { duration: 150 });
 *
 * // Warning logging
 * this.logger.warn('Deprecated API used', endpoint);
 *
 * // Error logging
 * this.logger.error('Request failed', error);
 * ```
 */
@Injectable({ providedIn: 'root' })
export class Logger {
  private level = LogLevel.DEBUG;

  /**
   * Set the minimum log level for output.
   *
   * Messages at or above this level will be output to the console.
   * Messages below this level will be silently ignored.
   *
   * @param level - The minimum log level to display
   *
   * @example
   * ```typescript
   * // Only show warnings and errors in production
   * logger.setLevel(LogLevel.WARN);
   *
   * logger.debug('debug message'); // Not shown
   * logger.info('info message');   // Not shown
   * logger.warn('warning');        // Shown
   * logger.error('error');         // Shown
   * ```
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Log a debug message.
   *
   * Debug messages are the most verbose and are typically used during development
   * to trace execution flow, inspect variables, and diagnose issues.
   *
   * Only outputs when the log level is set to DEBUG or lower.
   *
   * @param args - Arguments to log (any type supported by console.log)
   *
   * @example
   * ```typescript
   * logger.debug('Entering method', methodName, params);
   * logger.debug('State updated:', { previous, current });
   * ```
   */
  debug(...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  }

  /**
   * Log an informational message.
   *
   * Info messages indicate normal application operation and milestones.
   * Use for logging significant events like component initialization,
   * user actions, or state transitions.
   *
   * Only outputs when the log level is set to INFO or lower.
   *
   * @param args - Arguments to log (any type supported by console.info)
   *
   * @example
   * ```typescript
   * logger.info('Application started');
   * logger.info('User logged in:', userId);
   * logger.info('Data loaded:', records.length, 'records');
   * ```
   */
  info(...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info('[INFO]', ...args);
    }
  }

  /**
   * Log a warning message.
   *
   * Warning messages indicate potential issues or unexpected conditions
   * that do not prevent the application from functioning but should be noted.
   * Use for deprecated APIs, recoverable errors, or suspicious behavior.
   *
   * Only outputs when the log level is set to WARN or lower.
   *
   * @param args - Arguments to log (any type supported by console.warn)
   *
   * @example
   * ```typescript
   * logger.warn('API response slower than expected:', duration, 'ms');
   * logger.warn('Deprecated feature used:', featureName);
   * logger.warn('Retry attempt:', attemptNumber);
   * ```
   */
  warn(...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn('[WARN]', ...args);
    }
  }

  /**
   * Log an error message.
   *
   * Error messages indicate failures, exceptions, or conditions that prevent
   * normal operation. These should always be addressed and typically represent
   * bugs or configuration issues.
   *
   * Only outputs when the log level is set to ERROR or lower.
   *
   * @param args - Arguments to log (any type supported by console.error)
   *
   * @example
   * ```typescript
   * logger.error('Failed to load configuration:', error);
   * logger.error('API request failed:', response.status, response.statusText);
   * logger.error('Unexpected state:', actual, 'expected:', expected);
   * ```
   */
  error(...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error('[ERROR]', ...args);
    }
  }
}
