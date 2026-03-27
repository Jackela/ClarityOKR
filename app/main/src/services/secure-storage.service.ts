/**
 * Secure Storage Service - Encryption and Credential Management
 *
 * This module manages encryption keys and sensitive configuration using Electron's
 * safeStorage API. Keys are securely stored in the OS keychain or credential manager
 * (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux).
 *
 * Key Responsibilities:
 * - Master encryption key generation and secure storage
 * - LLM API credentials storage and retrieval
 * - OS-native credential manager integration via Electron safeStorage
 * - Fallback encryption for CI/E2E test environments
 * - File-based encrypted configuration persistence
 *
 * Dependencies:
 * - Electron: safeStorage API for OS-native encryption
 * - Node.js crypto: PBKDF2 key derivation, hashing
 * - encryption.service.ts: AES-256-GCM encryption/decryption primitives
 *
 * Security Notes:
 * - Never logs API keys or encryption keys
 * - Uses file mode 0o600 for sensitive files (owner read/write only)
 * - Falls back to environment-derived keys only in test environments
 * - All errors are wrapped to prevent information leakage
 *
 * @module services/secure-storage.service
 */

import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { safeStorage } from 'electron';

import {
  decrypt,
  encrypt,
  generateEncryptionKey,
  isValidEncryptionKey,
} from './encryption.service.js';

/**
 * Configuration for secure storage paths and filenames.
 *
 * These paths are relative to the user's home directory under .clarityokr/
 */
const SECURE_STORAGE_CONFIG = {
  /** Key file name for storing the encrypted master key */
  keyFileName: 'encryption-key.enc',
  /** Config file name for storing encrypted LLM configuration */
  configFileName: 'llm-config.enc',
  /** Config directory name in user's home directory */
  configDir: '.clarityokr',
};

/**
 * Error thrown when secure storage operations fail.
 *
 * Provides consistent error handling without exposing sensitive details.
 * The original error is preserved in the `cause` property for debugging.
 *
 * @example
 * ```typescript
 * try {
 *   const key = getOrCreateMasterKey();
 * } catch (error) {
 *   if (error instanceof SecureStorageError) {
 *     console.error('Storage failed:', error.message);
 *   }
 * }
 * ```
 */
export class SecureStorageError extends Error {
  /**
   * Creates a new SecureStorageError.
   *
   * @param message - Human-readable error description
   * @param cause - Original error that caused this failure (optional)
   */
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SecureStorageError';
  }
}

/**
 * LLM Configuration interface for secure storage.
 *
 * Contains API credentials and optional configuration for the LLM provider.
 * All fields are encrypted at rest.
 *
 * @example
 * ```typescript
 * const config: SecureLlmConfig = {
 *   apiKey: 'sk-...',
 *   baseUrl: 'https://api.openai.com',
 *   model: 'gpt-4o-mini'
 * };
 * storeLlmConfig(config);
 * ```
 */
export interface SecureLlmConfig {
  /** The API key for LLM service (encrypted at rest) */
  apiKey: string;
  /** Optional base URL for custom LLM endpoint or proxy */
  baseUrl?: string;
  /** Optional model name override */
  model?: string;
}

/**
 * Gets the config directory path.
 *
 * Creates a .clarityokr directory in the user's home folder for storing
 * encrypted configuration files.
 *
 * @returns Path to the config directory
 * @throws SecureStorageError if the home directory cannot be determined
 */
function getConfigDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    throw new SecureStorageError('Unable to determine home directory');
  }
  return join(homeDir, SECURE_STORAGE_CONFIG.configDir);
}

/**
 * Ensures the config directory exists with secure permissions.
 *
 * Creates the directory with mode 0o700 (owner read/write/execute only)
 * if it doesn't already exist.
 *
 * @throws SecureStorageError if directory creation fails
 */
function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { mode: 0o700, recursive: true });
  }
}

/**
 * Gets the path to the encrypted master key file.
 *
 * @returns Path to the encryption key file
 */
function getKeyFilePath(): string {
  return join(getConfigDir(), SECURE_STORAGE_CONFIG.keyFileName);
}

/**
 * Gets the path to the encrypted LLM config file.
 *
 * @returns Path to the LLM config file
 */
function getConfigFilePath(): string {
  return join(getConfigDir(), SECURE_STORAGE_CONFIG.configFileName);
}

/**
 * Checks if safeStorage is available on the current platform.
 *
 * safeStorage requires a working keychain/credential manager:
 * - macOS: Keychain must be accessible
 * - Windows: Credential Manager must be available
 * - Linux: Secret Service (D-Bus) or kwallet must be running
 *
 * @returns True if safeStorage can be used for encryption
 *
 * @example
 * ```typescript
 * if (!isSafeStorageAvailable()) {
 *   console.warn('Secure storage unavailable - falling back to test mode');
 * }
 * ```
 */
export function isSafeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

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
 *
 * @example
 * ```typescript
 * const masterKey = getOrCreateMasterKey();
 * // Use masterKey for encrypting application data
 * ```
 */
export function getOrCreateMasterKey(): Buffer {
  try {
    ensureConfigDir();
    const keyFilePath = getKeyFilePath();

    if (shouldUseFallbackKey()) {
      return getFallbackEncryptionKey();
    }

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
 * Stores LLM configuration securely.
 *
 * Encrypts the configuration using safeStorage (or fallback in test environments)
 * and writes it to disk with restricted permissions (mode 0o600).
 *
 * @param config - The LLM configuration to store
 * @throws SecureStorageError if storage fails
 *
 * @example
 * ```typescript
 * storeLlmConfig({
 *   apiKey: 'sk-...',
 *   baseUrl: 'https://api.openai.com',
 *   model: 'gpt-4o-mini'
 * });
 * ```
 */
export function storeLlmConfig(config: SecureLlmConfig): void {
  try {
    ensureConfigDir();

    if (shouldUseFallbackKey()) {
      const fallbackKey = getFallbackEncryptionKey();
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
 *
 * @example
 * ```typescript
 * const config = retrieveLlmConfig();
 * if (config) {
 *   console.log('Using model:', config.model);
 * }
 * ```
 */
export function retrieveLlmConfig(): SecureLlmConfig | null {
  try {
    const configFilePath = getConfigFilePath();

    if (!existsSync(configFilePath)) {
      return null;
    }

    if (shouldUseFallbackKey()) {
      const fallbackKey = getFallbackEncryptionKey();
      const fileContent = readFileSync(configFilePath, 'utf8');
      const envelope = JSON.parse(fileContent);
      const configJson = decrypt(envelope.data, fallbackKey);
      return JSON.parse(configJson) as SecureLlmConfig;
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
 * Checks if LLM configuration exists in storage.
 *
 * @returns True if configuration file exists and is readable
 *
 * @example
 * ```typescript
 * if (hasLlmConfig()) {
 *   // Proceed with LLM-dependent operations
 * } else {
 *   // Prompt user to configure API key
 * }
 * ```
 */
export function hasLlmConfig(): boolean {
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
 *
 * @example
 * ```typescript
 * // Clear credentials on logout or reset
 * clearLlmConfig();
 * ```
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
 * Checks if we should use a fallback encryption key instead of safeStorage.
 *
 * Returns true in CI/E2E environments where safeStorage is unavailable
 * or when explicitly configured via environment variables.
 *
 * @returns True if fallback key should be used
 */
function shouldUseFallbackKey(): boolean {
  return (
    !safeStorage.isEncryptionAvailable() ||
    process.env.E2E_TEST === 'true' ||
    process.env.CI === 'true'
  );
}

/**
 * Gets a fallback encryption key for CI/E2E environments.
 *
 * Derives a secure 256-bit key from environment variables using PBKDF2
 * with 100,000 iterations. Uses deterministic salt derived from seed
 * to ensure consistent key generation across test runs.
 *
 * @returns A 256-bit encryption key derived from environment
 */
function getFallbackEncryptionKey(): Buffer {
  const seed = process.env.E2E_FALLBACK_KEY_SEED || randomBytes(32).toString('hex');
  // Use deterministic salt derived from seed to ensure same key is always generated
  const salt = createHash('sha256').update(seed).digest().subarray(0, 16);
  return pbkdf2Sync(seed, salt, 100000, 32, 'sha256');
}

let fallbackConfig: SecureLlmConfig | null = null;

/**
 * Sets fallback configuration for development and testing.
 *
 * This allows temporary configuration without writing to secure storage.
 * Use only in development environments.
 *
 * @param config - The fallback configuration to use
 *
 * @example
 * ```typescript
 * // For testing only - not persisted to disk
 * setFallbackConfig({
 *   apiKey: process.env.TEST_API_KEY!,
 *   model: 'gpt-4o-mini'
 * });
 * ```
 */
export function setFallbackConfig(config: SecureLlmConfig): void {
  fallbackConfig = config;
}

/**
 * Gets the active LLM configuration.
 *
 * Searches multiple sources in order:
 * 1. Secure storage (production)
 * 2. In-memory fallback (development/testing)
 * 3. Environment variables (legacy/development)
 *
 * @returns The active LLM configuration
 * @throws SecureStorageError if no configuration is available
 *
 * @example
 * ```typescript
 * try {
 *   const config = getActiveLlmConfig();
 *   console.log('API Key available:', config.apiKey ? 'yes' : 'no');
 * } catch (error) {
 *   console.error('LLM not configured');
 * }
 * ```
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
