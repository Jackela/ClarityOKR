import CircuitBreaker from 'opossum';

import { Logger } from '../core/logger.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  timeout?: number;
  errorThresholdPercentage?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  rejects: number;
  opens: number;
  halfOpens: number;
  fireRate: number;
}

// Type definition for CircuitBreaker instance
interface CircuitBreakerInstance {
  opened: boolean;
  halfOpen: boolean;
  stats: {
    failures: number;
    successes: number;
    rejects: number;
    opens: number;
    halfOpens?: number;
  };
  on(event: string, listener: (...args: unknown[]) => void): void;
  fire(...args: unknown[]): Promise<unknown>;
  open(): void;
  close(): void;
  fallback<T>(fn: (...args: unknown[]) => T | Promise<T>): void;
}

export class LlmCircuitBreaker {
  private readonly breaker: CircuitBreakerInstance;

  // Default configuration
  private static readonly DEFAULT_FAILURE_THRESHOLD = 5;
  private static readonly DEFAULT_RESET_TIMEOUT_MS = 30000; // 30 seconds
  private static readonly DEFAULT_TIMEOUT_MS = 5000; // 5 seconds

  constructor(
    action: (...args: unknown[]) => Promise<unknown>,
    options: CircuitBreakerOptions = {},
  ) {
    const breakerOptions = {
      failureThreshold: options.failureThreshold ?? LlmCircuitBreaker.DEFAULT_FAILURE_THRESHOLD,
      resetTimeout: options.resetTimeoutMs ?? LlmCircuitBreaker.DEFAULT_RESET_TIMEOUT_MS,
      timeout: options.timeout ?? LlmCircuitBreaker.DEFAULT_TIMEOUT_MS,
      errorThresholdPercentage: options.errorThresholdPercentage ?? 50,
      rollingCountTimeout: options.rollingCountTimeout ?? 10000,
      rollingCountBuckets: options.rollingCountBuckets ?? 10,
      name: 'llm-api-circuit-breaker',
    };

    this.breaker = new CircuitBreaker(action, breakerOptions) as CircuitBreakerInstance;

    // Event listeners for monitoring
    this.breaker.on('open', () => {
      Logger.warn('[LlmCircuitBreaker] Circuit breaker opened - LLM API calls will be rejected');
    });

    this.breaker.on('halfOpen', () => {
      Logger.info('[LlmCircuitBreaker] Circuit breaker half-open - testing LLM API recovery');
    });

    this.breaker.on('close', () => {
      Logger.info('[LlmCircuitBreaker] Circuit breaker closed - LLM API calls resumed');
    });

    this.breaker.on('fallback', (result) => {
      Logger.debug('[LlmCircuitBreaker] Circuit breaker fallback executed', { result });
    });

    Logger.info('[LlmCircuitBreaker] Circuit breaker initialized', breakerOptions);
  }

  /**
   * Execute the wrapped action with circuit breaker protection
   */
  async fire<T>(...args: unknown[]): Promise<T> {
    return this.breaker.fire(...args) as Promise<T>;
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.breaker.opened ? 'OPEN' : this.breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED';
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.breaker.opened;
  }

  /**
   * Check if circuit is closed
   */
  isClosed(): boolean {
    return !this.breaker.opened && !this.breaker.halfOpen;
  }

  /**
   * Manually open the circuit
   */
  open(): void {
    this.breaker.open();
  }

  /**
   * Manually close the circuit
   */
  close(): void {
    this.breaker.close();
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const stats = this.breaker.stats;
    const total = stats.failures + stats.successes + stats.rejects;

    return {
      state: this.getState(),
      failures: stats.failures,
      successes: stats.successes,
      rejects: stats.rejects,
      opens: stats.opens,
      halfOpens: stats.halfOpens ?? 0,
      fireRate: total > 0 ? stats.successes / total : 0,
    };
  }

  /**
   * Get the underlying CircuitBreaker instance (for advanced use)
   */
  getBreaker(): CircuitBreakerInstance {
    return this.breaker;
  }

  /**
   * Set a fallback function to be called when circuit is open
   */
  fallback<T>(fallbackFunction: (...args: unknown[]) => T | Promise<T>): void {
    this.breaker.fallback(fallbackFunction);
  }
}
