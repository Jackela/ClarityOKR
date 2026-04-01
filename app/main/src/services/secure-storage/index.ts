export { SecureStorageError } from './secure-storage-error.js';
export type { SecureLlmConfig } from './secure-llm-config.js';
export {
  isSafeStorageAvailable,
  getConfigDir,
  ensureConfigDir,
  getKeyFilePath,
  getConfigFilePath,
} from './secure-storage-config.js';

export { FallbackKeyProvider } from './fallback-key-provider.js';
export { MasterKeyManager } from './master-key-manager.js';
export { LlmConfigStore } from './llm-config-store.js';

// Facade for backward compatibility
export {
  getOrCreateMasterKey,
  storeLlmConfig,
  retrieveLlmConfig,
  hasLlmConfig,
  clearLlmConfig,
  setFallbackConfig,
  getActiveLlmConfig,
} from './secure-storage-facade.js';
