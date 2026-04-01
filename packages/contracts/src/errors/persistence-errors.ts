/**
 * Persistence Errors
 *
 * Errors related to database operations, persistence, clarification,
 * state machine, and security operations.
 */

import { ClarityOkrError, type ClarityOkrErrorOptions } from './base.js';

/**
 * Error related to database operations
 */
export class DatabaseError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      operation?: string;
      table?: string;
    } = {},
  ) {
    const { operation, table, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'DATABASE_ERROR',
      statusCode: options.statusCode ?? 500,
      context: {
        ...options.context,
        operation,
        table,
      },
    });
  }
}

/**
 * Error related to clarification session operations
 */
export class ClarificationError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      sessionId?: string;
      step?: string;
    } = {},
  ) {
    const { sessionId, step, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'CLARIFICATION_ERROR',
      statusCode: options.statusCode ?? 400,
      context: {
        ...options.context,
        sessionId,
        step,
      },
    });
  }
}

/**
 * Error related to state machine operations
 */
export class StateMachineError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      currentState?: string;
      targetState?: string;
      event?: string;
    } = {},
  ) {
    const { currentState, targetState, event, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'STATE_MACHINE_ERROR',
      statusCode: options.statusCode ?? 409,
      context: {
        ...options.context,
        currentState,
        targetState,
        event,
      },
    });
  }
}

/**
 * Error related to encryption/security operations
 */
export class SecurityError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      operation?: string;
    } = {},
  ) {
    const { operation, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'SECURITY_ERROR',
      statusCode: options.statusCode ?? 403,
      context: {
        ...options.context,
        operation,
      },
    });
  }
}

/**
 * Error related to persistence operations
 */
export class PersistenceError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      operation?: string;
      entity?: string;
    } = {},
  ) {
    const { operation, entity, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'PERSISTENCE_ERROR',
      statusCode: options.statusCode ?? 500,
      context: {
        ...options.context,
        operation,
        entity,
      },
    });
  }
}
