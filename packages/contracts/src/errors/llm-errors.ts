/**
 * LLM Errors
 *
 * Errors related to LLM API calls, circuit breaker, and retry operations.
 */

import { ClarityOkrError, type ClarityOkrErrorOptions } from './base.js';

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
