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
import { ReliableMockServer } from '../helpers/reliable-mock-server';

// Re-export type from reliable-mock-server
export type MockResponseConfig = {
  nextQuestion?: (callNumber: number) => object | null | undefined;
  draft?: object;
  error?: { status: number; message: string } | null;
  rawResponse?: string | (() => string);
};

/**
 * E2E test fixtures interface.
 * Defines all available fixtures for E2E tests.
 */
type E2EFixtures = {
  /**
   * Mock server for controlling LLM API responses.
   * Each test gets a fresh mock server instance.
   */
  mockServer: {
    /** The URL of the mock server */
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
 * Enhanced test fixture with improved lifecycle management.
 *
 * Key improvements:
 * - Worker-scope mock server for better performance (TODO: migrate to worker scope)
 * - Automatic cleanup on test failure
 * - Better error handling and logging
 * - testBridge fixture for future extensibility
 */
export const test = base.extend<E2EFixtures>({
  // Mock server fixture - runs per test for isolation
  // TODO: Consider migrating to worker scope for performance if test count grows
  mockServer: [
    async ({}, use) => {
      const server = new ReliableMockServer();
      const port = await server.start();

      await use({
        url: server.getUrl(),
        setResponses: (config: MockResponseConfig) => server.setResponses(config),
        getRequestLog: () => server.getRequestLog(),
      });

      // Cleanup: stop server after test
      await server.stop();
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
