import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { safeStorage } from 'electron';

import { SecureStorageError } from './secure-storage-error.js';

/**
 * Configuration for secure storage paths and filenames.
 *
 * These paths are relative to the user's home directory under .clarityokr/
 */
export const SECURE_STORAGE_CONFIG = {
  /** Key file name for storing the encrypted master key */
  keyFileName: 'encryption-key.enc',
  /** Config file name for storing encrypted LLM configuration */
  configFileName: 'llm-config.enc',
  /** Config directory name in user's home directory */
  configDir: '.clarityokr',
};

/**
 * Gets the config directory path.
 *
 * Creates a .clarityokr directory in the user's home folder for storing
 * encrypted configuration files.
 *
 * @returns Path to the config directory
 * @throws SecureStorageError if the home directory cannot be determined
 */
export function getConfigDir(): string {
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
export function ensureConfigDir(): void {
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
export function getKeyFilePath(): string {
  return join(getConfigDir(), SECURE_STORAGE_CONFIG.keyFileName);
}

/**
 * Gets the path to the encrypted LLM config file.
 *
 * @returns Path to the LLM config file
 */
export function getConfigFilePath(): string {
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
