import { jest } from '@jest/globals';
import { ClarityOkrError, ErrorCodes } from '@clarityokr/contracts';
import { MainErrorBoundary } from '@clarityokr/main/core/error-boundary.class';
import { normalizeError } from '@clarityokr/main/core/error-boundary.types';

const context = {
  component: 'SessionRepository',
  operation: 'save',
  metadata: { sessionId: 'synthetic' },
};
describe('Actual main error handling, recovery and suppression', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns successful results and normalizes errors without losing cause and context', async () => {
    const boundary = new MainErrorBoundary({ logErrors: false });
    await expect(boundary.guard(async () => 42, context)).resolves.toBe(42);
    expect(boundary.guardSync(() => 43, context)).toBe(43);
    const native = new TypeError('bad payload');
    expect(normalizeError(native, context)).toMatchObject({
      message: 'bad payload',
      cause: native,
      context: { originalName: 'TypeError', sessionId: 'synthetic' },
    });
    expect(normalizeError('plain failure', context).message).toBe('plain failure');
    const structured = new ClarityOkrError('known');
    expect(normalizeError(structured, context)).toBe(structured);
    await expect(
      boundary.guard(async () => {
        throw native;
      }, context),
    ).rejects.toMatchObject({ cause: native });
    expect(() =>
      boundary.guardSync(() => {
        throw native;
      }, context),
    ).toThrow(native);
  });

  it('suppresses repeated side effects within five seconds and handles the next occurrence', async () => {
    const custom = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const recovered = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const failed = jest.fn();
    const boundary = new MainErrorBoundary({
      logErrors: false,
      customHandlers: { [ErrorCodes.LLM_ERROR]: custom },
      recoveryStrategies: { [ErrorCodes.LLM_ERROR]: recovered },
      onRecoveryFailed: failed,
    });
    const error = new ClarityOkrError('offline', { code: ErrorCodes.LLM_ERROR });
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        boundary.guard(async () => {
          throw error;
        }, context),
      ).rejects.toBe(error);
    }
    expect(custom).toHaveBeenCalledTimes(1);
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5000);
    await expect(
      boundary.guard(async () => {
        throw error;
      }, context),
    ).rejects.toBe(error);
    expect(custom).toHaveBeenCalledTimes(2);
  });

  it('contains handler failures, escalates critical recovery failure, and preserves rejection', async () => {
    const error = new ClarityOkrError('disk failed', { code: ErrorCodes.DATABASE_ERROR });
    const failed = jest.fn();
    const critical = jest.fn();
    const boundary = new MainErrorBoundary({
      customHandlers: {
        [ErrorCodes.DATABASE_ERROR]: () => {
          throw new Error('handler failed');
        },
      },
      recoveryStrategies: {
        [ErrorCodes.DATABASE_ERROR]: async () => {
          throw new Error('recovery failed');
        },
      },
      onRecoveryFailed: failed,
      onCriticalError: critical,
    });
    await expect(
      boundary.forComponent('Storage').guard(async () => {
        throw error;
      }, 'write'),
    ).rejects.toBe(error);
    expect(failed).toHaveBeenCalledWith(error, expect.objectContaining({ component: 'Storage' }));
    expect(critical).toHaveBeenCalledTimes(1);
    expect(() =>
      boundary.forComponent('Storage').guardSync(() => {
        throw 'sync failure';
      }, 'parse'),
    ).toThrow('sync failure');
    await Promise.resolve();
    await Promise.resolve();
  });

  it.each([ErrorCodes.LLM_ERROR, ErrorCodes.IPC_ERROR, ErrorCodes.SECURITY_ERROR])(
    'keeps %s errors visible after normal logging and default recovery suggestions',
    async (code) => {
      const error = new ClarityOkrError('synthetic failure', { code });
      await expect(
        new MainErrorBoundary().guard(async () => {
          throw error;
        }, context),
      ).rejects.toBe(error);
    },
  );
});
