/**
 * Integration Tests for Circuit Breaker
 * 任务20.2: 熔断器集成测试
 */

import { CircuitBreakerService } from '../../../app/main/src/services/llm-circuit-breaker.service.js';

describe('CircuitBreakerService Integration', () => {
  let breaker: CircuitBreakerService;
  let failureCount: number;

  beforeEach(() => {
    failureCount = 0;
    breaker = new CircuitBreakerService({
      failureThreshold: 3,
      resetTimeout: 1000, // 1s for faster tests
      fallbackFn: () => ({ fallback: true }),
    });
  });

  describe('Circuit States', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should transition to OPEN after failures', async () => {
      const failingFn = () => {
        failureCount++;
        throw new Error(`Failure ${failureCount}`);
      };

      // First 3 calls should fail but circuit remains closed
      await expectAsync(breaker.fire(failingFn)).toBeRejected();
      await expectAsync(breaker.fire(failingFn)).toBeRejected();
      await expectAsync(breaker.fire(failingFn)).toBeRejected();

      // Circuit should now be OPEN
      expect(breaker.getState()).toBe('OPEN');

      // Subsequent calls should use fallback without executing function
      const result = await breaker.fire(() => 'should not execute');
      expect(result).toEqual({ fallback: true });
      expect(failureCount).toBe(3); // No additional calls
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const failingFn = () => {
        throw new Error('Fail');
      };

      // Trigger circuit open
      for (let i = 0; i < 3; i++) {
        await breaker.fire(failingFn).catch(() => {});
      }

      expect(breaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Circuit should transition to HALF_OPEN
      expect(breaker.getState()).toBe('HALF_OPEN');
    });

    it('should close circuit after successful test call', async () => {
      const failingFn = () => {
        throw new Error('Fail');
      };
      const successFn = () => ({ success: true });

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.fire(failingFn).catch(() => {});
      }

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Success call should close circuit
      const result = await breaker.fire(successFn);
      expect(result).toEqual({ success: true });
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should reopen circuit if test call fails', async () => {
      const failingFn = () => {
        throw new Error('Fail');
      };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.fire(failingFn).catch(() => {});
      }

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Failed test call should reopen circuit
      await expectAsync(breaker.fire(failingFn)).toBeRejected();
      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('Success Reset', () => {
    it('should reset failure count after success', async () => {
      let shouldFail = true;
      const conditionalFn = () => {
        if (shouldFail) throw new Error('Fail');
        return { success: true };
      };

      // Two failures
      await breaker.fire(conditionalFn).catch(() => {});
      await breaker.fire(conditionalFn).catch(() => {});

      expect(breaker.getStats().failureCount).toBe(2);

      // Success should reset
      shouldFail = false;
      await breaker.fire(conditionalFn);

      expect(breaker.getStats().failureCount).toBe(0);
    });
  });

  describe('Metrics', () => {
    it('should track execution metrics', async () => {
      const successFn = () => 'success';
      const failFn = () => {
        throw new Error('fail');
      };

      await breaker.fire(successFn);
      await breaker.fire(successFn);
      await breaker.fire(failFn).catch(() => {});

      const stats = breaker.getStats();
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.totalCalls).toBe(3);
    });
  });
});
