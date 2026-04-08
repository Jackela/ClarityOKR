import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';

import { safeStorage } from 'electron';

import type { SecureLlmConfig } from './secure-llm-config.js';

/**
 * Provides fallback encryption keys for CI/E2E environments where safeStorage
 * is unavailable. Derives keys from environment variables using PBKDF2.
 */
export class FallbackKeyProvider {
  private fallbackConfig: SecureLlmConfig | null = null;

  /**
   * Checks if we should use a fallback encryption key instead of safeStorage.
   *
   * Returns true in CI/E2E environments where safeStorage is unavailable
   * or when explicitly configured via environment variables.
   *
   * @returns True if fallback key should be used
   */
  shouldUseFallbackKey(): boolean {
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
   * In CI environments without E2E_FALLBACK_KEY_SEED, uses a deterministic
   * seed to ensure tests can decrypt data across repository instances.
   *
   * @returns A 256-bit encryption key derived from environment
   */
  getFallbackEncryptionKey(): Buffer {
    // Use explicit seed if provided, otherwise use deterministic seed in CI
    // or random seed in other environments
    let seed: string;
    if (process.env.E2E_FALLBACK_KEY_SEED) {
      seed = process.env.E2E_FALLBACK_KEY_SEED;
    } else if (process.env.CI === 'true' || process.env.E2E_TEST === 'true') {
      seed = 'ci-test-deterministic-seed-v1';
    } else {
      seed = randomBytes(32).toString('hex');
    }
    const salt = createHash('sha256').update(seed).digest().subarray(0, 16);
    return pbkdf2Sync(seed, salt, 100000, 32, 'sha256');
  }

  /**
   * Sets fallback configuration for development and testing.
   *
   * This allows temporary configuration without writing to secure storage.
   * Use only in development environments.
   *
   * @param config - The fallback configuration to use
   */
  setFallbackConfig(config: SecureLlmConfig): void {
    this.fallbackConfig = config;
  }

  /**
   * Gets the fallback configuration if set.
   *
   * @returns The fallback configuration or null
   */
  getFallbackConfig(): SecureLlmConfig | null {
    return this.fallbackConfig;
  }

  /**
   * Clears the fallback configuration.
   */
  clearFallbackConfig(): void {
    this.fallbackConfig = null;
  }
}
