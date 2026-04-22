import { jest } from '@jest/globals';

import {
  LlmCircuitBreaker,
  type CircuitBreakerOptions,
} from '@clarityokr/main/services/llm-circuit-breaker.service';

describe('LlmCircuitBreaker', () => {
  let successAction: jest.Mock<Promise<string>, [string]>;
  let failureAction: jest.Mock<Promise<never>, [string]>;

  beforeEach(() => {
    successAction = jest.fn().mockImplementation((msg: string) => Promise.resolve(`result: ${msg}`));
    failureAction = jest.fn().mockImplementation(() => Promise.reject(new Error('LLM API error')));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const breaker = new LlmCircuitBreaker(successAction);
      expect(breaker.isClosed()).toBe(true);
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should initialize with custom options', () => {
      const options: CircuitBreakerOptions = {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        timeout: 2000,
      };
      const breaker = new LlmCircuitBreaker(successAction, options);
      expect(breaker.isClosed()).toBe(true);
    });
  });

  describe('fire', () => {
    it('should return result when action succeeds', async () => {
      const breaker = new LlmCircuitBreaker(successAction);
      const result = await breaker.fire<string>('hello');

      expect(result).toBe('result: hello');
      expect(successAction).toHaveBeenCalledWith('hello');
      expect(successAction).toHaveBeenCalledTimes(1);
    });

    it('should pass multiple arguments to action', async () => {
      const multiArgAction = jest.fn().mockResolvedValue('ok');
      const breaker = new LlmCircuitBreaker(multiArgAction);

      await breaker.fire('arg1', 'arg2', 42);

      expect(multiArgAction).toHaveBeenCalledWith('arg1', 'arg2', 42);
    });

    it('should propagate error when action fails and circuit is closed', async () => {
      const breaker = new LlmCircuitBreaker(failureAction);

      await expect(breaker.fire('test')).rejects.toThrow('LLM API error');
      expect(failureAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('state transitions', () => {
    it('should open circuit after threshold failures', async () => {
      const options: CircuitBreakerOptions = {
        failureThreshold: 2,
        resetTimeoutMs: 30000,
      };
      const breaker = new LlmCircuitBreaker(failureAction, options);

      expect(breaker.isClosed()).toBe(true);

      await expect(breaker.fire('test')).rejects.toThrow();

      await expect(breaker.fire('test')).rejects.toThrow();
      expect(breaker.isOpen()).toBe(true);
      expect(breaker.getState()).toBe('OPEN');
    });

    it('should reject calls when circuit is open', async () => {
      const options: CircuitBreakerOptions = {
        failureThreshold: 1,
        resetTimeoutMs: 30000,
      };
      const breaker = new LlmCircuitBreaker(failureAction, options);

      await expect(breaker.fire('test')).rejects.toThrow();
      expect(breaker.isOpen()).toBe(true);

      await expect(breaker.fire('test')).rejects.toThrow();
      expect(failureAction).toHaveBeenCalledTimes(1);
    });

    it('should allow manual open and close', () => {
      const breaker = new LlmCircuitBreaker(successAction);

      expect(breaker.isClosed()).toBe(true);

      breaker.open();
      expect(breaker.isOpen()).toBe(true);
      expect(breaker.getState()).toBe('OPEN');

      breaker.close();
      expect(breaker.isClosed()).toBe(true);
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should transition to half-open after reset timeout', async () => {
      const options: CircuitBreakerOptions = {
        failureThreshold: 1,
        resetTimeoutMs: 100,
      };
      const breaker = new LlmCircuitBreaker(failureAction, options);

      await expect(breaker.fire('test')).rejects.toThrow();
      expect(breaker.isOpen()).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(breaker.getState()).toBe('HALF_OPEN');
    });
  });

  describe('metrics', () => {
    it('should return initial metrics', () => {
      const breaker = new LlmCircuitBreaker(successAction);
      const metrics = breaker.getMetrics();

      expect(metrics.state).toBe('CLOSED');
      expect(metrics.failures).toBe(0);
      expect(metrics.successes).toBe(0);
      expect(metrics.rejects).toBe(0);
      expect(metrics.opens ?? 0).toBe(0);
      expect(metrics.halfOpens).toBe(0);
      expect(metrics.fireRate).toBe(0);
    });

    it('should track successes in metrics', async () => {
      const breaker = new LlmCircuitBreaker(successAction);
      await breaker.fire('test');

      const metrics = breaker.getMetrics();
      expect(metrics.successes).toBeGreaterThanOrEqual(1);
      expect(metrics.state).toBe('CLOSED');
    });

    it('should track failures in metrics', async () => {
      const breaker = new LlmCircuitBreaker(failureAction);

      try {
        await breaker.fire('test');
      } catch {
        void 0;
      }

      const metrics = breaker.getMetrics();
      expect(metrics.failures).toBeGreaterThanOrEqual(1);
    });
  });

  describe('fallback', () => {
    it('should execute fallback when circuit is open', async () => {
      const options: CircuitBreakerOptions = {
        failureThreshold: 1,
        resetTimeoutMs: 30000,
      };
      const breaker = new LlmCircuitBreaker(failureAction, options);

      const fallbackFn = jest.fn().mockReturnValue('fallback result');
      breaker.fallback(fallbackFn);

      try {
        await breaker.fire('test');
      } catch {
        void 0;
      }
      expect(breaker.isOpen()).toBe(true);

      const result = await breaker.fire('test');
      expect(result).toBe('fallback result');
      expect(fallbackFn).toHaveBeenCalledTimes(2);
      expect(fallbackFn).toHaveBeenNthCalledWith(1, 'test', expect.any(Error));
      expect(fallbackFn).toHaveBeenNthCalledWith(2, 'test', expect.any(Error));
    });
  });

  describe('getBreaker', () => {
    it('should return the underlying breaker instance', () => {
      const breaker = new LlmCircuitBreaker(successAction);
      const underlying = breaker.getBreaker();

      expect(underlying).toBeDefined();
      expect(typeof underlying.fire).toBe('function');
      expect(typeof underlying.open).toBe('function');
      expect(typeof underlying.close).toBe('function');
    });
  });
});
