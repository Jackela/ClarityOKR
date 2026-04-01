/**
 * OKR Agent Types
 *
 * Type definitions for the LLM integration module.
 *
 * @module services/okr-agent.types
 * @filesource
 */

import type { CacheStats } from './llm-cache.service.js';
import type { CircuitBreakerMetrics } from './llm-circuit-breaker.service.js';

/**
 * Context object containing the history of clarification turns.
 * Tracks user selections through the wizard flow.
 */
export interface ClarificationContext {
  /** Array of question-answer pairs from the clarification session */
  turns: Array<{ questionId: string; optionId: string; timestamp: string }>;
}

/**
 * Represents the user's most recent selection in the clarification flow.
 */
export interface LastChoice {
  questionId: string;
  optionId: string;
}

/**
 * Performance metrics for monitoring the OKR agent service.
 *
 * @example
 * ```typescript
 * const metrics = okrAgentService.getMetrics();
 * console.log(`Cache hit rate: ${metrics.cache.hitRate}`);
 * console.log(`Circuit state: ${metrics.circuitBreaker.state}`);
 * ```
 */
export interface PerformanceMetrics {
  /** Cache statistics including hit rate, size, and memory usage */
  cache: CacheStats;
  /** Circuit breaker metrics including failure rate and state */
  circuitBreaker: CircuitBreakerMetrics;
}
