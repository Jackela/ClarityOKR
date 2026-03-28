/**
 * Types and interfaces for OkrAgentService
 */
import type { CacheStats } from './llm-cache.service.js';
import type { CircuitBreakerMetrics } from './llm-circuit-breaker.service.js';

/** Context object containing the history of clarification turns */
export interface ClarificationContext {
  /** Array of question-answer pairs from the clarification session */
  turns: Array<{ questionId: string; optionId: string; timestamp: string }>;
}

/** Represents the user's most recent selection in the clarification flow */
export interface LastChoice {
  questionId: string;
  optionId: string;
}

/** Performance metrics for monitoring the OKR agent service */
export interface PerformanceMetrics {
  /** Cache statistics including hit rate, size, and memory usage */
  cache: CacheStats;
  /** Circuit breaker metrics including failure rate and state */
  circuitBreaker: CircuitBreakerMetrics;
}
