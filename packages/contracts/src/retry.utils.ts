import { ClarityOkrError } from './errors/index.js';

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

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffStrategy: 'exponential',
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: () => true,
  timeoutMs: 30000,
};

/**
 * Calculate delay with backoff strategy
 */
export function calculateDelay(config: RetryConfig, attempt: number): number {
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
    delay = delay * (0.75 + Math.random() * 0.5);
  }

  return Math.floor(delay);
}

/**
 * Sleep with abort signal support
 */
export function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
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

/**
 * Execute function with timeout
 */
export function executeWithTimeout<T>(
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
