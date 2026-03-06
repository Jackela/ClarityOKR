import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { existsSync, promises as fs } from 'node:fs';
import {
  ROOT,
  SESSION_PERSIST_PATH,
  OKR_PERSIST_PATH,
  extraElectronArgs,
  getElectronEnv,
  ensureBuildArtifacts,
} from '../helpers/build-check';
import {
  startMSWServer,
  stopMSWServer,
  resetMSWServer,
  setMockResponses,
  getRequestLog,
} from '../mocks/server';
import type { MockResponseConfig } from '@clarityokr/contracts';

/**
 * E2E test fixtures interface.
 * Defines all available fixtures for E2E tests.
 */
type E2EFixtures = {
  /**
   * Mock server for controlling LLM API responses.
   * Uses MSW (Mock Service Worker) to intercept HTTP requests.
   * Each test gets a fresh mock configuration.
   */
  mockServer: {
    /** The URL of the mock server (kept for backward compatibility) */
    url: string;
    /** Configure response behavior */
    setResponses: (config: MockResponseConfig) => void;
    /** Get the log of all requests made to the server */
    getRequestLog: () => Array<{ method: string; url: string; body: unknown; timestamp: number }>;
  };

  /**
   * Electron application instance.
   * Automatically started before each test and cleaned up after.
   */
  electronApp: ElectronApplication;

  /**
   * Main window page object.
   * Provides access to the main application window.
   */
  mainWindow: Page;

  /**
   * Test bridge for accessing Electron internals.
   * @deprecated Reserved for future use. Currently use electronApp directly.
   */
  testBridge: {
    /**
     * Evaluate code in the main process context.
     * Uses the same signature as ElectronApplication.evaluate.
     * @param fn - Function to execute in main process
     * @param arg - Optional argument to pass to the function
     */
    evaluate: ElectronApplication['evaluate'];
  };
};

/**
 * Clean up persistence files between tests.
 * Removes session and OKR data files to ensure test isolation.
 */
export async function cleanupPersistenceFiles(): Promise<void> {
  const cleanupTargets = [SESSION_PERSIST_PATH, OKR_PERSIST_PATH];
  await Promise.all(
    cleanupTargets.map(async (target) => {
      if (existsSync(target)) {
        await fs.unlink(target);
      }
    }),
  );
}

/**
 * Enhanced test fixture with MSW-based mocking.
 *
 * Key improvements:
 * - MSW (Mock Service Worker) for type-safe HTTP mocking
 * - No HTTP server needed - intercepts at network level
 * - Automatic cleanup on test failure
 * - Better error handling and logging
 */
export const test = base.extend<E2EFixtures>({
  // Mock server fixture - uses MSW for HTTP interception
  mockServer: [
    async ({}, use) => {
      // Start MSW server if not already running
      startMSWServer();

      // Reset handlers for fresh state
      resetMSWServer();

      await use({
        // URL kept for backward compatibility with existing tests
        url: process.env.LLM_BASE_URL || 'http://127.0.0.1:7777',
        setResponses: (config: MockResponseConfig) => setMockResponses(config),
        getRequestLog: () => getRequestLog(),
      });

      // Reset handlers after test for isolation
      resetMSWServer();
    },
    { scope: 'test' },
  ],

  // Electron application fixture
  electronApp: [
    async ({ mockServer }, use, testInfo) => {
      ensureBuildArtifacts();

      const app = await electron.launch({
        args: ['.', ...extraElectronArgs()],
        cwd: ROOT,
        env: getElectronEnv(mockServer.url),
      });

      const childProcess = app.process();
      childProcess.stderr?.on('data', (data) => process.stderr.write(data));
      childProcess.stdout?.on('data', (data) => process.stdout.write(data));

      try {
        await use(app);
      } finally {
        // Always close app, even on test failure
        await app.close().catch((err) => {
          console.error('[fixture] Error closing Electron app:', err);
        });
      }
    },
    { scope: 'test' },
  ],

  // Main window fixture
  mainWindow: [
    async ({ electronApp }, use) => {
      const window = await electronApp.waitForEvent('window', { timeout: 60_000 });

      window.on('console', (message) => {
        console.info('[renderer]', message.type(), message.text());
      });

      await window.evaluate(() => {
        console.info('[renderer] console hook confirmation');
      });
      await window.waitForLoadState('domcontentloaded');

      await use(window);
    },
    { scope: 'test' },
  ],

  // Test bridge fixture - reserved for future use
  testBridge: [
    async ({ electronApp }, use) => {
      await use({
        evaluate: electronApp.evaluate.bind(electronApp),
      });
    },
    { scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
export { ROOT, launchElectronApp, findStickyWindow } from '../helpers/build-check';
export type { ElectronApplication, Page };
