/**
 * OKR Agent Service - LLM Integration Module
 *
 * This module provides secure, resilient communication with LLM providers for
 * the OKR clarification workflow. It handles prompt generation, response validation,
 * caching, and circuit breaker protection.
 *
 * Key Responsibilities:
 * - LLM API communication with configurable providers (OpenAI, custom endpoints)
 * - Response caching to reduce API costs and latency
 * - Circuit breaker pattern for fault tolerance during service outages
 * - Response validation using Zod schemas from shared contracts
 * - Performance metrics collection for monitoring
 *
 * Dependencies:
 * - @clarityokr/contracts: Zod schemas for response validation
 * - LlmCacheService: In-memory response caching
 * - LlmCircuitBreaker: Fault tolerance wrapper
 * - env.ts: LLM configuration (API key, base URL, model)
 *
 * @module services/okr-agent.service
 */
import { nextQuestionResponseSchema, okrDraftResponseSchema, LLMError } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import { getConfig } from '../config/app-config.js';
import { LlmCacheService } from './llm-cache.service.js';
import { LlmCircuitBreaker } from './llm-circuit-breaker.service.js';
import type { ClarificationContext, LastChoice, PerformanceMetrics } from './okr-agent.types.js';

/**
 * Service for interacting with LLM APIs to generate clarification questions and OKR drafts.
 *
 * This service implements multiple resilience patterns:
 * - Caching: Responses are cached to reduce API costs
 * - Circuit Breaker: Prevents cascading failures when LLM service is unavailable
 * - Validation: All responses are validated against Zod schemas
 *
 * All API keys and sensitive configuration remain in the main process;
 * this service never exposes secrets to the renderer.
 *
 * @example
 * ```typescript
 * const agent = new OkrAgentService();
 *
 * // Get next clarification question
 * const question = await agent.getNextQuestion(
 *   { turns: [...] },
 *   { questionId: 'q1', optionId: 'opt1' }
 * );
 *
 * // Generate OKR draft after clarification
 * const draft = await agent.generateDraft({ turns: [...] });
 * ```
 */
export class OkrAgentService {
  private readonly cfg = getConfig().llm;
  private readonly baseUrl = this.cfg.baseUrl;
  private readonly model = this.cfg.model;
  private readonly timeoutMs = this.cfg.timeoutMs;

  private readonly cache: LlmCacheService;
  private readonly circuitBreaker: LlmCircuitBreaker;

  /**
   * Creates a new OKR agent service instance.
   *
   * Initializes the cache and circuit breaker with default configuration.
   * Logs initialization for debugging purposes.
   */
  constructor() {
    this.cache = LlmCacheService.getInstance();

    // Initialize circuit breaker for LLM API calls
    this.circuitBreaker = new LlmCircuitBreaker(
      (...args: unknown[]) => {
        const [path, body] = args as [string, unknown];
        return this.postJson(path, body);
      },
      {
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        timeout: this.timeoutMs,
      },
    );

    // Set fallback for when circuit is open
    this.circuitBreaker.fallback(() => {
      throw new LLMError('LLM service temporarily unavailable - circuit breaker is open');
    });

    Logger.info('[OkrAgentService] Initialized with cache and circuit breaker');
  }

  /**
   * Makes a POST request to the LLM API endpoint.
   *
   * @param path - API endpoint path (e.g., '/v1/responses')
   * @param body - Request payload object
   * @param signal - Optional AbortSignal for request cancellation
   * @returns Promise resolving to the parsed JSON response
   * @throws Error if the request fails or returns non-OK status
   *
   * @example
   * ```typescript
   * const response = await this.postJson('/v1/responses', {
   *   model: 'gpt-4o-mini',
   *   messages: [...]
   * });
   * ```
   */
  private async postJson(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new LLMError(`LLM request failed: ${res.status}`);
    const jsonData = await res.json();
    return jsonData;
  }

  /**
   * Validates that a response matches the next question schema.
   *
   * @param payload - The response payload to validate
   * @returns True if the payload is a valid next question response
   */
  private isValidNextQuestion(payload: unknown): boolean {
    return nextQuestionResponseSchema.safeParse(payload).success;
  }

  /**
   * Validates that a response matches the OKR draft schema.
   *
   * @param payload - The response payload to validate
   * @returns True if the payload is a valid OKR draft response
   */
  private isValidDraft(payload: unknown): boolean {
    return okrDraftResponseSchema.safeParse(payload).success;
  }

  /**
   * Calls the configured LLM HTTP endpoint with caching and circuit breaker protection.
   *
   * This is the core LLM invocation method that orchestrates caching, circuit breaking,
   * and validation. It ensures responses are valid before returning them.
   *
   * @param path - API endpoint path
   * @param body - Request payload
   * @param validate - Function to validate the response structure
   * @param cacheKey - Optional cache key for response caching
   * @returns Promise resolving to the validated response
   * @throws Error if validation fails or the API request fails
   *
   * @example
   * ```typescript
   * const result = await this.callLlmApi(
   *   '/v1/responses',
   *   payload,
   *   (x) => this.isValidNextQuestion(x),
   *   'cache-key-123'
   * );
   * ```
   */
  private async callLlmApi<T = unknown>(
    path: string,
    body: unknown,
    validate: (x: unknown) => boolean,
    cacheKey?: string,
  ): Promise<T> {
    // Check cache first if cache key is provided
    if (cacheKey) {
      const cached = this.cache.get<T>(cacheKey);
      if (cached) {
        Logger.debug('[OkrAgentService] Cache hit for', cacheKey.substring(0, 20));
        return cached;
      }
    }

    // Execute with circuit breaker protection
    const result = await this.circuitBreaker.fire<unknown>(path, body);

    if (!validate(result)) {
      throw new LLMError('LLM response validation failed');
    }

    // Store in cache if cache key is provided
    if (cacheKey) {
      this.cache.set(cacheKey, result);
      Logger.debug('[OkrAgentService] Cached response for', cacheKey.substring(0, 20));
    }

    return result as unknown as T;
  }

  /**
   * Requests the next clarification question from the LLM.
   *
   * Uses caching and circuit breaker protection. The response is validated
   * against the nextQuestionResponseSchema from shared contracts.
   *
   * @param context - Current clarification session context with turn history
   * @param lastChoice - The user's most recent selection
   * @returns Promise resolving to the validated next question response
   * @throws Error if the API request fails or response validation fails
   *
   * @example
   * ```typescript
   * const question = await agent.getNextQuestion(
   *   { turns: [{ questionId: 'q1', optionId: 'opt1', timestamp: '...' }] },
   *   { questionId: 'q1', optionId: 'opt1' }
   * );
   * ```
   */
  async getNextQuestion(context: ClarificationContext, lastChoice: LastChoice): Promise<unknown> {
    const payload = { context, lastChoice, model: this.model, type: 'next-question' };
    const cacheKey = this.cache.generateCacheKey(
      'next-question',
      { context, lastChoice },
      this.model,
    );

    return this.callLlmApi('/v1/responses', payload, (x) => this.isValidNextQuestion(x), cacheKey);
  }

  /**
   * Generates an OKR draft based on the completed clarification context.
   *
   * Uses caching and circuit breaker protection. The response is validated
   * against the okrDraftResponseSchema from shared contracts.
   *
   * @param context - Complete clarification session context with all turns
   * @returns Promise resolving to the validated OKR draft response
   * @throws Error if the API request fails or response validation fails
   *
   * @example
   * ```typescript
   * const draft = await agent.generateDraft({
   *   turns: [
   *     { questionId: 'q1', optionId: 'opt1', timestamp: '...' },
   *     { questionId: 'q2', optionId: 'opt3', timestamp: '...' }
   *   ]
   * });
   * ```
   */
  async generateDraft(context: ClarificationContext): Promise<unknown> {
    const payload = { context, model: this.model, type: 'okr-draft' };
    const cacheKey = this.cache.generateCacheKey('okr-draft', context, this.model);

    return this.callLlmApi('/v1/responses', payload, (x) => this.isValidDraft(x), cacheKey);
  }

  /**
   * Gets current performance metrics for monitoring.
   *
   * Returns statistics about cache efficiency and circuit breaker state,
   * useful for debugging and performance optimization.
   *
   * @returns Performance metrics including cache and circuit breaker statistics
   *
   * @example
   * ```typescript
   * const metrics = agent.getMetrics();
   * console.log('Cache hit rate:', metrics.cache.hitRate);
   * console.log('Circuit state:', metrics.circuitBreaker.state);
   * ```
   */
  getMetrics(): PerformanceMetrics {
    return {
      cache: this.cache.getStats(),
      circuitBreaker: this.circuitBreaker.getMetrics(),
    };
  }

  /**
   * Clears the LLM response cache.
   *
   * This can be useful when the LLM model or prompts change,
   * or when you want to force fresh API calls.
   */
  clearCache(): void {
    this.cache.clear();
    Logger.info('[OkrAgentService] Cache cleared');
  }
}
