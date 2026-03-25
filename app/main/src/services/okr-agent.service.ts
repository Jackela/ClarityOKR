import { nextQuestionResponseSchema, okrDraftResponseSchema } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import { getLlmConfig } from '../env.js';
import { LlmCacheService, type CacheStats } from './llm-cache.service.js';
import { LlmCircuitBreaker, type CircuitBreakerMetrics } from './llm-circuit-breaker.service.js';

type ClarificationContext = {
  turns: Array<{ questionId: string; optionId: string; timestamp: string }>;
};
type LastChoice = { questionId: string; optionId: string };

export interface PerformanceMetrics {
  cache: CacheStats;
  circuitBreaker: CircuitBreakerMetrics;
}

export class OkrAgentService {
  private readonly cfg = getLlmConfig();
  private readonly baseUrl = (this.cfg.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
  private readonly model = this.cfg.model || 'gpt-4o-mini';
  private readonly timeoutMs = 5000;

  private readonly cache: LlmCacheService;
  private readonly circuitBreaker: LlmCircuitBreaker;

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
      throw new Error('LLM service temporarily unavailable - circuit breaker is open');
    });

    Logger.info('[OkrAgentService] Initialized with cache and circuit breaker');
  }

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
    if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
    const jsonData = await res.json();
    return jsonData;
  }

  private isValidNextQuestion(payload: unknown): boolean {
    return nextQuestionResponseSchema.safeParse(payload).success;
  }

  private isValidDraft(payload: unknown): boolean {
    return okrDraftResponseSchema.safeParse(payload).success;
  }

  /**
   * Calls the configured LLM HTTP endpoint with caching and circuit breaker protection.
   * Never leaks secrets to renderer; runs in Electron main.
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
      throw new Error('LLM response validation failed');
    }

    // Store in cache if cache key is provided
    if (cacheKey) {
      this.cache.set(cacheKey, result);
      Logger.debug('[OkrAgentService] Cached response for', cacheKey.substring(0, 20));
    }

    return result as unknown as T;
  }

  async getNextQuestion(context: ClarificationContext, lastChoice: LastChoice): Promise<unknown> {
    /**
     * Requests the next clarification question with caching and circuit breaker protection.
     */
    const payload = { context, lastChoice, model: this.model, type: 'next-question' };
    const cacheKey = this.cache.generateCacheKey(
      'next-question',
      { context, lastChoice },
      this.model,
    );

    return this.callLlmApi('/v1/responses', payload, (x) => this.isValidNextQuestion(x), cacheKey);
  }

  async generateDraft(context: ClarificationContext): Promise<unknown> {
    /**
     * Generates an OKR draft with caching and circuit breaker protection.
     */
    const payload = { context, model: this.model, type: 'okr-draft' };
    const cacheKey = this.cache.generateCacheKey('okr-draft', context, this.model);

    return this.callLlmApi('/v1/responses', payload, (x) => this.isValidDraft(x), cacheKey);
  }

  /**
   * Gets current performance metrics for monitoring
   */
  getMetrics(): PerformanceMetrics {
    return {
      cache: this.cache.getStats(),
      circuitBreaker: this.circuitBreaker.getMetrics(),
    };
  }

  /**
   * Clears the LLM response cache
   */
  clearCache(): void {
    this.cache.clear();
    Logger.info('[OkrAgentService] Cache cleared');
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Gets circuit breaker state and metrics
   */
  getCircuitBreakerMetrics(): CircuitBreakerMetrics {
    return this.circuitBreaker.getMetrics();
  }
}
