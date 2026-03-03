import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const globalSetupPath = path.join(currentDir, 'global-setup.ts');

export default defineConfig({
  testDir: './specs',
  timeout: 120_000,
  retries: process.env.CI || process.env.ACT ? 2 : 0,
  workers: 1,
  fullyParallel: false,
  expect: {
    timeout: 15_000,
  },
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  globalSetup: globalSetupPath,
  reporter: [['list'], ...(process.env.CI ? ([['github']] as const) : [])],
});
