import {
  BridgeUnavailableError,
  CircuitBreakerError,
  ClarityOkrError,
  DatabaseError,
  ErrorCodes,
  IpcError,
  RetryExhaustedError,
  SecurityError,
  StateMachineError,
  WindowError,
  getErrorCode,
  getErrorMessage,
  getErrorSeverity,
  getRecoverySuggestion,
  isClarityOkrError,
  isErrorOfType,
} from '@clarityokr/contracts';
import type { ErrorCode } from '@clarityokr/contracts';
import { LlmError } from '../../../../packages/contracts/src/errors/llm-errors';
import {
  ClarificationError,
  PersistenceError,
} from '../../../../packages/contracts/src/errors/persistence-errors';
import { ValidationError } from '../../../../packages/contracts/src/errors/ipc-errors';

/** #151: the ClarityOkrError family in packages/contracts/src/errors. */
describe('ClarityOkrError', () => {
  it('defaults the code and records a timestamp and stack', () => {
    const error = new ClarityOkrError('base');
    expect(error.name).toBe('ClarityOkrError');
    expect(error.code).toBe('CLARITY_OKR_ERROR');
    expect(error.statusCode).toBeUndefined();
    expect(new Date(error.timestamp).toString()).not.toBe('Invalid Date');
    expect(error.stack).toContain('base');
    expect(error.toUserMessage()).toBe('base');
  });

  it('serialises itself with and without a cause', () => {
    const cause = new TypeError('inner');
    const json = new ClarityOkrError('outer', {
      code: 'X',
      statusCode: 418,
      context: { a: 1 },
      cause,
    }).toJSON();
    expect(json).toMatchObject({
      name: 'ClarityOkrError',
      message: 'outer',
      code: 'X',
      statusCode: 418,
      context: { a: 1 },
      cause: { name: 'TypeError', message: 'inner' },
    });
    expect(new ClarityOkrError('plain').toJSON().cause).toBeUndefined();
  });

  it('still works where Error.captureStackTrace is missing', () => {
    const original = (Error as unknown as { captureStackTrace?: unknown }).captureStackTrace;
    (Error as unknown as { captureStackTrace?: unknown }).captureStackTrace = undefined;
    try {
      expect(new ClarityOkrError('no v8').message).toBe('no v8');
    } finally {
      (Error as unknown as { captureStackTrace?: unknown }).captureStackTrace = original;
    }
  });
});

describe('error helpers', () => {
  it('type guards', () => {
    const error = new DatabaseError('db');
    expect(isClarityOkrError(error)).toBe(true);
    expect(isClarityOkrError(new Error('x'))).toBe(false);
    expect(isErrorOfType(error, DatabaseError as never)).toBe(true);
    expect(isErrorOfType(error, IpcError as never)).toBe(false);
  });

  it('getErrorCode and getErrorMessage for every kind of thrown value', () => {
    expect(getErrorCode(new IpcError('i'))).toBe('IPC_ERROR');
    expect(getErrorCode(new TypeError('t'))).toBe('TYPE_ERROR');
    expect(getErrorCode('s')).toBe('UNKNOWN_ERROR');
    expect(getErrorMessage(new IpcError('ipc message'))).toBe('ipc message');
    expect(getErrorMessage(new Error('plain'))).toBe('plain');
    expect(getErrorMessage(12)).toBe('12');
  });

  it('every registered code has a severity and a recovery suggestion', () => {
    for (const code of Object.values(ErrorCodes)) {
      expect(['CRITICAL', 'ERROR', 'WARNING', 'INFO']).toContain(getErrorSeverity(code));
      expect(getRecoverySuggestion(new ClarityOkrError('x', { code }))).toEqual(expect.any(String));
    }
    expect(getErrorSeverity('DATABASE_ERROR')).toBe('CRITICAL');
    expect(getErrorSeverity('NOT_A_CODE' as ErrorCode)).toBe('ERROR');
    expect(getRecoverySuggestion(new Error('x'))).toMatch(/unexpected error/);
    expect(getRecoverySuggestion(new ClarityOkrError('x', { code: 'OTHER' }))).toBeUndefined();
  });
});

describe('error subclasses', () => {
  it.each([
    [() => new IpcError('m', { channel: 'c' }), 'IPC_ERROR', 500, { channel: 'c' }],
    [
      () => new ValidationError('m', { field: 'f', value: 1, schema: 's' }),
      'VALIDATION_ERROR',
      400,
      { field: 'f', value: 1, schema: 's' },
    ],
    [
      () => new WindowError('m', { windowType: 'sticky', windowId: 2 }),
      'WINDOW_ERROR',
      500,
      { windowType: 'sticky', windowId: 2 },
    ],
    [
      () => new LlmError('m', { provider: 'p', model: 'x' }),
      'LLM_ERROR',
      502,
      { provider: 'p', model: 'x', isRetryable: true },
    ],
    [
      () => new CircuitBreakerError('m', { state: 'HALF_OPEN' }),
      'CIRCUIT_BREAKER_ERROR',
      503,
      { circuitState: 'HALF_OPEN' },
    ],
    [() => new RetryExhaustedError('m', { attempts: 3 }), 'RETRY_EXHAUSTED', 504, { attempts: 3 }],
    [
      () => new DatabaseError('m', { operation: 'o', table: 't' }),
      'DATABASE_ERROR',
      500,
      { operation: 'o', table: 't' },
    ],
    [
      () => new ClarificationError('m', { sessionId: 's', step: 'q' }),
      'CLARIFICATION_ERROR',
      400,
      { sessionId: 's', step: 'q' },
    ],
    [
      () => new StateMachineError('m', { currentState: 'a', targetState: 'b', event: 'e' }),
      'STATE_MACHINE_ERROR',
      409,
      { currentState: 'a', targetState: 'b', event: 'e' },
    ],
    [
      () => new SecurityError('m', { operation: 'decrypt' }),
      'SECURITY_ERROR',
      403,
      { operation: 'decrypt' },
    ],
    [
      () => new PersistenceError('m', { operation: 'save', entity: 'okr' }),
      'PERSISTENCE_ERROR',
      500,
      { operation: 'save', entity: 'okr' },
    ],
  ])('%#: code, default status and context', (make, code, statusCode, context) => {
    const error = make();
    expect(error).toBeInstanceOf(ClarityOkrError);
    expect(error.code).toBe(code);
    expect(error.statusCode).toBe(statusCode);
    expect(error.context).toMatchObject(context);
  });

  it.each([
    () => new IpcError('m'),
    () => new ValidationError('m'),
    () => new WindowError('m'),
    () => new LlmError('m'),
    () => new CircuitBreakerError('m'),
    () => new DatabaseError('m'),
    () => new ClarificationError('m'),
    () => new StateMachineError('m'),
    () => new SecurityError('m'),
    () => new PersistenceError('m'),
  ])('%#: works without options', (make) => {
    expect(make().message).toBe('m');
  });

  it('keeps an explicit status code and extra context', () => {
    for (const error of [
      new IpcError('m', { statusCode: 1, context: { k: 1 } }),
      new ValidationError('m', { statusCode: 1, context: { k: 1 } }),
      new WindowError('m', { statusCode: 1, context: { k: 1 } }),
      new LlmError('m', { statusCode: 1, context: { k: 1 } }),
      new CircuitBreakerError('m', { statusCode: 1, context: { k: 1 } }),
      new RetryExhaustedError('m', { attempts: 1, statusCode: 1, context: { k: 1 } }),
      new DatabaseError('m', { statusCode: 1, context: { k: 1 } }),
      new ClarificationError('m', { statusCode: 1, context: { k: 1 } }),
      new StateMachineError('m', { statusCode: 1, context: { k: 1 } }),
      new SecurityError('m', { statusCode: 1, context: { k: 1 } }),
      new PersistenceError('m', { statusCode: 1, context: { k: 1 } }),
    ]) {
      expect(error.statusCode).toBe(1);
      expect(error.context).toMatchObject({ k: 1 });
    }
  });

  it('LlmError.isRetryable follows the option and defaults to true', () => {
    expect(new LlmError('m').isRetryable()).toBe(true);
    expect(new LlmError('m', { isRetryable: false }).isRetryable()).toBe(false);
    const missing = new LlmError('m');
    Object.defineProperty(missing, 'context', { value: undefined });
    expect(missing.isRetryable()).toBe(true);
  });

  it('RetryExhaustedError keeps the last error as its cause', () => {
    const last = new Error('last');
    expect(new RetryExhaustedError('m', { attempts: 2, lastError: last }).cause).toBe(last);
  });

  it('BridgeUnavailableError is exported', () => {
    expect(new BridgeUnavailableError()).toBeInstanceOf(Error);
  });
});
