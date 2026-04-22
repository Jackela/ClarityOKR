import {
  encrypt,
  decrypt,
  generateEncryptionKey,
  isValidEncryptionKey,
  serializeEncrypted,
  deserializeEncrypted,
  isEncryptedData,
  encryptionService,
} from '@clarityokr/main/services/encryption.service';
import { EncryptionError } from '@clarityokr/main/core/encryption-port';

describe('Encryption Service', () => {
  const validKey = Buffer.alloc(32, 0x42);
  const testPlaintext = 'Hello, World! This is a secret message.';

  beforeEach(() => {
    // Ensure we use a fresh key for each test if needed
  });

  // ============================================================================
  // encrypt
  // ============================================================================
  describe('encrypt', () => {
    it('should encrypt plaintext and return EncryptedData', () => {
      const result = encrypt(testPlaintext, validKey);

      expect(result).toBeDefined();
      expect(typeof result.encrypted).toBe('string');
      expect(typeof result.iv).toBe('string');
      expect(typeof result.authTag).toBe('string');
      expect(result.encrypted.length).toBeGreaterThan(0);
      expect(result.iv.length).toBeGreaterThan(0);
      expect(result.authTag.length).toBeGreaterThan(0);
    });

    it('should produce different output for same plaintext (random IV)', () => {
      const result1 = encrypt(testPlaintext, validKey);
      const result2 = encrypt(testPlaintext, validKey);

      expect(result1.encrypted).not.toBe(result2.encrypted);
      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.authTag).not.toBe(result2.authTag);
    });

    it('should throw EncryptionError for invalid key size', () => {
      const shortKey = Buffer.alloc(16, 0x42);

      expect(() => encrypt(testPlaintext, shortKey)).toThrow(EncryptionError);
      expect(() => encrypt(testPlaintext, shortKey)).toThrow('Failed to encrypt data');
    });

    it('should throw EncryptionError for key longer than 32 bytes', () => {
      const longKey = Buffer.alloc(33, 0x42);

      expect(() => encrypt(testPlaintext, longKey)).toThrow(EncryptionError);
    });

    it('should handle empty string plaintext', () => {
      const result = encrypt('', validKey);

      expect(result).toBeDefined();
      expect(result.encrypted).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
    });

    it('should handle unicode characters in plaintext', () => {
      const unicodeText = '🎉 Hello 世界 ñ émojis! 🚀';
      const result = encrypt(unicodeText, validKey);

      expect(result).toBeDefined();
      const decrypted = decrypt(result, validKey);
      expect(decrypted).toBe(unicodeText);
    });

    it('should handle long plaintext', () => {
      const longText = 'A'.repeat(10000);
      const result = encrypt(longText, validKey);

      expect(result).toBeDefined();
      const decrypted = decrypt(result, validKey);
      expect(decrypted).toBe(longText);
    });
  });

  // ============================================================================
  // decrypt
  // ============================================================================
  describe('decrypt', () => {
    it('should decrypt encrypted data back to original plaintext', () => {
      const encrypted = encrypt(testPlaintext, validKey);
      const decrypted = decrypt(encrypted, validKey);

      expect(decrypted).toBe(testPlaintext);
    });

    it('should throw EncryptionError for wrong key', () => {
      const encrypted = encrypt(testPlaintext, validKey);
      const wrongKey = Buffer.alloc(32, 0x99);

      expect(() => decrypt(encrypted, wrongKey)).toThrow(EncryptionError);
      expect(() => decrypt(encrypted, wrongKey)).toThrow(
        'Failed to decrypt data - data may be corrupted or key is incorrect',
      );
    });

    it('should throw EncryptionError for invalid key size', () => {
      const encrypted = encrypt(testPlaintext, validKey);
      const shortKey = Buffer.alloc(16, 0x42);

      expect(() => decrypt(encrypted, shortKey)).toThrow(EncryptionError);
    });

    it('should throw EncryptionError for corrupted encrypted data', () => {
      const encrypted = encrypt(testPlaintext, validKey);
      encrypted.encrypted = encrypted.encrypted.substring(0, encrypted.encrypted.length - 4) + 'XXXX';

      expect(() => decrypt(encrypted, validKey)).toThrow(EncryptionError);
    });

    it('should throw EncryptionError for corrupted IV', () => {
      const encrypted = encrypt(testPlaintext, validKey);
      encrypted.iv = Buffer.from('invalid-iv').toString('base64');

      expect(() => decrypt(encrypted, validKey)).toThrow(EncryptionError);
    });

    it('should throw EncryptionError for corrupted auth tag', () => {
      const encrypted = encrypt(testPlaintext, validKey);
      encrypted.authTag = Buffer.from('bad-tag').toString('base64');

      expect(() => decrypt(encrypted, validKey)).toThrow(EncryptionError);
    });

    it('should throw EncryptionError for tampered auth tag', () => {
      const encrypted = encrypt(testPlaintext, validKey);
      // Flip a bit in the auth tag
      const authTagBytes = Buffer.from(encrypted.authTag, 'base64');
      authTagBytes[0] ^= 0xff;
      encrypted.authTag = authTagBytes.toString('base64');

      expect(() => decrypt(encrypted, validKey)).toThrow(EncryptionError);
    });
  });

  // ============================================================================
  // generateEncryptionKey
  // ============================================================================
  describe('generateEncryptionKey', () => {
    it('should generate a 32-byte key', () => {
      const key = generateEncryptionKey();

      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should generate different keys on each call', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1.equals(key2)).toBe(false);
    });

    it('should generate a key that passes validation', () => {
      const key = generateEncryptionKey();

      expect(isValidEncryptionKey(key)).toBe(true);
    });
  });

  // ============================================================================
  // isValidEncryptionKey
  // ============================================================================
  describe('isValidEncryptionKey', () => {
    it('should return true for valid 32-byte Buffer', () => {
      expect(isValidEncryptionKey(Buffer.alloc(32, 0x42))).toBe(true);
    });

    it('should return false for non-Buffer values', () => {
      expect(isValidEncryptionKey('string')).toBe(false);
      expect(isValidEncryptionKey(123)).toBe(false);
      expect(isValidEncryptionKey(null)).toBe(false);
      expect(isValidEncryptionKey(undefined)).toBe(false);
      expect(isValidEncryptionKey({})).toBe(false);
      expect(isValidEncryptionKey([])).toBe(false);
    });

    it('should return false for Buffer with wrong size', () => {
      expect(isValidEncryptionKey(Buffer.alloc(16))).toBe(false);
      expect(isValidEncryptionKey(Buffer.alloc(31))).toBe(false);
      expect(isValidEncryptionKey(Buffer.alloc(33))).toBe(false);
      expect(isValidEncryptionKey(Buffer.alloc(64))).toBe(false);
    });

    it('should return false for empty Buffer', () => {
      expect(isValidEncryptionKey(Buffer.alloc(0))).toBe(false);
    });
  });

  // ============================================================================
  // serializeEncrypted / deserializeEncrypted
  // ============================================================================
  describe('serializeEncrypted and deserializeEncrypted', () => {
    it('should serialize encrypted data to JSON string', () => {
      const encrypted = encrypt(testPlaintext, validKey);
      const json = serializeEncrypted(encrypted);

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('encrypted');
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('authTag');
    });

    it('should deserialize JSON string back to EncryptedData', () => {
      const encrypted = encrypt(testPlaintext, validKey);
      const json = serializeEncrypted(encrypted);
      const deserialized = deserializeEncrypted(json);

      expect(deserialized.encrypted).toBe(encrypted.encrypted);
      expect(deserialized.iv).toBe(encrypted.iv);
      expect(deserialized.authTag).toBe(encrypted.authTag);
    });

    it('should round-trip serialize and deserialize correctly', () => {
      const encrypted = encrypt(testPlaintext, validKey);
      const json = serializeEncrypted(encrypted);
      const deserialized = deserializeEncrypted(json);
      const decrypted = decrypt(deserialized, validKey);

      expect(decrypted).toBe(testPlaintext);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => deserializeEncrypted('not-json')).toThrow();
    });

    it('should throw error for JSON missing required fields', () => {
      expect(() => deserializeEncrypted('{"encrypted":"data"}')).toThrow(
        'Invalid encrypted data format',
      );
      expect(() => deserializeEncrypted('{"iv":"data","authTag":"tag"}')).toThrow(
        'Invalid encrypted data format',
      );
    });
  });

  // ============================================================================
  // isEncryptedData
  // ============================================================================
  describe('isEncryptedData', () => {
    it('should return true for valid EncryptedData', () => {
      const encrypted = encrypt(testPlaintext, validKey);
      expect(isEncryptedData(encrypted)).toBe(true);
    });

    it('should return false for null and undefined', () => {
      expect(isEncryptedData(null)).toBe(false);
      expect(isEncryptedData(undefined)).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(isEncryptedData('string')).toBe(false);
      expect(isEncryptedData(123)).toBe(false);
      expect(isEncryptedData(true)).toBe(false);
    });

    it('should return false for object missing required fields', () => {
      expect(isEncryptedData({ encrypted: 'data' })).toBe(false);
      expect(isEncryptedData({ iv: 'data', authTag: 'tag' })).toBe(false);
      expect(isEncryptedData({ encrypted: 'data', iv: 'data' })).toBe(false);
    });

    it('should return false for object with non-string fields', () => {
      expect(isEncryptedData({ encrypted: 123, iv: 'data', authTag: 'tag' })).toBe(false);
      expect(isEncryptedData({ encrypted: 'data', iv: 123, authTag: 'tag' })).toBe(false);
      expect(isEncryptedData({ encrypted: 'data', iv: 'data', authTag: 123 })).toBe(false);
    });
  });

  // ============================================================================
  // encryptionService
  // ============================================================================
  describe('encryptionService', () => {
    it('should expose encrypt and decrypt functions', () => {
      expect(typeof encryptionService.encrypt).toBe('function');
      expect(typeof encryptionService.decrypt).toBe('function');
    });

    it('should encrypt via service interface', () => {
      const result = encryptionService.encrypt(testPlaintext, validKey);

      expect(result).toBeDefined();
      expect(result.encrypted).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
    });

    it('should decrypt via service interface', () => {
      const encrypted = encryptionService.encrypt(testPlaintext, validKey);
      const decrypted = encryptionService.decrypt(encrypted, validKey);

      expect(decrypted).toBe(testPlaintext);
    });

    it('should throw EncryptionError via service interface for bad key', () => {
      const encrypted = encryptionService.encrypt(testPlaintext, validKey);
      const badKey = Buffer.alloc(32, 0x99);

      expect(() => encryptionService.decrypt(encrypted, badKey)).toThrow(EncryptionError);
    });
  });

  // ============================================================================
  // Integration / Round-trip
  // ============================================================================
  describe('Round-trip Integration', () => {
    it('should handle multiple encrypt/decrypt cycles', () => {
      const messages = [
        'First message',
        'Second message with ñ unicode',
        '🎉 Third message with emoji',
        '',
        'A'.repeat(5000),
      ];

      for (const message of messages) {
        const key = generateEncryptionKey();
        const encrypted = encrypt(message, key);
        const decrypted = decrypt(encrypted, key);
        expect(decrypted).toBe(message);
      }
    });

    it('should maintain data integrity across serialization', () => {
      const key = generateEncryptionKey();
      const encrypted = encrypt(testPlaintext, key);
      const json = serializeEncrypted(encrypted);
      const deserialized = deserializeEncrypted(json);
      const decrypted = decrypt(deserialized, key);

      expect(decrypted).toBe(testPlaintext);
    });
  });
});
