import { SecureStorageError } from './secure-storage-error.js';
import type { SecureLlmConfig } from './secure-llm-config.js';
import { FallbackKeyProvider } from './fallback-key-provider.js';
import { MasterKeyManager } from './master-key-manager.js';
import { LlmConfigStore } from './llm-config-store.js';

// Singleton instances for backward-compatible function exports
const fallbackProvider = new FallbackKeyProvider();
const keyManager = new MasterKeyManager(fallbackProvider);
const configStore = new LlmConfigStore(fallbackProvider);

/**
 * Retrieves or creates the master encryption key.
 * @returns The 256-bit encryption key as a Buffer
 * @throws SecureStorageError if key cannot be retrieved or created
 * @deprecated Use MasterKeyManager.getOrCreateKey() instead
 */
export function getOrCreateMasterKey(): Buffer {
  return keyManager.getOrCreateKey();
}

/**
 * Stores LLM configuration securely.
 * @param config - The LLM configuration to store
 * @throws SecureStorageError if storage fails
 * @deprecated Use LlmConfigStore.store() instead
 */
export function storeLlmConfig(config: SecureLlmConfig): void {
  return configStore.store(config);
}

/**
 * Retrieves LLM configuration from secure storage.
 * @returns The stored LLM configuration, or null if not found
 * @throws SecureStorageError if retrieval or decryption fails
 * @deprecated Use LlmConfigStore.retrieve() instead
 */
export function retrieveLlmConfig(): SecureLlmConfig | null {
  return configStore.retrieve();
}

/**
 * Checks if LLM configuration exists in storage.
 * @returns True if configuration file exists and is readable
 * @deprecated Use LlmConfigStore.hasConfig() instead
 */
export function hasLlmConfig(): boolean {
  return configStore.hasConfig();
}

/**
 * Removes stored LLM configuration permanently.
 * @throws SecureStorageError if file deletion fails
 * @deprecated Use LlmConfigStore.clear() instead
 */
export function clearLlmConfig(): void {
  return configStore.clear();
}

/**
 * Sets fallback configuration for development and testing.
 * @param config - The fallback configuration to use
 * @deprecated Use FallbackKeyProvider.setFallbackConfig() instead
 */
export function setFallbackConfig(config: SecureLlmConfig): void {
  fallbackProvider.setFallbackConfig(config);
}

/**
 * Gets the active LLM configuration.
 * Searches multiple sources: secure storage, in-memory fallback, environment variables.
 * @returns The active LLM configuration
 * @throws SecureStorageError if no configuration is available
 * @deprecated Compose LlmConfigStore.retrieve() and FallbackKeyProvider for new code
 */
export function getActiveLlmConfig(): SecureLlmConfig {
  const secureConfig = configStore.retrieve();
  if (secureConfig) {
    return secureConfig;
  }

  const fallbackConfig = fallbackProvider.getFallbackConfig();
  if (fallbackConfig) {
    return fallbackConfig;
  }

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
