/**
 * Encryption Port - Core Interface
 *
 * Defines the contract for encryption services. This port lives in the core layer
 * to enable dependency inversion: the persistence layer depends on this interface,
 * while the services layer provides the implementation.
 */

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
 * Encryption service contract.
 * Implementations provide AES-256-GCM (or equivalent) encryption.
 */
export interface IEncryptionService {
  /**
   * Encrypts plaintext using the provided key.
   * @param plaintext - The data to encrypt
   * @param key - The encryption key (32 bytes for AES-256)
   * @returns Encrypted data with IV and auth tag
   * @throws EncryptionError if encryption fails
   */
  encrypt(plaintext: string, key: Buffer): EncryptedData;

  /**
   * Decrypts encrypted data using the provided key.
   * @param encryptedData - The encrypted data with IV and auth tag
   * @param key - The encryption key (32 bytes for AES-256)
   * @returns The decrypted plaintext
   * @throws EncryptionError if decryption fails
   */
  decrypt(encryptedData: EncryptedData, key: Buffer): string;
}
