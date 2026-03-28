/**
 * Custom Error Classes
 *
 * Domain-specific error hierarchy for unified error handling across
 * main process, renderer, and contracts packages.
 */

/**
 * Base error options interface
 */
export interface ClarityOkrErrorOptions {
  /** Error code for programmatic handling */
  code?: string;
  /** HTTP-style status code (if applicable) */
  statusCode?: number;
  /** Additional context for debugging */
  context?: Record<string, unknown>;
  /** Original error that caused this error */
  cause?: Error;
}

/**
 * Base error class for all ClarityOKR errors.
 * Provides structured error information with error codes and context.
 */
export class ClarityOkrError extends Error {
  override name = this.constructor.name;
  /** Error code for programmatic handling */
  readonly code: string;
  /** HTTP-style status code (if applicable) */
  readonly statusCode?: number;
  /** Additional context for debugging */
  readonly context?: Record<string, unknown>;
  /** Original error that caused this error */
  declare readonly cause: Error | undefined;
  /** Timestamp when the error occurred */
  readonly timestamp: string;

  constructor(message: string, options: ClarityOkrErrorOptions = {}) {
    super(message);
    this.code = options.code ?? 'CLARITY_OKR_ERROR';
    this.statusCode = options.statusCode;
    this.context = options.context;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to a plain object for serialization (IPC, logging, etc.)
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * Create a user-friendly error message
   */
  toUserMessage(): string {
    return this.message;
  }
}

// =============================================================================
// Domain-Specific Error Classes
// =============================================================================

/**
 * Error related to IPC communication between main and renderer processes
 */
export class IpcError extends ClarityOkrError {
  constructor(message: string, options: ClarityOkrErrorOptions & { channel?: string } = {}) {
    const { channel, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'IPC_ERROR',
      statusCode: options.statusCode ?? 500,
      context: {
        ...options.context,
        channel,
      },
    });
  }
}

/**
 * Error related to LLM API calls
 */
export class LlmError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      provider?: string;
      model?: string;
      isRetryable?: boolean;
    } = {},
  ) {
    const { provider, model, isRetryable, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'LLM_ERROR',
      statusCode: options.statusCode ?? 502,
      context: {
        ...options.context,
        provider,
        model,
        isRetryable: isRetryable ?? true,
      },
    });
  }

  /**
   * Check if this error is retryable
   */
  isRetryable(): boolean {
    return (this.context?.isRetryable as boolean) ?? true;
  }
}

/**
 * Error related to database operations
 */
export class DatabaseError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      operation?: string;
      table?: string;
    } = {},
  ) {
    const { operation, table, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'DATABASE_ERROR',
      statusCode: options.statusCode ?? 500,
      context: {
        ...options.context,
        operation,
        table,
      },
    });
  }
}

/**
 * Error related to validation failures
 */
export class ValidationError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      field?: string;
      value?: unknown;
      schema?: string;
    } = {},
  ) {
    const { field, value, schema, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'VALIDATION_ERROR',
      statusCode: options.statusCode ?? 400,
      context: {
        ...options.context,
        field,
        value,
        schema,
      },
    });
  }
}

/**
 * Error related to clarification session operations
 */
export class ClarificationError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      sessionId?: string;
      step?: string;
    } = {},
  ) {
    const { sessionId, step, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'CLARIFICATION_ERROR',
      statusCode: options.statusCode ?? 400,
      context: {
        ...options.context,
        sessionId,
        step,
      },
    });
  }
}

/**
 * Error related to state machine operations
 */
export class StateMachineError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      currentState?: string;
      targetState?: string;
      event?: string;
    } = {},
  ) {
    const { currentState, targetState, event, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'STATE_MACHINE_ERROR',
      statusCode: options.statusCode ?? 409,
      context: {
        ...options.context,
        currentState,
        targetState,
        event,
      },
    });
  }
}

/**
 * Error related to encryption/security operations
 */
export class SecurityError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      operation?: string;
    } = {},
  ) {
    const { operation, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'SECURITY_ERROR',
      statusCode: options.statusCode ?? 403,
      context: {
        ...options.context,
        operation,
      },
    });
  }
}

/**
 * Error related to circuit breaker operations
 */
export class CircuitBreakerError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      state?: 'OPEN' | 'HALF_OPEN' | 'CLOSED';
    } = {},
  ) {
    const { state, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'CIRCUIT_BREAKER_ERROR',
      statusCode: options.statusCode ?? 503,
      context: {
        ...options.context,
        circuitState: state,
      },
    });
  }
}

/**
 * Error related to retry exhaustion
 */
export class RetryExhaustedError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      attempts: number;
      lastError?: Error;
    },
  ) {
    const { attempts, lastError, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'RETRY_EXHAUSTED',
      statusCode: options.statusCode ?? 504,
      context: {
        ...options.context,
        attempts,
      },
      cause: lastError,
    });
  }
}

/**
 * Error related to window operations
 */
export class WindowError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      windowType?: string;
      windowId?: number;
    } = {},
  ) {
    const { windowType, windowId, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'WINDOW_ERROR',
      statusCode: options.statusCode ?? 500,
      context: {
        ...options.context,
        windowType,
        windowId,
      },
    });
  }
}

/**
 * Error related to persistence operations
 */
export class PersistenceError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      operation?: string;
      entity?: string;
    } = {},
  ) {
    const { operation, entity, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'PERSISTENCE_ERROR',
      statusCode: options.statusCode ?? 500,
      context: {
        ...options.context,
        operation,
        entity,
      },
    });
  }
}

// =============================================================================
// Error Type Guards
// =============================================================================

/**
 * Type guard to check if an error is a ClarityOkrError
 */
export function isClarityOkrError(error: unknown): error is ClarityOkrError {
  return error instanceof ClarityOkrError;
}

/**
 * Type guard to check if an error is a specific ClarityOkrError subclass
 */
export function isErrorOfType<T extends ClarityOkrError>(
  error: unknown,
  ErrorClass: new (...args: unknown[]) => T,
): error is T {
  return error instanceof ErrorClass;
}

/**
 * Extract error code from any error
 */
export function getErrorCode(error: unknown): string {
  if (isClarityOkrError(error)) {
    return error.code;
  }
  if (error instanceof Error) {
    return error.name.toUpperCase().replace(/ERROR$/, '') + '_ERROR';
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Extract user-friendly message from any error
 */
export function getErrorMessage(error: unknown): string {
  if (isClarityOkrError(error)) {
    return error.toUserMessage();
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// =============================================================================
// Error Codes Registry
// =============================================================================

/**
 * Registry of all error codes for documentation and programmatic handling
 */
export const ErrorCodes = {
  // Base
  CLARITY_OKR_ERROR: 'CLARITY_OKR_ERROR',

  // Domain-specific
  IPC_ERROR: 'IPC_ERROR',
  LLM_ERROR: 'LLM_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CLARIFICATION_ERROR: 'CLARIFICATION_ERROR',
  STATE_MACHINE_ERROR: 'STATE_MACHINE_ERROR',
  SECURITY_ERROR: 'SECURITY_ERROR',
  CIRCUIT_BREAKER_ERROR: 'CIRCUIT_BREAKER_ERROR',
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
  WINDOW_ERROR: 'WINDOW_ERROR',
  PERSISTENCE_ERROR: 'PERSISTENCE_ERROR',
} as const;

/** Type of all valid error codes */
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// =============================================================================
// Error Severity Levels
// =============================================================================

/**
 * Error severity levels for categorizing and handling errors appropriately
 */
export type ErrorSeverity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';

/**
 * Get the severity level for an error code
 */
export function getErrorSeverity(code: ErrorCode): ErrorSeverity {
  const severityMap: Record<ErrorCode, ErrorSeverity> = {
    CLARITY_OKR_ERROR: 'ERROR',
    IPC_ERROR: 'ERROR',
    LLM_ERROR: 'WARNING',
    DATABASE_ERROR: 'CRITICAL',
    VALIDATION_ERROR: 'WARNING',
    CLARIFICATION_ERROR: 'WARNING',
    STATE_MACHINE_ERROR: 'ERROR',
    SECURITY_ERROR: 'CRITICAL',
    CIRCUIT_BREAKER_ERROR: 'WARNING',
    RETRY_EXHAUSTED: 'ERROR',
    WINDOW_ERROR: 'WARNING',
    PERSISTENCE_ERROR: 'ERROR',
  };
  return severityMap[code] ?? 'ERROR';
}

// =============================================================================
// Error Recovery Suggestions
// =============================================================================

/**
 * Get recovery suggestion for an error
 */
export function getRecoverySuggestion(error: unknown): string | undefined {
  if (!isClarityOkrError(error)) {
    return 'An unexpected error occurred. Please try again or contact support.';
  }

  const suggestions: Record<ErrorCode, string | undefined> = {
    CLARITY_OKR_ERROR: 'Please try again. If the problem persists, restart the application.',
    IPC_ERROR: 'The communication between processes failed. Try refreshing the window.',
    LLM_ERROR: 'The AI service is temporarily unavailable. Your progress has been saved.',
    DATABASE_ERROR: 'Data access failed. Please restart the application and try again.',
    VALIDATION_ERROR: 'Please check your input and try again.',
    CLARIFICATION_ERROR: 'Your session may have expired. Please start a new clarification.',
    STATE_MACHINE_ERROR: 'Invalid state transition detected. Please restart the current task.',
    SECURITY_ERROR: 'Security check failed. Please ensure you have proper permissions.',
    CIRCUIT_BREAKER_ERROR:
      'Service is temporarily unavailable. Please wait a moment and try again.',
    RETRY_EXHAUSTED: 'Multiple attempts failed. Please check your connection and try again.',
    WINDOW_ERROR: 'Window operation failed. Please try again or restart the application.',
    PERSISTENCE_ERROR: 'Save operation failed. Please check available storage space.',
  };

  return suggestions[error.code as ErrorCode];
}
