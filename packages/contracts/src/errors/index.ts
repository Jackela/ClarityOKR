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

export {
  DomainError,
  ValidationError,
  PersistenceError,
  LLMError,
  SessionNotFoundError,
  EncryptionError,
  SecureStorageError,
  ClarificationError,
} from './domain-error.js';

// IPC-related errors
export { IpcError, WindowError } from './ipc-errors.js';

// LLM-related errors
export { CircuitBreakerError, RetryExhaustedError } from './llm-errors.js';

// Persistence-related errors
export { DatabaseError, StateMachineError, SecurityError } from './persistence-errors.js';
