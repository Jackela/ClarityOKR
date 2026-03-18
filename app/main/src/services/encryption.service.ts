/**
 * Data Encryption Service
 *
 * Provides AES-256-GCM encryption for sensitive data at rest.
 * Uses Node.js crypto module for cryptographic operations.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';

/**
 * Encrypted data format with IV and auth tag
 */
export interface EncryptedData {
  /** Base64-encoded encrypted data */
  encrypted: string;
  /** Base64-encoded initialization vector (16 bytes) */
  iv: string;
  /** Base64-encoded authentication tag (16 bytes for GCM) */
  authTag: string;
}

/**
 * Encryption configuration
 */
const ENCRYPTION_CONFIG = {
  /** AES-256-GCM algorithm */
  algorithm: 'aes-256-gcm' as const,
  /** Key size in bytes (256 bits) */
  keySize: 32,
  /** IV size in bytes (96 bits for GCM) */
  ivSize: 16,
  /** Auth tag size in bytes (128 bits for GCM) */
  authTagSize: 16,
};

/**
 * Error thrown when encryption/decryption fails
 */
export class EncryptionError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'EncryptionError';
  }
}

/**
 * Encrypts data using AES-256-GCM
 * @param plaintext - The data to encrypt
 * @param key - The encryption key (32 bytes for AES-256)
 * @returns Encrypted data with IV and auth tag
 * @throws EncryptionError if encryption fails
 */
export function encrypt(plaintext: string, key: Buffer): EncryptedData {
  try {
    // Validate key size
    if (key.length !== ENCRYPTION_CONFIG.keySize) {
      throw new Error(
        `Invalid key size: expected ${ENCRYPTION_CONFIG.keySize} bytes, got ${key.length}`,
      );
    }

    // Generate random IV
    const iv = randomBytes(ENCRYPTION_CONFIG.ivSize);

    // Create cipher
    const cipher: CipherGCM = createCipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);

    // Encrypt data
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  } catch (error) {
    throw new EncryptionError('Failed to encrypt data', error);
  }
}

/**
 * Decrypts data using AES-256-GCM
 * @param encryptedData - The encrypted data with IV and auth tag
 * @param key - The encryption key (32 bytes for AES-256)
 * @returns The decrypted plaintext
 * @throws EncryptionError if decryption fails
 */
export function decrypt(encryptedData: EncryptedData, key: Buffer): string {
  try {
    // Validate key size
    if (key.length !== ENCRYPTION_CONFIG.keySize) {
      throw new Error(
        `Invalid key size: expected ${ENCRYPTION_CONFIG.keySize} bytes, got ${key.length}`,
      );
    }

    // Decode IV and auth tag from base64
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');

    // Validate sizes
    if (iv.length !== ENCRYPTION_CONFIG.ivSize) {
      throw new Error(
        `Invalid IV size: expected ${ENCRYPTION_CONFIG.ivSize} bytes, got ${iv.length}`,
      );
    }
    if (authTag.length !== ENCRYPTION_CONFIG.authTagSize) {
      throw new Error(
        `Invalid auth tag size: expected ${ENCRYPTION_CONFIG.authTagSize} bytes, got ${authTag.length}`,
      );
    }

    // Create decipher
    const decipher: DecipherGCM = createDecipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt data
    let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new EncryptionError(
      'Failed to decrypt data - data may be corrupted or key is incorrect',
      error,
    );
  }
}

/**
 * Generates a new 256-bit encryption key
 * @returns A random 32-byte key
 */
export function generateEncryptionKey(): Buffer {
  return randomBytes(ENCRYPTION_CONFIG.keySize);
}

/**
 * Validates that a buffer is a valid encryption key
 * @param key - The key to validate
 * @returns true if the key is valid
 */
export function isValidEncryptionKey(key: unknown): key is Buffer {
  return Buffer.isBuffer(key) && key.length === ENCRYPTION_CONFIG.keySize;
}

/**
 * Serializes encrypted data to a JSON string
 * @param data - The encrypted data
 * @returns JSON string representation
 */
export function serializeEncrypted(data: EncryptedData): string {
  return JSON.stringify(data);
}

/**
 * Deserializes encrypted data from a JSON string
 * @param json - The JSON string
 * @returns The encrypted data object
 * @throws Error if the JSON is invalid
 */
export function deserializeEncrypted(json: string): EncryptedData {
  const parsed = JSON.parse(json) as unknown;

  if (!isEncryptedData(parsed)) {
    throw new Error('Invalid encrypted data format');
  }

  return parsed;
}

/**
 * Type guard to check if a value is valid EncryptedData
 * @param value - The value to check
 * @returns true if the value is valid EncryptedData
 */
export function isEncryptedData(value: unknown): value is EncryptedData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'encrypted' in value &&
    'iv' in value &&
    'authTag' in value &&
    typeof (value as Record<string, unknown>).encrypted === 'string' &&
    typeof (value as Record<string, unknown>).iv === 'string' &&
    typeof (value as Record<string, unknown>).authTag === 'string'
  );
}
