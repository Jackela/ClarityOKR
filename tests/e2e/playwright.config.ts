import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const globalSetupPath = path.join(currentDir, 'global-setup.ts');

/**
 * Unified timeout configuration for all E2E tests.
 * Use these constants instead of magic numbers.
 */
export const TIMEOUTS = {
  /** Very fast operations (ms) */
  immediate: 500,
  /** Fast operations like button clicks (ms) - increased to 8000ms for loading detection */
  fast: 8000,
  /** Standard operations (ms) */
  standard: 15000,
  /** Slow operations like loading indicators (ms) */
  slow: 30000,
  /** Very slow operations like initial app launch (ms) */
  verySlow: 60000,
  /** Maximum timeout for long operations (ms) */
  maximum: 120000,
} as const;

export default defineConfig({
  testDir: './specs',
  // Global timeout for each test
  timeout: TIMEOUTS.maximum,
  // Retry configuration: CI=1 retry, local=0 retries
  retries: process.env.CI || process.env.ACT ? 1 : 0,
  // Workers configuration: CI=1 worker (sequential to avoid port conflicts), local=auto
  workers: process.env.CI ? 1 : undefined,
  // Disable parallel execution to ensure port 7777 is not shared
  fullyParallel: false,
  expect: {
    // Default assertion timeout
    timeout: TIMEOUTS.standard,
  },
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'on-first-retry',
    actionTimeout: TIMEOUTS.standard,
    navigationTimeout: TIMEOUTS.slow,
  },
  globalSetup: globalSetupPath,
  reporter: [['list'], ...(process.env.CI ? ([['github']] as const) : [])],
});
