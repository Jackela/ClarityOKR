import { Logger } from '../core/logger.js';
import type { RecoveryStrategy } from './error-boundary.types.js';

export function createRetryStrategy(maxAttempts = 3, baseDelayMs = 1000): RecoveryStrategy {
  return async (error, context) => {
    const attempts = (context.metadata?.retryCount as number) ?? 0;

    if (attempts >= maxAttempts) {
      return false;
    }

    const delay = baseDelayMs * Math.pow(2, attempts);
    Logger.info(
      `[RecoveryStrategy] Retrying after ${delay}ms (attempt ${attempts + 1}/${maxAttempts})`,
    );

    await new Promise((resolve) => setTimeout(resolve, delay));
    return true;
  };
}

export function createFallbackStrategy<T>(_fallbackValue: T): RecoveryStrategy {
  return async () => {
    Logger.info('[RecoveryStrategy] Using fallback value');
    return true;
  };
}

export function createCircuitBreakerResetStrategy(
  resetFn: () => void | Promise<void>,
): RecoveryStrategy {
  return async () => {
    try {
      Logger.info('[RecoveryStrategy] Resetting circuit breaker');
      await resetFn();
      return true;
    } catch {
      return false;
    }
  };
}
