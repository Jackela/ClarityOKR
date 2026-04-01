/**
 * Integration Tests for LLM Caching
 * 任务20.1: LLM缓存集成测试
 */

import { LlmCacheService } from '../../../../app/main/src/services/llm-cache.service.js';

describe('LlmCacheService Integration', () => {
  let cacheService: LlmCacheService;

  beforeEach(() => {
    // Get singleton instance and reset stats for test isolation
    cacheService = LlmCacheService.getInstance();
    cacheService.clear();
  });

  afterEach(() => {
    cacheService.clear();
  });

  describe('Cache Operations', () => {
    it('should cache and retrieve LLM response', () => {
      const key = 'test-key-1';
      const response = {
        question: {
          id: 'q1',
          text: 'What is your goal?',
          options: [{ id: 'opt1', label: 'Option 1' }],
        },
      };

      cacheService.set(key, response);
      const retrieved = cacheService.get(key);

      expect(retrieved).toEqual(response);
    });

    it('should return undefined for cache miss', () => {
      const result = cacheService.get('nonexistent-key');
      expect(result).toBeUndefined();
    });

    it('should update existing cache entry', () => {
      const key = 'update-key';
      const response1 = { data: 'version1' };
      const response2 = { data: 'version2' };

      cacheService.set(key, response1);
      cacheService.set(key, response2);

      expect(cacheService.get(key)).toEqual(response2);
    });
  });

  describe('Cache Statistics', () => {
    it('should track hit/miss statistics', () => {
      cacheService.set('key1', { data: 'value1' });
      cacheService.set('key2', { data: 'value2' });

      // Two hits
      cacheService.get('key1');
      cacheService.get('key1');

      // One hit, one miss
      cacheService.get('key2');
      cacheService.get('nonexistent');

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.75);
    });
  });

  describe('Cache Eviction', () => {
    it('should support manual cache clear', () => {
      cacheService.set('key1', { data: 'value1' });
      cacheService.set('key2', { data: 'value2' });

      cacheService.clear();

      expect(cacheService.get('key1')).toBeUndefined();
      expect(cacheService.get('key2')).toBeUndefined();
      expect(cacheService.getStats().size).toBe(0);
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent keys for same input', () => {
      const context = { turns: [{ questionId: 'q1', optionId: 'a', timestamp: '2024-01-01' }] };
      const model = 'gpt-4';
      const intent = 'test-intent';

      const key1 = cacheService.generateCacheKey(intent, context, model);
      const key2 = cacheService.generateCacheKey(intent, context, model);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const context1 = { turns: [{ questionId: 'q1', optionId: 'a', timestamp: '2024-01-01' }] };
      const context2 = { turns: [{ questionId: 'q1', optionId: 'b', timestamp: '2024-01-01' }] };
      const intent = 'test-intent';

      const key1 = cacheService.generateCacheKey(intent, context1, 'gpt-4');
      const key2 = cacheService.generateCacheKey(intent, context2, 'gpt-4');

      expect(key1).not.toBe(key2);
    });
  });
});
