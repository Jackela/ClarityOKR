import { jest } from '@jest/globals';
import {
  DEFAULT_RETRY_CONFIG,
  calculateDelay,
  executeWithTimeout,
  sleep,
} from '../../../packages/contracts/src/retry.utils';
import type { RetryConfig } from '../../../packages/contracts/src/retry.utils';

/** #151: `retry.utils.ts` (not re-exported by the package index), pinned to its behaviour. */
const config = (overrides: Partial<RetryConfig>): RetryConfig => ({
  ...DEFAULT_RETRY_CONFIG,
  initialDelayMs: 4,
  maxDelayMs: 100,
  jitter: false,
  ...overrides,
});

describe('retry.utils calculateDelay', () => {
  it.each([
    ['fixed', 3, 4],
    ['linear', 3, 12],
    ['exponential', 3, 16],
  ] as const)('%s backoff, attempt %i → %i ms', (backoffStrategy, attempt, expected) => {
    expect(calculateDelay(config({ backoffStrategy }), attempt)).toBe(expected);
  });

  it('decorrelated jitter, the max delay cap, unknown strategies and jitter', () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(calculateDelay(config({ backoffStrategy: 'decorrelated-jitter' }), 1)).toBe(6);
    expect(calculateDelay(config({ backoffStrategy: 'decorrelated-jitter' }), 3)).toBe(12);
    expect(calculateDelay(config({ initialDelayMs: 500 }), 1)).toBe(100);
    expect(
      calculateDelay(config({ backoffStrategy: 'other' as RetryConfig['backoffStrategy'] }), 5),
    ).toBe(4);
    expect(calculateDelay(config({ jitter: true }), 1)).toBe(4);
    random.mockRestore();
  });

  it('defaults retry everything', () => {
    expect(DEFAULT_RETRY_CONFIG.isRetryable(new Error('x'))).toBe(true);
  });
});

describe('retry.utils sleep', () => {
  it('resolves after the delay, with or without a signal', async () => {
    await expect(sleep(1)).resolves.toBeUndefined();
    await expect(sleep(1, new AbortController().signal)).resolves.toBeUndefined();
  });

  it('rejects when aborted', async () => {
    const controller = new AbortController();
    const waiting = sleep(10_000, controller.signal);
    controller.abort('bye');
    await expect(waiting).rejects.toMatchObject({
      message: 'Sleep cancelled',
      code: 'ABORT_ERROR',
      context: { reason: 'bye' },
    });
  });
});

describe('retry.utils executeWithTimeout', () => {
  it('resolves and rejects with the wrapped function', async () => {
    await expect(executeWithTimeout(async () => 'v', 50)).resolves.toBe('v');
    await expect(
      executeWithTimeout(async () => {
        throw new Error('inner');
      }, 50),
    ).rejects.toThrow('inner');
    const controller = new AbortController();
    await expect(executeWithTimeout(async () => 'signal', 50, controller.signal)).resolves.toBe(
      'signal',
    );
    await expect(
      executeWithTimeout(
        async () => {
          throw new Error('inner2');
        },
        50,
        controller.signal,
      ),
    ).rejects.toThrow('inner2');
  });

  it('rejects on timeout and on abort', async () => {
    await expect(executeWithTimeout(() => new Promise(() => undefined), 5)).rejects.toMatchObject({
      code: 'TIMEOUT_ERROR',
      message: 'Operation timed out after 5ms',
    });
    const controller = new AbortController();
    const running = executeWithTimeout(
      () => new Promise(() => undefined),
      10_000,
      controller.signal,
    );
    controller.abort('why');
    await expect(running).rejects.toMatchObject({
      code: 'ABORT_ERROR',
      context: { reason: 'why' },
    });
  });
});
