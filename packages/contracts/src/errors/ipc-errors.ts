/**
 * IPC Errors
 *
 * Errors related to IPC communication, window operations, and validation.
 */

import { ClarityOkrError, type ClarityOkrErrorOptions } from './base.js';

/**
 * Error related to IPC communication between main and renderer processes
 */
export class IpcError extends ClarityOkrError {
  constructor(message: string, options: ClarityOkrErrorOptions & { channel?: string } = {}) {
    const { channel, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'IPC_ERROR',
      statusCode: options.statusCode ?? 500,
      context: {
        ...options.context,
        channel,
      },
    });
  }
}

/**
 * Error related to validation failures
 */
export class ValidationError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      field?: string;
      value?: unknown;
      schema?: string;
    } = {},
  ) {
    const { field, value, schema, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'VALIDATION_ERROR',
      statusCode: options.statusCode ?? 400,
      context: {
        ...options.context,
        field,
        value,
        schema,
      },
    });
  }
}

/**
 * Error related to window operations
 */
export class WindowError extends ClarityOkrError {
  constructor(
    message: string,
    options: ClarityOkrErrorOptions & {
      windowType?: string;
      windowId?: number;
    } = {},
  ) {
    const { windowType, windowId, ...baseOptions } = options;
    super(message, {
      ...baseOptions,
      code: 'WINDOW_ERROR',
      statusCode: options.statusCode ?? 500,
      context: {
        ...options.context,
        windowType,
        windowId,
      },
    });
  }
}
