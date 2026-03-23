/**
 * Mock for secure-storage.service
 */

export class SecureStorageError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SecureStorageError';
  }
}

export interface SecureLlmConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export function getActiveLlmConfig(): SecureLlmConfig {
  return {
    apiKey: process.env.LLM_API_KEY || 'test-api-key',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
  };
}

export function storeLlmConfig(_config: SecureLlmConfig): void {
  // Mock implementation - does nothing
}

export function isEncryptionAvailable(): boolean {
  return true;
}
