import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 90_000,
  retries: process.env.CI || process.env.ACT ? 2 : 0,
  workers: 1,
  expect: {
    timeout: 10_000
  },
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});
