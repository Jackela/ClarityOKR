/**
 * Retry Utilities with Advanced Strategies
 *
 * Provides retry logic with exponential backoff, jitter, circuit breaker integration,
 * and custom retry conditions for resilient operations.
 */

import {
  ClarityOkrError,
  RetryExhaustedError,
  CircuitBreakerError,
  isClarityOkrError,
} from './errors.js';

export type BackoffStrategy = 'fixed' | 'exponential' | 'linear' | 'decorrelated-jitter';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffStrategy: BackoffStrategy;
  backoffMultiplier: number;
  jitter: boolean;
  isRetryable: (error: unknown) => boolean;
  isValidResult?: <T>(result: T) => boolean;
  timeoutMs: number;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  onExhausted?: (lastError: unknown, attempts: number) => void;
  abortSignal?: AbortSignal;
}

export interface RetryContext {
  attempt: number;
  maxAttempts: number;
  previousErrors: unknown[];
  elapsedMs: number;
}

export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: unknown;
  attempts: number;
  elapsedMs: number;
  errors: unknown[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffStrategy: 'exponential',
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: () => true,
  timeoutMs: 30000,
};

export async function withRetry<T>(
  fn: (context: RetryContext) => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const errors: unknown[] = [];
  const startTime = Date.now();

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    if (fullConfig.abortSignal?.aborted) {
      throw new ClarityOkrError('Operation cancelled', {
        context: { reason: fullConfig.abortSignal.reason },
      });
    }

    const context: RetryContext = {
      attempt,
      maxAttempts: fullConfig.maxAttempts,
      previousErrors: [...errors],
      elapsedMs: Date.now() - startTime,
    };

    try {
      const result = await executeWithTimeout(
        () => fn(context),
        fullConfig.timeoutMs,
        fullConfig.abortSignal,
      );

      if (fullConfig.isValidResult && !fullConfig.isValidResult(result)) {
        const validationError = new ClarityOkrError('Result validation failed', {
          context: { attempt, result },
        });
        throw validationError;
      }

      return result;
    } catch (error) {
      errors.push(error);

      if (!fullConfig.isRetryable(error)) {
        throw error;
      }

      if (attempt >= fullConfig.maxAttempts) {
        break;
      }

      const delayMs = calculateDelay(fullConfig, attempt);
      fullConfig.onRetry?.(attempt, delayMs, error);
      await sleep(delayMs, fullConfig.abortSignal);
    }
  }

  const lastError = errors[errors.length - 1];
  fullConfig.onExhausted?.(lastError, fullConfig.maxAttempts);

  throw new RetryExhaustedError(`Operation failed after ${fullConfig.maxAttempts} attempts`, {
    attempts: fullConfig.maxAttempts,
    lastError: lastError instanceof Error ? lastError : undefined,
    context: {
      elapsedMs: Date.now() - startTime,
      errors: errors.map((e) => (e instanceof Error ? e.message : String(e))),
    },
  });
}

export async function withRetrySafe<T>(
  fn: (context: RetryContext) => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<RetryResult<T>> {
  const errors: unknown[] = [];
  const startTime = Date.now();

  try {
    const value = await withRetry(fn, config);
    return {
      success: true,
      value,
      attempts: 1,
      elapsedMs: Date.now() - startTime,
      errors,
    };
  } catch (error) {
    const retryError = error as RetryExhaustedError;
    return {
      success: false,
      error,
      attempts: (retryError.context?.attempts as number) ?? 1,
      elapsedMs: Date.now() - startTime,
      errors,
    };
  }
}

function calculateDelay(config: RetryConfig, attempt: number): number {
  let delay: number;

  switch (config.backoffStrategy) {
    case 'fixed':
      delay = config.initialDelayMs;
      break;

    case 'linear':
      delay = config.initialDelayMs * attempt;
      break;

    case 'exponential':
      delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
      break;

    case 'decorrelated-jitter': {
      const prevDelay =
        attempt === 1
          ? config.initialDelayMs
          : config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 2);
      delay = Math.random() * Math.min(config.maxDelayMs, prevDelay * 3);
      break;
    }

    default:
      delay = config.initialDelayMs;
  }

  delay = Math.min(delay, config.maxDelayMs);

  if (config.jitter) {
    delay = addJitter(delay);
  }

  return Math.floor(delay);
}

function addJitter(delay: number): number {
  const jitterFactor = 0.75 + Math.random() * 0.5;
  return delay * jitterFactor;
}

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new ClarityOkrError(`Operation timed out after ${timeoutMs}ms`, {
          code: 'TIMEOUT_ERROR',
        }),
      );
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(
        new ClarityOkrError('Operation cancelled', {
          code: 'ABORT_ERROR',
          context: { reason: abortSignal?.reason },
        }),
      );
    };

    abortSignal?.addEventListener('abort', onAbort);

    fn()
      .then((result) => {
        clearTimeout(timeoutId);
        abortSignal?.removeEventListener('abort', onAbort);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        abortSignal?.removeEventListener('abort', onAbort);
        reject(error);
      });
  });
}

function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);

    if (abortSignal) {
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(
          new ClarityOkrError('Sleep cancelled', {
            code: 'ABORT_ERROR',
            context: { reason: abortSignal.reason },
          }),
        );
      };

      abortSignal.addEventListener('abort', onAbort);
    }
  });
}

export const NETWORK_RETRY_CONFIG: Partial<RetryConfig> = {
  maxAttempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffStrategy: 'exponential',
  jitter: true,
  isRetryable: (error) => {
    if (isClarityOkrError(error)) {
      return ['LLM_ERROR', 'CIRCUIT_BREAKER_ERROR', 'TIMEOUT_ERROR'].includes(error.code);
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('etimedout')
      );
    }

    return false;
  },
};

export const DATABASE_RETRY_CONFIG: Partial<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffStrategy: 'fixed',
  jitter: false,
  isRetryable: (error) => {
    if (isClarityOkrError(error)) {
      return error.code === 'DATABASE_ERROR';
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('busy') ||
        message.includes('locked') ||
        message.includes('concurrent') ||
        message.includes('timeout')
      );
    }

    return false;
  },
};

export const CRITICAL_RETRY_CONFIG: Partial<RetryConfig> = {
  maxAttempts: 10,
  initialDelayMs: 500,
  maxDelayMs: 60000,
  backoffStrategy: 'exponential',
  jitter: true,
  isRetryable: () => true,
};

export function retryable(config: Partial<RetryConfig> = {}) {
  return function (_target: unknown, propertyKey: string, descriptor: PropertyDescriptor): void {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return withRetry(
        async () => {
          return originalMethod.apply(this, args);
        },
        {
          ...config,
          onRetry: (attempt, delay, error) => {
            console.warn(
              `[retryable] ${propertyKey} attempt ${attempt} failed, retrying in ${delay}ms:`,
              error,
            );
            config.onRetry?.(attempt, delay, error);
          },
        },
      );
    };
  };
}

export interface CircuitBreakerRetryOptions {
  circuitBreaker: {
    isOpen(): boolean;
    fire<T>(fn: () => Promise<T>): Promise<T>;
  };
  retryConfig?: Partial<RetryConfig>;
}

export async function withCircuitBreakerAndRetry<T>(
  fn: () => Promise<T>,
  options: CircuitBreakerRetryOptions,
): Promise<T> {
  const { circuitBreaker, retryConfig = {} } = options;

  if (circuitBreaker.isOpen()) {
    throw new CircuitBreakerError('Circuit breaker is open', {
      state: 'OPEN',
    });
  }

  return circuitBreaker.fire(async () => {
    return withRetry(async () => fn(), retryConfig);
  });
}

export async function retryOnce<T>(fn: () => Promise<T>, validate?: (x: T) => boolean): Promise<T> {
  return withRetry(
    async () => {
      const result = await fn();
      if (validate && !validate(result)) {
        throw new ClarityOkrError('Validation failed');
      }
      return result;
    },
    {
      maxAttempts: 2,
      backoffStrategy: 'fixed',
      initialDelayMs: 0,
      jitter: false,
    },
  );
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => void,
): Promise<T> {
  return withRetry(
    async () => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          setTimeout(() => {
            onTimeout?.();
            reject(new ClarityOkrError('Operation timed out', { code: 'TIMEOUT_ERROR' }));
          }, ms);
        }),
      ]);
    },
    { maxAttempts: 1, timeoutMs: ms * 2 },
  );
}
