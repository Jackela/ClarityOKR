/**
 * Secure Storage Service
 *
 * Manages encryption keys and sensitive configuration using Electron's safeStorage API.
 * Keys are securely stored in the OS keychain/credential manager.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { safeStorage } from 'electron';

import { generateEncryptionKey, isValidEncryptionKey } from './encryption.service.js';

/**
 * Configuration for secure storage
 */
const SECURE_STORAGE_CONFIG = {
  /** Key file name for storing the encrypted key */
  keyFileName: 'encryption-key.enc',
  /** Config file name for LLM configuration */
  configFileName: 'llm-config.enc',
  /** Config directory name */
  configDir: '.clarityokr',
};

/**
 * Error thrown when secure storage operations fail
 */
export class SecureStorageError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SecureStorageError';
  }
}

/**
 * LLM Configuration interface
 */
export interface SecureLlmConfig {
  /** The API key for LLM service */
  apiKey: string;
  /** Optional base URL for custom LLM endpoint */
  baseUrl?: string;
  /** Optional model name */
  model?: string;
}

/**
 * Gets the config directory path
 * @returns Path to the config directory
 */
function getConfigDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    throw new SecureStorageError('Unable to determine home directory');
  }
  return join(homeDir, SECURE_STORAGE_CONFIG.configDir);
}

/**
 * Ensures the config directory exists
 */
function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { mode: 0o700, recursive: true });
  }
}

/**
 * Gets the path to the key file
 * @returns Path to the encryption key file
 */
function getKeyFilePath(): string {
  return join(getConfigDir(), SECURE_STORAGE_CONFIG.keyFileName);
}

/**
 * Gets the path to the config file
 * @returns Path to the LLM config file
 */
function getConfigFilePath(): string {
  return join(getConfigDir(), SECURE_STORAGE_CONFIG.configFileName);
}

/**
 * Checks if safeStorage is available
 * @returns true if safeStorage can be used
 */
export function isSafeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/**
 * Retrieves or creates the master encryption key.
 * On first run, generates a new key and stores it using safeStorage.
 * On subsequent runs, retrieves the key from secure storage.
 * @returns The 256-bit encryption key
 * @throws SecureStorageError if key cannot be retrieved or created
 */
export function getOrCreateMasterKey(): Buffer {
  try {
    ensureConfigDir();
    const keyFilePath = getKeyFilePath();

    // Check if key already exists
    if (existsSync(keyFilePath)) {
      // Read and decrypt the key
      const encryptedKey = readFileSync(keyFilePath);

      if (!safeStorage.isEncryptionAvailable()) {
        throw new SecureStorageError('Safe storage is not available. Cannot decrypt key.');
      }

      const decryptedKey = safeStorage.decryptString(encryptedKey);
      const keyBuffer = Buffer.from(decryptedKey, 'base64');

      if (!isValidEncryptionKey(keyBuffer)) {
        throw new SecureStorageError('Invalid encryption key retrieved from storage');
      }

      return keyBuffer;
    }

    // Generate new key on first run
    const newKey = generateEncryptionKey();

    if (!safeStorage.isEncryptionAvailable()) {
      throw new SecureStorageError(
        'Safe storage is not available. Cannot securely store encryption key. ' +
          'This may happen on Linux without a keyring service or on systems without ' +
          'proper credential storage. Please ensure your system has a keychain or ' +
          'credential manager installed.',
      );
    }

    // Encrypt and store the key
    const encryptedKey = safeStorage.encryptString(newKey.toString('base64'));
    writeFileSync(keyFilePath, encryptedKey, { mode: 0o600 });

    return newKey;
  } catch (error) {
    if (error instanceof SecureStorageError) {
      throw error;
    }
    throw new SecureStorageError('Failed to get or create master key', error);
  }
}

/**
 * Stores LLM configuration securely
 * @param config - The LLM configuration to store
 * @throws SecureStorageError if storage fails
 */
export function storeLlmConfig(config: SecureLlmConfig): void {
  try {
    ensureConfigDir();

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
 * Retrieves LLM configuration from secure storage
 * @returns The stored LLM configuration, or null if not found
 * @throws SecureStorageError if retrieval fails
 */
export function retrieveLlmConfig(): SecureLlmConfig | null {
  try {
    const configFilePath = getConfigFilePath();

    if (!existsSync(configFilePath)) {
      return null;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      throw new SecureStorageError('Safe storage is not available. Cannot retrieve configuration.');
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
 * Checks if LLM configuration is stored
 * @returns true if configuration exists
 */
export function hasLlmConfig(): boolean {
  try {
    return existsSync(getConfigFilePath());
  } catch {
    return false;
  }
}

/**
 * Removes stored LLM configuration
 * @throws SecureStorageError if removal fails
 */
export function clearLlmConfig(): void {
  try {
    const configFilePath = getConfigFilePath();
    if (existsSync(configFilePath)) {
      unlinkSync(configFilePath);
    }
  } catch (error) {
    throw new SecureStorageError('Failed to clear LLM configuration', error);
  }
}

/**
 * Fallback configuration for when secure storage is unavailable.
 * Only use this in development or testing environments.
 */
let fallbackConfig: SecureLlmConfig | null = null;

/**
 * Sets fallback configuration (for development/testing only)
 * @param config - The fallback configuration
 */
export function setFallbackConfig(config: SecureLlmConfig): void {
  fallbackConfig = config;
}

/**
 * Gets the active LLM configuration.
 * First tries secure storage, then falls back to environment variables (for dev/testing).
 * @returns The LLM configuration
 * @throws SecureStorageError if no configuration is available
 */
export function getActiveLlmConfig(): SecureLlmConfig {
  // Try secure storage first
  const secureConfig = retrieveLlmConfig();
  if (secureConfig) {
    return secureConfig;
  }

  // Check for fallback (development/testing)
  if (fallbackConfig) {
    return fallbackConfig;
  }

  // Legacy: check environment variables (for migration/development)
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (apiKey) {
    return {
      apiKey,
      baseUrl: process.env.LLM_BASE_URL?.trim(),
      model: process.env.LLM_MODEL?.trim(),
    };
  }

  throw new SecureStorageError(
    'No LLM configuration found. Please configure your LLM API key in settings.',
  );
}
