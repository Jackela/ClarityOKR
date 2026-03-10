import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import type { BrowserWindow } from 'electron';
import { existsSync, promises as fs } from 'node:fs';
import getPort from 'get-port';
import {
  ROOT,
  SESSION_PERSIST_PATH,
  OKR_PERSIST_PATH,
  extraElectronArgs,
  getElectronEnv,
  ensureBuildArtifacts,
} from '../helpers/build-check';
import { SimpleMockServer } from '../helpers/simple-mock-server';
import type { MockResponseConfig } from '@clarityokr/contracts';

/**
 * E2E test fixtures interface.
 * Defines all available fixtures for E2E tests.
 */
type E2EFixtures = {
  /**
   * Mock server for controlling LLM API responses.
   * Uses a simple HTTP server to respond to requests from Electron main process.
   * Each test gets a fresh mock server instance.
   */
  mockServer: {
    /** The URL of the mock server */
    url: string;
    /** Configure response behavior */
    setResponses: (config: MockResponseConfig) => Promise<void>;
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
 * Enhanced test fixture with HTTP-based mocking.
 *
 * Key improvements:
 * - Simple HTTP server for reliable request interception
 * - Works across process boundaries (test runner &lt;-\u003e Electron)
 * - Automatic cleanup on test failure
 * - Better error handling and logging
 */
export const test = base.extend<E2EFixtures>({
  // Mock server fixture - uses HTTP server for Electron compatibility
  mockServer: [
    async ({}, use) => {
      const server = new SimpleMockServer();
      // Use fixed port 7777 in CI to match LLM_BASE_URL env var, dynamic port locally
      const port = process.env.CI ? 7777 : await getPort();
      await server.start(port);

      await use({
        url: server.getUrl(),
        // 🔴 FIX: Wait for pending requests before setting responses
        setResponses: async (config: MockResponseConfig) => {
          await server.waitForPendingRequests();
          server.setResponses(config);
        },
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

      // 🔴 FIX 1: 在启动 Electron 之前清理
      await cleanupPersistenceFiles();

      // 🔴 FIX 2: CI 环境中添加短暂延迟确保文件系统操作完成
      if (process.env.CI) {
        await new Promise((r) => setTimeout(r, 200));
      }

      // 3. 启动 Electron
      const app = await electron.launch({
        args: ['.', ...extraElectronArgs()],
        cwd: ROOT,
        env: getElectronEnv(mockServer.url),
      });

      const childProcess = app.process();
      const stderrHandler = (data: Buffer) => process.stderr.write(data);
      const stdoutHandler = (data: Buffer) => process.stdout.write(data);
      childProcess.stderr?.on('data', stderrHandler);
      childProcess.stdout?.on('data', stdoutHandler);

      try {
        await use(app);
      } finally {
        // 🔴 FIX 3: 先关闭所有窗口
        await app
          .evaluate(({ BrowserWindow }) => {
            BrowserWindow.getAllWindows().forEach((w) => {
              try {
                w.close();
              } catch {}
            });
          })
          .catch(() => {});

        // 移除事件监听
        childProcess.stderr?.off('data', stderrHandler);
        childProcess.stdout?.off('data', stdoutHandler);

        // 关闭应用
        await app.close().catch((err) => {
          console.error('[fixture] Error closing Electron app:', err);
        });

        // 🔴 FIX 4: 再次清理持久化文件
        await cleanupPersistenceFiles();
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
