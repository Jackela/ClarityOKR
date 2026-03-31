import { LlmCircuitBreaker } from '../../../app/main/src/services/llm-circuit-breaker.service.js';

describe('CircuitBreakerService Integration', () => {
  let breaker: LlmCircuitBreaker;

  describe('Circuit States', () => {
    it('should start in CLOSED state', () => {
      const testFn = async () => 'success';
      breaker = new LlmCircuitBreaker(testFn);
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should transition to OPEN after failures', async () => {
      let failureCount = 0;
      const testFn = async () => {
        failureCount++;
        throw new Error(`Failure ${failureCount}`);
      };

      breaker = new LlmCircuitBreaker(testFn, {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
      });

      // Keep calling until circuit opens
      let attempts = 0;
      while (breaker.getState() !== 'OPEN' && attempts < 10) {
        await breaker.fire().catch(() => {});
        attempts++;
      }

      expect(breaker.getState()).toBe('OPEN');
      expect(failureCount).toBeGreaterThanOrEqual(1);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const failingFn = async () => {
        throw new Error('Fail');
      };

      breaker = new LlmCircuitBreaker(failingFn, {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
      });

      for (let i = 0; i < 3; i++) {
        await breaker.fire().catch(() => {});
      }

      expect(breaker.getState()).toBe('OPEN');
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(breaker.getState()).toBe('HALF_OPEN');
    });

    it('should close circuit after successful test call', async () => {
      const successFn = async () => ({ success: true });

      breaker = new LlmCircuitBreaker(successFn, {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
      });

      breaker.open();
      expect(breaker.getState()).toBe('OPEN');
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = await breaker.fire();
      expect(result).toEqual({ success: true });
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should reopen circuit if test call fails', async () => {
      const failingFn = async () => {
        throw new Error('Fail');
      };

      breaker = new LlmCircuitBreaker(failingFn, {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
      });

      breaker.open();
      expect(breaker.getState()).toBe('OPEN');
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // In HALF_OPEN state, a failure should reopen the circuit
      await breaker.fire().catch(() => {});
      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('Metrics', () => {
    it('should track execution metrics', async () => {
      breaker = new LlmCircuitBreaker(async () => 'success', {
        failureThreshold: 5,
      });

      await breaker.fire();
      await breaker.fire();
      breaker.open();
      breaker.close();

      const metrics = breaker.getMetrics();
      expect(metrics.successes).toBe(2);
      expect(metrics.state).toBe('CLOSED');
      expect(metrics).toHaveProperty('failures');
      expect(metrics).toHaveProperty('fireRate');
    });
  });
});
