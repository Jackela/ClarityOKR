export interface LlmConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

/**
 * Returns LLM configuration sourced from environment variables.
 * Secrets must only be read in the Electron main process.
 * Throws if the required API key is missing.
 */
export function getLlmConfig(): LlmConfig {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('LLM_API_KEY is required but was not found in environment');
  }
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  return { apiKey, baseUrl, model };
}
import 'dotenv/config';
