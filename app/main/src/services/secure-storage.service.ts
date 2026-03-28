/**
 * Secure Storage Service - Encryption and Credential Management
 *
 * This module has been refactored into focused services:
 * - MasterKeyManager: Master encryption key lifecycle
 * - LlmConfigStore: LLM configuration storage and retrieval
 * - FallbackKeyProvider: Fallback keys for CI/test environments
 *
 * Import from './secure-storage/' for new code or use these backward-compatible exports.
 *
 * @module services/secure-storage.service
 * @deprecated Import from './secure-storage/index.js' for new code
 */

// Re-export all public APIs for backward compatibility
export {
  SecureStorageError,
  SecureLlmConfig,
  isSafeStorageAvailable,
  FallbackKeyProvider,
  MasterKeyManager,
  LlmConfigStore,
  getOrCreateMasterKey,
  storeLlmConfig,
  retrieveLlmConfig,
  hasLlmConfig,
  clearLlmConfig,
  setFallbackConfig,
  getActiveLlmConfig,
} from './secure-storage/index.js';

export type { SecureLlmConfig } from './secure-storage/index.js';
