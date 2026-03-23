/**
 * Environment Configuration
 *
 * This module provides configuration for LLM services.
 * Secrets are securely stored using the system's keychain/credential manager.
 * For development/testing, environment variables can be used as fallback.
 */

import {
  getActiveLlmConfig,
  storeLlmConfig,
  SecureStorageError,
  type SecureLlmConfig,
} from './services/secure-storage.service.js';

/**
 * LLM Configuration interface
 */
export interface LlmConfig {
  /** The API key for LLM service */
  apiKey: string;
  /** Optional base URL for custom LLM endpoint */
  baseUrl?: string;
  /** Optional model name */
  model?: string;
}

/**
 * Returns LLM configuration from secure storage.
 * Falls back to environment variables for development/testing.
 * Secrets are only read in the Electron main process.
 * @throws SecureStorageError if no configuration is available
 */
export function getLlmConfig(): LlmConfig {
  const config = getActiveLlmConfig();
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  };
}

/**
 * Sets LLM configuration in secure storage.
 * @param config - The LLM configuration to store
 * @throws SecureStorageError if storage fails
 */
export function setLlmConfig(config: SecureLlmConfig): void {
  storeLlmConfig(config);
}

/**
 * Checks if LLM configuration is available
 * @returns true if configuration exists
 */
export function hasLlmConfiguration(): boolean {
  try {
    getLlmConfig();
    return true;
  } catch {
    return false;
  }
}

export { SecureStorageError };
