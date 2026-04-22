/**
 * Domain Error Hierarchy
 *
 * Unified error handling strategy for the ClarityOKR Electron app.
 * All domain-specific errors extend the abstract DomainError base class,
 * providing consistent error codes and optional cause chaining.
 */

/**
 * Abstract base class for all domain errors.
 * Provides structured error information with error codes and cause chaining.
 */
export abstract class DomainError extends Error {
  /** Error code for programmatic handling */
  abstract readonly code: string;
  /** Original error that caused this error */
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error related to validation failures
 */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Error related to persistence operations
 */
export class PersistenceError extends DomainError {
  readonly code = 'PERSISTENCE_ERROR';

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Error related to LLM API calls
 */
export class LLMError extends DomainError {
  readonly code = 'LLM_ERROR';

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Error thrown when a session is not found
 */
export class SessionNotFoundError extends DomainError {
  readonly code = 'SESSION_NOT_FOUND';

  constructor(sessionId: string, cause?: unknown) {
    super(`Session not found: ${sessionId}`, cause);
  }
}

/**
 * Error related to encryption/decryption operations
 */
export class EncryptionError extends DomainError {
  readonly code = 'ENCRYPTION_ERROR';

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Error related to secure storage operations
 */
export class SecureStorageError extends DomainError {
  readonly code = 'SECURE_STORAGE_ERROR';

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Error related to clarification session operations
 */
export class ClarificationError extends DomainError {
  readonly code = 'CLARIFICATION_ERROR';

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}
