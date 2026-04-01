import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

import { safeStorage } from 'electron';

import { decrypt, encrypt, type EncryptedData } from '../encryption.service.js';
import { SecureStorageError } from './secure-storage-error.js';
import type { SecureLlmConfig } from './secure-llm-config.js';
import { ensureConfigDir, getConfigFilePath } from './secure-storage-config.js';
import type { FallbackKeyProvider } from './fallback-key-provider.js';

/**
 * Manages LLM configuration storage and retrieval.
 *
 * Handles encryption and secure storage of API credentials using
 * safeStorage (production) or AES-256-GCM with fallback keys (CI/test).
 */
export class LlmConfigStore {
  constructor(private readonly fallbackProvider: FallbackKeyProvider) {}

  /**
   * Stores LLM configuration securely.
   *
   * Encrypts the configuration using safeStorage (or fallback in test environments)
   * and writes it to disk with restricted permissions (mode 0o600).
   *
   * @param config - The LLM configuration to store
   * @throws SecureStorageError if storage fails
   */
  store(config: SecureLlmConfig): void {
    try {
      ensureConfigDir();

      if (this.fallbackProvider.shouldUseFallbackKey()) {
        const fallbackKey = this.fallbackProvider.getFallbackEncryptionKey();
        const configJson = JSON.stringify(config);
        const encryptedData = encrypt(configJson, fallbackKey);
        const envelope = {
          version: 1,
          data: encryptedData,
          timestamp: new Date().toISOString(),
        };
        writeFileSync(getConfigFilePath(), JSON.stringify(envelope), { mode: 0o600 });
        return;
      }

      if (!safeStorage.isEncryptionAvailable()) {
        throw new SecureStorageError('Safe storage is not available. Cannot store configuration.');
      }

      const configJson = JSON.stringify(config);
      const encryptedConfig = safeStorage.encryptString(configJson);

      writeFileSync(getConfigFilePath(), encryptedConfig, { mode: 0o600 });
    } catch (error) {
      if (error instanceof SecureStorageError) {
        throw error;
      }
      throw new SecureStorageError('Failed to store LLM configuration', error);
    }
  }

  /**
   * Retrieves LLM configuration from secure storage.
   *
   * Decrypts and parses the stored configuration. Returns null if no
   * configuration has been stored yet.
   *
   * @returns The stored LLM configuration, or null if not found
   * @throws SecureStorageError if retrieval or decryption fails
   */
  retrieve(): SecureLlmConfig | null {
    try {
      const configFilePath = getConfigFilePath();

      if (!existsSync(configFilePath)) {
        return null;
      }

      if (this.fallbackProvider.shouldUseFallbackKey()) {
        const fallbackKey = this.fallbackProvider.getFallbackEncryptionKey();
        const fileContent = readFileSync(configFilePath, 'utf8');
        const envelope = JSON.parse(fileContent) as {
          data: EncryptedData;
        };
        const configJson = decrypt(envelope.data, fallbackKey);
        return JSON.parse(configJson) as SecureLlmConfig;
      }

      if (!safeStorage.isEncryptionAvailable()) {
        throw new SecureStorageError(
          'Safe storage is not available. Cannot retrieve configuration.',
        );
      }

      const encryptedConfig = readFileSync(configFilePath);
      const configJson = safeStorage.decryptString(encryptedConfig);

      return JSON.parse(configJson) as SecureLlmConfig;
    } catch (error) {
      if (error instanceof SecureStorageError) {
        throw error;
      }
      throw new SecureStorageError('Failed to retrieve LLM configuration', error);
    }
  }

  /**
   * Checks if LLM configuration exists in storage.
   *
   * @returns True if configuration file exists and is readable
   */
  hasConfig(): boolean {
    try {
      return existsSync(getConfigFilePath());
    } catch {
      return false;
    }
  }

  /**
   * Removes stored LLM configuration permanently.
   *
   * Deletes the encrypted configuration file. Safe to call even if
   * no configuration exists.
   *
   * @throws SecureStorageError if file deletion fails
   */
  clear(): void {
    try {
      const configFilePath = getConfigFilePath();
      if (existsSync(configFilePath)) {
        unlinkSync(configFilePath);
      }
    } catch (error) {
      throw new SecureStorageError('Failed to clear LLM configuration', error);
    }
  }
}
