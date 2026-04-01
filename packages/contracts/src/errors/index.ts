/**
 * Errors Index
 *
 * Re-exports all error classes and utilities for backward compatibility.
 * All exports are preserved from the original errors.ts file.
 */

// Base error class and utilities
export {
  ClarityOkrError,
  type ClarityOkrErrorOptions,
  isClarityOkrError,
  isErrorOfType,
  getErrorCode,
  getErrorMessage,
  ErrorCodes,
  type ErrorCode,
  type ErrorSeverity,
  getErrorSeverity,
  getRecoverySuggestion,
} from './base.js';

// IPC-related errors
export { IpcError, ValidationError, WindowError } from './ipc-errors.js';

// LLM-related errors
export { LlmError, CircuitBreakerError, RetryExhaustedError } from './llm-errors.js';

// Persistence-related errors
export {
  DatabaseError,
  ClarificationError,
  StateMachineError,
  SecurityError,
  PersistenceError,
} from './persistence-errors.js';
