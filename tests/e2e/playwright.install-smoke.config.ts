import { defineConfig } from '@playwright/test';

/**
 * #45 install smoke: drives an app that a real installer put on disk (NSIS / dmg / deb /
 * AppImage), not the dev build. Run by .github/workflows/install-smoke.yml with
 * SMOKE_APP_EXECUTABLE pointing at the installed executable. No global setup, no build step.
 */
export default defineConfig({
  testDir: './install-smoke',
  testMatch: ['**/*.smoke.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  // The x64 build on Apple silicon runs under Rosetta (see SLOW in the spec).
  expect: { timeout: process.env.SMOKE_LABEL === 'mac-x64' ? 150_000 : 30_000 },
  outputDir: process.env.SMOKE_ARTIFACTS_DIR
    ? `${process.env.SMOKE_ARTIFACTS_DIR}/test-results`
    : 'test-results/install-smoke',
  reporter: [['list'], ...(process.env.CI ? ([['github']] as const) : [])],
});
