import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { generateEncryptionKey, isValidEncryptionKey } from '../encryption.service.js';
import { SecureStorageError } from './secure-storage-error.js';
import { ensureConfigDir, getKeyFilePath } from './secure-storage-config.js';
import type { FallbackKeyProvider } from './fallback-key-provider.js';
import {
  decryptStringWithSafeStorage,
  encryptStringWithSafeStorage,
} from './safe-storage-crypto.js';

/**
 * Manages the master encryption key lifecycle.
 *
 * Handles secure generation, storage, and retrieval of the 256-bit master key
 * using the OS credential manager (via Electron safeStorage) or fallback
 * mechanisms for CI/test environments.
 */
export class MasterKeyManager {
  constructor(private readonly fallbackProvider: FallbackKeyProvider) {}

  /**
   * Retrieves or creates the master encryption key.
   *
   * On first run: Generates a new 256-bit key and stores it using safeStorage.
   * On subsequent runs: Retrieves and decrypts the key from secure storage.
   *
   * In CI/E2E environments, falls back to a key derived from environment variables.
   *
   * @returns The 256-bit encryption key as a Buffer
   * @throws SecureStorageError if key cannot be retrieved or created
   */
  async getOrCreateKey(): Promise<Buffer> {
    try {
      ensureConfigDir();
      const keyFilePath = getKeyFilePath();

      if (this.fallbackProvider.shouldUseFallbackKey()) {
        return this.fallbackProvider.getFallbackEncryptionKey();
      }

      if (existsSync(keyFilePath)) {
        const encryptedKey = readFileSync(keyFilePath);
        const decryptedKey = await decryptStringWithSafeStorage(encryptedKey, (next) => {
          writeFileSync(keyFilePath, next, { mode: 0o600 });
        });
        const keyBuffer = Buffer.from(decryptedKey, 'base64');

        if (!isValidEncryptionKey(keyBuffer)) {
          throw new SecureStorageError('Invalid encryption key retrieved from storage');
        }

        return keyBuffer;
      }

      const newKey = generateEncryptionKey();
      const encryptedKey = await encryptStringWithSafeStorage(newKey.toString('base64'));
      writeFileSync(keyFilePath, encryptedKey, { mode: 0o600 });

      return newKey;
    } catch (error) {
      if (error instanceof SecureStorageError) {
        throw error;
      }
      throw new SecureStorageError('Failed to get or create master key', error);
    }
  }
}
