/**
 * LLM Cache Service - LRU caching for LLM API responses
 *
 * Provides in-memory caching of LLM responses to reduce API costs
 * and improve response times. Uses LRU (Least Recently Used) eviction
 * policy with configurable size limits and TTL.
 *
 * This is a singleton service accessed via getInstance().
 */

import { LRUCache } from 'lru-cache';

import { Logger } from '../core/logger.js';

/** Cache entry storing response data with timestamp */
  data: unknown;
  timestamp: number;
}

/** Statistics for cache performance monitoring */
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

/** Service for caching LLM API responses with LRU eviction */
  private static instance: LlmCacheService;
  private readonly cache: LRUCache<string, CacheEntry>;
  private readonly stats = {
    hits: 0,
    misses: 0,
  };
  private readonly context: string;

  // Configuration constants
  private static readonly DEFAULT_MAX_SIZE = 100;
  private static readonly DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
  private static readonly CACHE_KEY_PREFIX = 'llm:';

  private constructor() {
    this.context = 'LlmCacheService';

    this.cache = new LRUCache<string, CacheEntry>({
      max: LlmCacheService.DEFAULT_MAX_SIZE,
      ttl: LlmCacheService.DEFAULT_TTL_MS,
      allowStale: false,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });

    Logger.info('[LlmCacheService] LLM Cache initialized', {
      maxSize: LlmCacheService.DEFAULT_MAX_SIZE,
      ttlMs: LlmCacheService.DEFAULT_TTL_MS,
    });
  }

  /**
   * Gets the singleton instance of LlmCacheService.
   * Creates the instance on first call.
   *
   * @returns The LlmCacheService singleton instance
   */
    if (!LlmCacheService.instance) {
      LlmCacheService.instance = new LlmCacheService();
    }
    return LlmCacheService.instance;
  }

  /**
   * Generates a cache key from intent, context, and model parameters.
   * Uses SHA-256 hash for consistent and collision-resistant keys.
   *
   * @param intent - The intent/type of request (e.g., 'next-question')
   * @param context - The context object for the request
   * @param model - The LLM model identifier
   * @returns A unique cache key string
   */
   * Generates a cache key from intent, context, and model parameters
   * Uses SHA-256 hash for consistent and collision-resistant keys
   */
  generateCacheKey(intent: string, context: unknown, model: string): string {
    const contextString = JSON.stringify(context);
    const keyData = `${intent}:${contextString}:${model}`;
    const hash = createHash('sha256').update(keyData).digest('hex');
    return `${LlmCacheService.CACHE_KEY_PREFIX}${hash}`;
  }

  /**
   * Gets cached response if available and not expired.
   *
   * @param key - The cache key
   * @returns The cached data or undefined if not found/expired
   * @template T - The expected type of cached data
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (entry) {
      this.stats.hits++;
      Logger.debug('[LlmCacheService] Cache hit', { key: key.substring(0, 20) });
      return entry.data as unknown as T;
    }

    this.stats.misses++;
    Logger.debug('[LlmCacheService] Cache miss', { key: key.substring(0, 20) });
    return undefined;
  }

  /**
   * Stores response in cache with the given key.
   *
   * @param key - The cache key
   * @param data - The data to cache
   */
  set(key: string, data: unknown): void {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
    };

    this.cache.set(key, entry);
    Logger.debug('[LlmCacheService] Cache set', { key: key.substring(0, 20) });
  }

  /**
   * Checks if a key exists in cache.
   *
   * @param key - The cache key to check
   * @returns True if key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clears all cached entries and resets statistics.
   */
  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
  }

  /**
   * Gets current cache statistics including hit rate.
   *
   * @returns CacheStats with hits, misses, size, and hit rate
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      maxSize: LlmCacheService.DEFAULT_MAX_SIZE,
      hitRate,
    };
  }

  /**
   * Resets hit/miss statistics (useful for testing).
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    Logger.debug('[LlmCacheService] Cache stats reset');
  }

  /**
   * Gets the number of items currently in cache.
   */
  get size(): number {
    return this.cache.size;
  }
}
