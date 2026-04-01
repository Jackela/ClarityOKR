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
 * configStore.store(config);
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
