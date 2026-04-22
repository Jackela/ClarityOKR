/**
 * Centralized Application Configuration
 *
 * Consolidates scattered configuration into a single, validated config service.
 * Uses Zod for runtime schema validation with environment variable loading.
 */

import { join } from 'node:path';
import { z } from 'zod';

const llmConfigSchema = z.object({
  apiKey: z.string().min(1, 'LLM API key is required'),
  baseUrl: z.string().url().default('https://api.openai.com'),
  model: z.string().default('gpt-4o-mini'),
  timeoutMs: z.coerce.number().int().positive().default(5000),
});

const appConfigSchema = z.object({
  llm: llmConfigSchema,
  dataDir: z.string().default(join(process.cwd(), 'data')),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

let configSingleton: AppConfig | null = null;

/**
 * Loads application configuration from environment variables.
 *
 * Environment variables:
 * - LLM_API_KEY (required)
 * - LLM_BASE_URL (default: https://api.openai.com)
 * - LLM_MODEL (default: gpt-4o-mini)
 * - LLM_TIMEOUT_MS (default: 5000)
 * - DATA_DIR (default: join(process.cwd(), 'data'))
 *
 * @throws Error if required configuration is missing or invalid
 */
export function loadConfig(): AppConfig {
  const raw = {
    llm: {
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL,
      timeoutMs: process.env.LLM_TIMEOUT_MS,
    },
    dataDir: process.env.DATA_DIR,
  };

  const result = appConfigSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }

  const cfg = result.data;
  cfg.llm.baseUrl = cfg.llm.baseUrl.replace(/\/$/, '');

  return cfg;
}

/**
 * Returns the singleton application configuration.
 * Lazily loads on first call. Use {@link resetConfig} to force reload.
 */
export function getConfig(): AppConfig {
  if (!configSingleton) {
    configSingleton = loadConfig();
  }
  return configSingleton;
}

/** Resets the configuration singleton for test environments. */
export function resetConfig(): void {
  configSingleton = null;
}
