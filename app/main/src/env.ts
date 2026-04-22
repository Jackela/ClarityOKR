/**
 * Environment Configuration
 *
 * This module provides configuration for LLM services.
 * Delegates to the centralized config service for reading values.
 *
 * TODO: Consolidate secure storage integration with centralized config service.
 * The legacy secure storage code below is kept for backward compatibility
 * and should be migrated in a future wave.
 */

import { getConfig } from './config/app-config.js';

// TODO: Legacy secure storage imports - kept for backward compatibility
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
export function getLlmConfig(): LlmConfig {
  // TODO: Try secure storage first for backward compatibility
  try {
    const secureConfig = getActiveLlmConfig();
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
 *
 * TODO: Migrate to centralized config service in future wave.
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

// TODO: Re-export legacy secure storage functions for backward compatibility.
// These should be imported directly from secure-storage.service.js in new code.
export {
  getActiveLlmConfig,
  storeLlmConfig,
};
export type { SecureLlmConfig };
