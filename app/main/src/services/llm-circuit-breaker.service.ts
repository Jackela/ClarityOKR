import CircuitBreaker from 'opossum';

import { Logger } from '../core/logger.js';

/**
 * Circuit breaker states
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is open, requests fail fast
 * - HALF_OPEN: Testing if service has recovered
 */

/** Configuration options for the circuit breaker */
  failureThreshold?: number;
  resetTimeoutMs?: number;
  timeout?: number;
  errorThresholdPercentage?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
}

/** Performance metrics for the circuit breaker */
  state: CircuitState;
  failures: number;
  successes: number;
  rejects: number;
  opens: number;
  halfOpens: number;
  fireRate: number;
}

/**
 * LLM Circuit Breaker - Fault tolerance for LLM API calls
 *
 * Wraps LLM API calls with circuit breaker pattern to prevent
 * cascading failures when the LLM service is unavailable.
 *
 * When failure threshold is exceeded, the circuit opens and
 * subsequent calls fail fast without hitting the API.
 * After reset timeout, circuit enters half-open state to test recovery.
 */
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

    this.breaker = new CircuitBreaker(action, breakerOptions) as unknown as CircuitBreakerInstance;

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
   * Executes the wrapped action with circuit breaker protection.
   *
   * @param args - Arguments to pass to the wrapped function
   * @returns Promise resolving to the result of the action
   * @throws Error if circuit is open or action fails
   * @template T - Expected return type
   */
   * Execute the wrapped action with circuit breaker protection
   */
  async fire<T>(...args: unknown[]): Promise<T> {
    const result = await this.breaker.fire(...args);
    return result as unknown as T;
  }

  /**
   * Gets the current circuit state.
   *
   * @returns Current state: 'CLOSED', 'OPEN', or 'HALF_OPEN'
   */
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.breaker.opened ? 'OPEN' : this.breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED';
  }

  /**
   * Checks if the circuit is currently open.
   *
   * @returns True if circuit is open
   */
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.breaker.opened;
  }

  /**
   * Checks if the circuit is currently closed.
   *
   * @returns True if circuit is closed
   */
   * Check if circuit is closed
   */
  isClosed(): boolean {
    return !this.breaker.opened && !this.breaker.halfOpen;
  }

  /**
   * Manually opens the circuit.
   * Useful for testing or emergency shutdown.
   */
   * Manually open the circuit
   */
  open(): void {
    this.breaker.open();
  }

  /**
   * Manually closes the circuit.
   * Resets the circuit to normal operation.
   */
   * Manually close the circuit
   */
  close(): void {
    this.breaker.close();
  }

  /**
   * Gets circuit breaker metrics and statistics.
   *
   * @returns Metrics including state, failures, successes, and fire rate
   */
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
   * Gets the underlying CircuitBreaker instance for advanced use.
   *
   * @returns The underlying circuit breaker instance
   */
   * Get the underlying CircuitBreaker instance (for advanced use)
   */
  getBreaker(): CircuitBreakerInstance {
    return this.breaker;
  }

  /**
   * Sets a fallback function to be called when circuit is open.
   *
   * @param fallbackFunction - Function to call as fallback
   */
   * Set a fallback function to be called when circuit is open
   */
  fallback<T>(fallbackFunction: (...args: unknown[]) => T | Promise<T>): void {
    this.breaker.fallback(fallbackFunction);
  }
}
