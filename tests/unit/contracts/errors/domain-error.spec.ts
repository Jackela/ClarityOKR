import {
  DomainError,
  ValidationError,
  PersistenceError,
  LLMError,
  SessionNotFoundError,
  EncryptionError,
  SecureStorageError,
  ClarificationError,
} from '@clarityokr/contracts';

describe('DomainError Hierarchy', () => {
  describe('DomainError', () => {
    it('should be abstract and not instantiable directly', () => {
      const error = new ValidationError('test');
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('should set name to constructor name', () => {
      const error = new ValidationError('test message');
      expect(error.name).toBe('ValidationError');
    });

    it('should capture stack trace', () => {
      const error = new ValidationError('test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });
  });

  describe('error chaining with cause', () => {
    it('should support cause property', () => {
      const cause = new Error('original error');
      const error = new ValidationError('validation failed', cause);
      expect(error.cause).toBe(cause);
    });

    it('should allow undefined cause', () => {
      const error = new ValidationError('validation failed');
      expect(error.cause).toBeUndefined();
    });

    it('should chain multiple domain errors', () => {
      const original = new PersistenceError('db failed');
      const wrapped = new ValidationError('validation failed', original);
      expect(wrapped.cause).toBe(original);
      expect(wrapped.cause).toBeInstanceOf(PersistenceError);
    });
  });

  describe('code property', () => {
    it('ValidationError should have correct code', () => {
      const error = new ValidationError('test');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('PersistenceError should have correct code', () => {
      const error = new PersistenceError('test');
      expect(error.code).toBe('PERSISTENCE_ERROR');
    });

    it('LLMError should have correct code', () => {
      const error = new LLMError('test');
      expect(error.code).toBe('LLM_ERROR');
    });

    it('SessionNotFoundError should have correct code', () => {
      const error = new SessionNotFoundError('session-123');
      expect(error.code).toBe('SESSION_NOT_FOUND');
    });

    it('EncryptionError should have correct code', () => {
      const error = new EncryptionError('test');
      expect(error.code).toBe('ENCRYPTION_ERROR');
    });

    it('SecureStorageError should have correct code', () => {
      const error = new SecureStorageError('test');
      expect(error.code).toBe('SECURE_STORAGE_ERROR');
    });

    it('ClarificationError should have correct code', () => {
      const error = new ClarificationError('test');
      expect(error.code).toBe('CLARIFICATION_ERROR');
    });
  });

  describe('instanceof checks', () => {
    it('all errors should be instances of DomainError', () => {
      expect(new ValidationError('test')).toBeInstanceOf(DomainError);
      expect(new PersistenceError('test')).toBeInstanceOf(DomainError);
      expect(new LLMError('test')).toBeInstanceOf(DomainError);
      expect(new SessionNotFoundError('id')).toBeInstanceOf(DomainError);
      expect(new EncryptionError('test')).toBeInstanceOf(DomainError);
      expect(new SecureStorageError('test')).toBeInstanceOf(DomainError);
      expect(new ClarificationError('test')).toBeInstanceOf(DomainError);
    });

    it('all errors should be instances of Error', () => {
      expect(new ValidationError('test')).toBeInstanceOf(Error);
      expect(new PersistenceError('test')).toBeInstanceOf(Error);
      expect(new LLMError('test')).toBeInstanceOf(Error);
      expect(new SessionNotFoundError('id')).toBeInstanceOf(Error);
      expect(new EncryptionError('test')).toBeInstanceOf(Error);
      expect(new SecureStorageError('test')).toBeInstanceOf(Error);
      expect(new ClarificationError('test')).toBeInstanceOf(Error);
    });

    it('should support specific instanceof checks', () => {
      const validationError = new ValidationError('test');
      expect(validationError).toBeInstanceOf(ValidationError);
      expect(validationError).not.toBeInstanceOf(PersistenceError);

      const persistenceError = new PersistenceError('test');
      expect(persistenceError).toBeInstanceOf(PersistenceError);
      expect(persistenceError).not.toBeInstanceOf(ValidationError);
    });
  });

  describe('SessionNotFoundError', () => {
    it('should format message with session ID', () => {
      const error = new SessionNotFoundError('abc-123');
      expect(error.message).toBe('Session not found: abc-123');
    });

    it('should support cause chaining', () => {
      const cause = new Error('db timeout');
      const error = new SessionNotFoundError('abc-123', cause);
      expect(error.message).toBe('Session not found: abc-123');
      expect(error.cause).toBe(cause);
    });
  });

  describe('message preservation', () => {
    it('should preserve message for all error types', () => {
      expect(new ValidationError('invalid input').message).toBe('invalid input');
      expect(new PersistenceError('db failed').message).toBe('db failed');
      expect(new LLMError('api timeout').message).toBe('api timeout');
      expect(new EncryptionError('decrypt failed').message).toBe('decrypt failed');
      expect(new SecureStorageError('keychain error').message).toBe('keychain error');
      expect(new ClarificationError('session expired').message).toBe('session expired');
    });
  });
});
