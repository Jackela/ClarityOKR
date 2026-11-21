/**
 * Environment Configuration
 *
 * This module provides configuration for LLM services.
 * Delegates to the centralized config service for reading values.
 */

import { getConfig } from './config/app-config.js';

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
 * Returns LLM configuration.
 *
 * Attempts to read from secure storage first for backward compatibility,
 * then falls back to the centralized config service.
 *
 * @throws Error if no configuration is available
 */
export async function getLlmConfig(): Promise<LlmConfig> {
  try {
    const secureConfig = await getActiveLlmConfig();
    return {
      apiKey: secureConfig.apiKey,
      baseUrl: secureConfig.baseUrl,
      model: secureConfig.model,
    };
  } catch {
    // Fall back to centralized config service
    const cfg = getConfig().llm;
    return {
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
    };
  }
}

/**
 * Sets LLM configuration in secure storage.
 * @param config - The LLM configuration to store
 * @throws SecureStorageError if storage fails
 */
export async function setLlmConfig(config: SecureLlmConfig): Promise<void> {
  await storeLlmConfig(config);
}

/**
 * Checks if LLM configuration is available
 * @returns true if configuration exists
 */
export async function hasLlmConfiguration(): Promise<boolean> {
  try {
    await getLlmConfig();
    return true;
  } catch {
    return false;
  }
}

export { SecureStorageError };

export { getActiveLlmConfig, storeLlmConfig };
export type { SecureLlmConfig };
