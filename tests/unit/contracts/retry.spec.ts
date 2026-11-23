import { jest } from '@jest/globals';
import {
  CRITICAL_RETRY_CONFIG,
  CircuitBreakerError,
  ClarityOkrError,
  DATABASE_RETRY_CONFIG,
  NETWORK_RETRY_CONFIG,
  RetryExhaustedError,
  retryOnce,
  retryable,
  withCircuitBreakerAndRetry,
  withRetry,
  withRetrySafe,
  withTimeout,
} from '@clarityokr/contracts';
import type { RetryConfig, RetryContext } from '@clarityokr/contracts';

/** #151: the shared retry helpers, pinned to their current behaviour. */
const fast: Partial<RetryConfig> = { initialDelayMs: 1, maxDelayMs: 5, jitter: false };

describe('withRetry', () => {
  it('returns the first result and passes the attempt context', async () => {
    const contexts: RetryContext[] = [];
    const value = await withRetry(async (context) => {
      contexts.push(context);
      return 'ok';
    }, fast);
    expect(value).toBe('ok');
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ attempt: 1, maxAttempts: 3, previousErrors: [] });
  });

  it('retries until it succeeds and reports each retry', async () => {
    const onRetry = jest.fn();
    let calls = 0;
    const value = await withRetry(
      async (context) => {
        calls++;
        if (context.attempt < 3) throw new Error(`fail ${context.attempt}`);
        expect(context.previousErrors).toHaveLength(2);
        return calls;
      },
      { ...fast, onRetry },
    );
    expect(value).toBe(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]?.[0]).toBe(1);
  });

  it('throws RetryExhaustedError with every message once attempts run out', async () => {
    const onExhausted = jest.fn();
    const error = await withRetry(
      async () => {
        throw new Error('boom');
      },
      { ...fast, maxAttempts: 2, onExhausted },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RetryExhaustedError);
    const exhausted = error as RetryExhaustedError;
    expect(exhausted.message).toBe('Operation failed after 2 attempts');
    expect(exhausted.code).toBe('RETRY_EXHAUSTED');
    expect(exhausted.context).toMatchObject({ attempts: 2, errors: ['boom', 'boom'] });
    expect(exhausted.cause).toBeInstanceOf(Error);
    expect(onExhausted).toHaveBeenCalledWith(expect.any(Error), 2);
  });

  it('keeps no cause when the last failure is not an Error', async () => {
    const error = (await withRetry(
      async () => {
        throw 'plain';
      },
      { ...fast, maxAttempts: 1 },
    ).catch((e: unknown) => e)) as RetryExhaustedError;
    expect(error.cause).toBeUndefined();
    expect(error.context?.errors).toEqual(['plain']);
  });

  it('rethrows a non-retryable error at once', async () => {
    const fn = jest.fn(async () => {
      throw new Error('fatal');
    });
    await expect(withRetry(fn, { ...fast, isRetryable: () => false })).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('treats an invalid result as a failure', async () => {
    const error = (await withRetry(async () => 1, {
      ...fast,
      maxAttempts: 1,
      isValidResult: () => false,
    }).catch((e: unknown) => e)) as RetryExhaustedError;
    expect(error).toBeInstanceOf(RetryExhaustedError);
    expect(error.context?.errors).toEqual(['Result validation failed']);
  });

  it('times out a slow attempt', async () => {
    const error = (await withRetry(() => new Promise<never>(() => undefined), {
      ...fast,
      maxAttempts: 1,
      timeoutMs: 5,
    }).catch((e: unknown) => e)) as RetryExhaustedError;
    expect(error.context?.errors).toEqual(['Operation timed out after 5ms']);
  });

  it('refuses to start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort('stop');
    const error = (await withRetry(async () => 1, {
      ...fast,
      abortSignal: controller.signal,
    }).catch((e: unknown) => e)) as ClarityOkrError;
    expect(error.message).toBe('Operation cancelled');
    expect(error.context).toEqual({ reason: 'stop' });
  });

  it('cancels a running attempt when the signal aborts', async () => {
    const controller = new AbortController();
    const running = withRetry(() => new Promise<never>(() => undefined), {
      ...fast,
      maxAttempts: 1,
      abortSignal: controller.signal,
    });
    controller.abort('user');
    const error = (await running.catch((e: unknown) => e)) as RetryExhaustedError;
    expect(error.context?.errors).toEqual(['Operation cancelled']);
  });

  it('cancels the wait between attempts when the signal aborts', async () => {
    const controller = new AbortController();
    const running = withRetry(
      async () => {
        throw new Error('again');
      },
      {
        ...fast,
        initialDelayMs: 10_000,
        maxDelayMs: 10_000,
        abortSignal: controller.signal,
        onRetry: () => setTimeout(() => controller.abort('late'), 1),
      },
    );
    await expect(running).rejects.toMatchObject({
      message: 'Sleep cancelled',
      code: 'ABORT_ERROR',
    });
  });

  it.each([
    ['fixed', [4, 4, 4]],
    ['linear', [4, 8, 12]],
    ['exponential', [4, 8, 16]],
  ] as const)('waits with %s backoff', async (backoffStrategy, expected) => {
    const delays: number[] = [];
    await withRetry(
      async () => {
        throw new Error('x');
      },
      {
        maxAttempts: 4,
        initialDelayMs: 4,
        maxDelayMs: 100,
        jitter: false,
        backoffStrategy,
        onRetry: (_attempt, delay) => delays.push(delay),
      },
    ).catch(() => undefined);
    expect(delays).toEqual(expected);
  });

  it('caps the delay, falls back to the initial delay for an unknown strategy and adds jitter', async () => {
    const delays: number[] = [];
    const record = { onRetry: (_a: number, delay: number) => delays.push(delay) };
    const fail = async () => {
      throw new Error('x');
    };
    await withRetry(fail, {
      ...record,
      maxAttempts: 2,
      initialDelayMs: 50,
      maxDelayMs: 3,
      jitter: false,
    }).catch(() => undefined);
    await withRetry(fail, {
      ...record,
      maxAttempts: 2,
      initialDelayMs: 3,
      jitter: false,
      backoffStrategy: 'unknown' as RetryConfig['backoffStrategy'],
    }).catch(() => undefined);
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    await withRetry(fail, { ...record, maxAttempts: 2, initialDelayMs: 8, jitter: true }).catch(
      () => undefined,
    );
    random.mockRestore();
    expect(delays).toEqual([3, 3, 8]);
  });

  it('uses decorrelated jitter from the previous delay', async () => {
    const delays: number[] = [];
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    await withRetry(
      async () => {
        throw new Error('x');
      },
      {
        maxAttempts: 3,
        initialDelayMs: 2,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        jitter: false,
        backoffStrategy: 'decorrelated-jitter',
        onRetry: (_attempt, delay) => delays.push(delay),
      },
    ).catch(() => undefined);
    random.mockRestore();
    // attempt 1: 0.5 × min(100, 2 × 3) = 3; attempt 2: 0.5 × min(100, 2 × 2^0 × 3) = 3
    expect(delays).toEqual([3, 3]);
  });
});

describe('withRetrySafe', () => {
  it('wraps a success', async () => {
    await expect(withRetrySafe(async () => 7, fast)).resolves.toMatchObject({
      success: true,
      value: 7,
      attempts: 1,
      errors: [],
    });
  });

  it('wraps a failure with the attempts from the exhausted error', async () => {
    const result = await withRetrySafe(
      async () => {
        throw new Error('no');
      },
      { ...fast, maxAttempts: 2 },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(RetryExhaustedError);
    expect(result.attempts).toBe(2);
  });

  it('counts one attempt when the error carries no attempts', async () => {
    const result = await withRetrySafe(
      async () => {
        throw new Error('stop');
      },
      { isRetryable: () => false },
    );
    expect(result).toMatchObject({ success: false, attempts: 1 });
  });
});

describe('retry presets', () => {
  it('NETWORK_RETRY_CONFIG retries network-like failures only', () => {
    const retry = NETWORK_RETRY_CONFIG.isRetryable!;
    expect(retry(new ClarityOkrError('x', { code: 'LLM_ERROR' }))).toBe(true);
    expect(retry(new ClarityOkrError('x', { code: 'TIMEOUT_ERROR' }))).toBe(true);
    expect(retry(new ClarityOkrError('x', { code: 'IPC_ERROR' }))).toBe(false);
    for (const message of ['Network down', 'timeout', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'])
      expect(retry(new Error(message))).toBe(true);
    expect(retry(new Error('bad input'))).toBe(false);
    expect(retry('network')).toBe(false);
  });

  it('DATABASE_RETRY_CONFIG retries busy/locked database failures only', () => {
    const retry = DATABASE_RETRY_CONFIG.isRetryable!;
    expect(retry(new ClarityOkrError('x', { code: 'DATABASE_ERROR' }))).toBe(true);
    expect(retry(new ClarityOkrError('x', { code: 'IPC_ERROR' }))).toBe(false);
    for (const message of ['SQLITE_BUSY', 'database is locked', 'concurrent write', 'timeout'])
      expect(retry(new Error(message))).toBe(true);
    expect(retry(new Error('constraint failed'))).toBe(false);
    expect(retry(42)).toBe(false);
  });

  it('CRITICAL_RETRY_CONFIG retries everything', () => {
    expect(CRITICAL_RETRY_CONFIG.isRetryable!(new Error('any'))).toBe(true);
    expect(CRITICAL_RETRY_CONFIG.maxAttempts).toBe(10);
  });
});

describe('retryable decorator', () => {
  it('retries the method with its own `this` and logs each retry', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onRetry = jest.fn();
    let calls = 0;
    const target = {
      factor: 3,
      async run(this: { factor: number }, n: number) {
        calls++;
        if (calls === 1) throw new Error('first');
        return n * this.factor;
      },
    };
    const descriptor: PropertyDescriptor = { value: target.run };
    retryable({ ...fast, onRetry })(target, 'run', descriptor);
    await expect(descriptor.value.call(target, 2)).resolves.toBe(6);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[retryable] run attempt 1 failed, retrying in 1ms:',
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it('works without options', async () => {
    const descriptor: PropertyDescriptor = { value: async () => 'done' };
    retryable()(undefined, 'm', descriptor);
    await expect(descriptor.value()).resolves.toBe('done');
  });
});

describe('withCircuitBreakerAndRetry', () => {
  it('fails fast when the breaker is open', async () => {
    const fire = jest.fn();
    const error = await withCircuitBreakerAndRetry(async () => 1, {
      circuitBreaker: { isOpen: () => true, fire: fire as never },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CircuitBreakerError);
    expect((error as CircuitBreakerError).context).toEqual({ circuitState: 'OPEN' });
    expect(fire).not.toHaveBeenCalled();
  });

  it('runs the call through the breaker with retries', async () => {
    let calls = 0;
    const value = await withCircuitBreakerAndRetry(
      async () => {
        calls++;
        if (calls === 1) throw new Error('flaky');
        return 'through';
      },
      {
        circuitBreaker: { isOpen: () => false, fire: (fn) => fn() },
        retryConfig: fast,
      },
    );
    expect(value).toBe('through');
    expect(calls).toBe(2);
  });

  it('uses the default retry config when none is given', async () => {
    await expect(
      withCircuitBreakerAndRetry(async () => 'default', {
        circuitBreaker: { isOpen: () => false, fire: (fn) => fn() },
      }),
    ).resolves.toBe('default');
  });
});

describe('retryOnce and withTimeout', () => {
  it('retryOnce retries an invalid result once, then gives up', async () => {
    let calls = 0;
    await expect(
      retryOnce(
        async () => ++calls,
        (n) => n > 1,
      ),
    ).resolves.toBe(2);
    const error = await retryOnce(
      async () => 0,
      () => false,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RetryExhaustedError);
    await expect(retryOnce(async () => 'no validator')).resolves.toBe('no validator');
  });

  it('withTimeout resolves in time and rejects after the deadline', async () => {
    await expect(withTimeout(Promise.resolve('fast'), 50)).resolves.toBe('fast');
    const onTimeout = jest.fn();
    const error = (await withTimeout(new Promise<never>(() => undefined), 5, onTimeout).catch(
      (e: unknown) => e,
    )) as RetryExhaustedError;
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(error.context?.errors).toEqual(['Operation timed out']);
    await expect(withTimeout(new Promise<never>(() => undefined), 5)).rejects.toBeInstanceOf(
      RetryExhaustedError,
    );
  });
});
